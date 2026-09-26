# AgentSpeak AI — AI-Powered Two-Way Calling Agent

A production-oriented MVP of an AI outbound calling agent: the agent contacts a customer
(Browser Voice Demo over the microphone, or Twilio when configured), conducts a natural two-way
spoken conversation with **explicit agentic state**, extracts structured lead information,
persists the complete conversation in **PostgreSQL**, generates an **AI summary** after the call,
and exposes everything through a professional admin dashboard.

> **Demo-mode honesty note:** with no telephony credentials the system runs in **Browser Voice
> Demo** mode — microphone in, AI voice out over WebSocket. Conversations are simulated, and the UI
> never presents them as real phone calls. The calling layer is modular
> (`CallingProvider` interface); `TwilioCallingProvider` implements real outbound dialing via the
> Twilio REST API and activates with credentials alone — no agent-code changes.

---

## Architecture

```mermaid
flowchart TD
    Admin["Admin Dashboard (React + Vite/Next.js-style SPA)"] -->|"REST + WebSocket"| API["FastAPI Backend (Python)"]
    API --> Agent["Agent Orchestrator (app/agents/orchestrator.py)"]
    Agent --> State["Conversation State (agent_states table)"]
    Agent --> LLM["LLMProvider — OpenAI-compatible chat API (gpt-4o-mini)"]
    Agent --> Calling["CallingProvider — BrowserCallingProvider | TwilioCallingProvider"]
    Agent --> DB[("PostgreSQL — customers, calls, conversation_messages,\ncall_summaries, agent_states, call_events,\ncampaigns, scheduled_calls, orders, comments, knowledge")]
    Voice["Browser STT (Web Speech API) + TTS (SpeechSynthesis)"] <-->|"audio in / speech out"| Customer["Customer (browser demo session)"]
    Voice <-->|"transcript frames"| WS["WebSocket /ws/calls/{id}"]
    WS --> Agent
```

Text form of the flow:

```
Admin Dashboard → Start Call → FastAPI POST /api/calls
    → CallingProvider.initiate_call()          (browser session | Twilio REST)
    → POST /api/calls/{id}/agent/greeting      (AI opening message persisted)
    → WebSocket /ws/calls/{id}                 (real-time channel)
        customer speech → browser STT → {"type":"customer_message"}
        → Agent Orchestrator: load state → LLM structured decision → persist → reply
        → {"type":"ai_message"} → browser TTS → customer hears response
    → call ends → POST /api/calls/{id}/end → AI summary from transcript → dashboard
```

### The agent loop (per customer turn)

1. Customer utterance is stored (`conversation_messages`, speaker `customer`).
2. Current `agent_states` row + last 12 transcript turns are loaded (bounded context).
3. The LLM must answer in **strict JSON**: `extracted_data`, `missing_fields`, `next_action`,
   `response`, `should_end_call`, `lead_status`.
4. The decision is coerced/validated (`agents/rules.py`) — output is never trusted blindly.
5. Extracted fields are merged into state (filled fields never re-asked); the stage machine
   advances `greeting → discovery → qualifying → closing`; lead status derives from conversation
   behaviour (rejection phrases, positivity, new fields filled — sticky).
6. State, AI message, call lead-status and follow-up flag are written to PostgreSQL.
7. The response is returned over WebSocket and spoken by TTS.

## Technology & free/trial usage (stated honestly)

| Concern  | Used here | Free? | Notes |
| -------- | --------- | ----- | ----- |
| Backend  | Python 3.10+, FastAPI, Pydantic v2, SQLAlchemy 2 async | ✔ open source | OpenAPI docs auto-served at `/docs` |
| Database | PostgreSQL (psql DDL + SQLAlchemy models, 1:1) | ✔ open source | SQLite only as the unit-test fixture |
| LLM      | Any OpenAI-compatible chat API (`gpt-4o-mini` default) | pay-as-you-go; needs `LLM_API_KEY` | Provider-agnostic via `LLMProvider`; without a key the API returns clear config errors and summaries fall back deterministically |
| STT      | Browser Web Speech API (demo mode) | ✔ free | Isolated behind `SpeechToTextProvider`; swap in Whisper/server STT without touching the agent |
| TTS      | Browser SpeechSynthesis (demo mode) | ✔ free | Isolated behind `TextToSpeechProvider` |
| Calling  | BrowserCallingProvider (demo) / TwilioCallingProvider (REST) | demo free; Twilio trial gives limited trial numbers | Trial accounts can only dial verified numbers — a known Twilio limitation, not hidden |
| Payments | Stripe Checkout via REST when `STRIPE_SECRET_KEY` set | Stripe per-transaction | Otherwise a clearly-labelled simulated checkout (no charge) |

## Project structure

```
/backend
  main.py                  FastAPI app: CORS, routers, startup, health
  app/
    config.py              pydantic-settings (.env)
    db.py                  async engine + session dependency
    models.py              SQLAlchemy models (mirror schema.sql)
    schemas.py             Pydantic request/response models
    api_customers.py       Customer CRUD
    api_calls.py           Call lifecycle + agent endpoints
    api_misc.py            Stats, campaigns, schedule, comments, knowledge, billing
    ws.py                  WebSocket /ws/calls/{id} real-time channel
    agents/
      rules.py             Pure decision rules (unit-tested)
      llm.py               LLMProvider implementation (OpenAI-compatible, httpx)
      orchestrator.py      Greeting / turn / silence / summary services
    calling/
      providers.py         CallingProvider: browser + Twilio REST
    voice/
      providers.py         STT/TTS interfaces + browser bridge docs
  tests/
    conftest.py            In-memory async DB + FakeLLM (no external APIs)
    test_rules.py          14 pure-rule unit tests
    test_api.py            17 API tests incl. mocked-LLM agent loop
    test_providers.py      Provider behaviour + credential errors
    test_live_postgres.py  Live smoke test against real PostgreSQL
  requirements.txt
  pytest.ini

/frontend  (project root — React + Vite SPA with Next.js-style routing)
  src/pages/dashboard/     Overview, Customers, Calls, CallDetail, CallConsole,
                           Catalog, CampaignDetail, Schedule, Knowledge, Billing
  src/hooks/               use-voice-call-rest (WebSocket session), use-api-resource
  src/lib/api.ts           Typed FastAPI client
  src/lib/voice/           STT/TTS browser providers

/database
  schema.sql               Canonical PostgreSQL DDL
```

## Setup instructions

1. **Clone** the repository.
2. **Backend dependencies**
   ```bash
   cd backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. **Configure environment** — create `backend/.env` (see `.env.example` at repo root):
   ```
   DATABASE_URL=postgresql+asyncpg://agentspeak:agentspeak@localhost:5432/agentspeak
   LLM_API_KEY=sk-...
   LLM_MODEL=gpt-4o-mini
   CALL_MODE=browser
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000
   ```
   Never commit real keys. Frontend: set `VITE_API_URL=http://localhost:8000`.
4. **PostgreSQL**
   ```bash
   createdb agentspeak
   psql "$DATABASE_URL" -f database/schema.sql     # or let FastAPI create tables on startup
   ```
5. **Run FastAPI**
   ```bash
   cd backend && uvicorn main:app --reload --port 8000
   ```
   OpenAPI docs: http://localhost:8000/docs
6. **Run the frontend**
   ```bash
   bun install && bun run dev      # or npm install && npm run dev
   ```
7. **Calling provider** — nothing to configure for browser demo mode. For real telephony set
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` and `CALL_MODE=telephony`.
8. **Start a test call** — sign in → Customers → Add customer → **Start Call** → allow the
   microphone → talk to the agent → End call → open the call report.

## Running tests

```bash
cd backend && python -m pytest -q
```
35 tests pass with **no network access**: pure agent rules, full API flows with a scripted
FakeLLM, provider credential handling, dashboard statistics. `tests/test_live_postgres.py`
additionally verifies the whole flow against a real PostgreSQL instance when `LIVE_DB_URL` is set.

## Database schema

`database/schema.sql` (canonical) — SQLAlchemy models mirror it exactly.

| Table | Purpose |
| ----- | ------- |
| `customers` | name, phone (validated), company, purpose, product |
| `calls` | customer FK, provider_call_id, mode, direction, status, outcome, lead_status, follow-up, duration, error |
| `conversation_messages` | call FK, speaker (customer/ai/system), message, sequence, JSONB metadata, timestamp |
| `call_summaries` | call FK (unique), summary, intent, key requirements (JSONB), budget, timeline, location, application, lead/outcome |
| `agent_states` | call FK (unique), collected JSONB, missing_fields JSONB, stage, turn count |
| `call_events` | call FK, event, detail — full audit trail (call_initiated, agent_error, customer_silent, …) |
| `campaigns` | catalog of outbound programs the agent calls about |
| `scheduled_calls` | pre-booked slots with campaign context + notes |
| `orders` | credit-pack purchases (Stripe/simulated) |
| `call_comments` | team notes per customer/call |
| `knowledge_posts` | published playbooks |

Foreign keys use `ON DELETE CASCADE` (customer→calls→messages/summaries/states/events); indexes
cover every hot query path (call transcripts by sequence, calls by customer/status, events by call).

## API documentation

Interactive OpenAPI at `/docs`. Highlights:

```
POST   /api/customers                     create (validated phone + name)
GET    /api/customers?search=             list/search
GET/PUT/DELETE /api/customers/{id}        read/update/delete (cascade)

POST   /api/calls                         initiate (dials via provider / opens browser session)
GET    /api/calls, /api/calls/{id}        list / detail
GET    /api/calls/{id}/transcript         full ordered transcript
GET    /api/calls/{id}/summary            AI summary (404 until generated)
GET    /api/calls/{id}/state              agent state (collected / missing / stage)
GET    /api/calls/{id}/events             event log
POST   /api/calls/{id}/agent/greeting     opening message
POST   /api/calls/{id}/agent/message      one agentic turn (structured JSON in/out)
POST   /api/calls/{id}/agent/silence      silence strike + escalation
POST   /api/calls/{id}/end                end call + generate summary
DELETE /api/calls/{id}/force              abandon a stuck call

WS     /ws/calls/{id}                     real-time frames (customer_message, ai_message, silence, …)

GET    /api/dashboard/stats               live metrics from DB
GET    /api/config/status                 capability report (no secrets)
+ campaigns / schedule / comments / knowledge / billing endpoints (see /docs)
```

## Error handling

| Scenario | Behaviour |
| -------- | --------- |
| LLM/API failure | Logged (`agent_error`), spoken fallback "Could you repeat that?", call survives; provider exceptions are caught and degraded |
| Customer silent | 8 s timer → escalating prompts ("Are you still there?" → "I'll wait a little longer…") → graceful end after 3 strikes, all persisted |
| Customer interrupts | Barge-in button cancels TTS and reopens the mic (WebSocket `interrupt` frame logged) |
| STT denied/unavailable | Explicit UI error state; session fails safely, call row can be force-ended |
| Invalid phone | Rejected server-side (Pydantic validator, 8–15 digits) with a clear message |
| Provider not configured | Twilio raises a descriptive error; browser mode is the default |
| Call already ended | `409 Conflict` on further turns; `force` endpoint clears stuck rows |
| Summary generation fails | Call still ends; deterministic fallback summary stored; failure logged as event |
| Backend unreachable | Dashboard shows an actionable API-unavailable banner |

## Known limitations

- **No real outbound calls in the demo environment** — Twilio trial requires a verified destination
  number and paid tier for unrestricted dialing; the browser demo demonstrates the identical agent
  architecture with a different transport.
- **Barge-in is manual** — the Web Speech API cannot cancel TTS on voice activity automatically;
  the button + WebSocket frame implement it explicitly rather than faking it.
- **STT/TTS are browser-side** in demo mode (Chrome/Edge required); the interfaces exist for a
  server-side swap.
- **Summaries/agent turns require `LLM_API_KEY`** — without it the API returns explicit
  configuration errors and deterministic fallbacks; no fake AI text is generated.
- Payments run in simulated mode unless Stripe keys are configured.

## Future improvements

- Server-side streaming STT (Whisper) and cloud TTS for lower latency and non-Chromium browsers.
- Twilio Media Streams for full-duplex audio with true VAD barge-in.
- Multilingual voice sessions; call recording storage and playback.
- Authentication/roles on the FastAPI side (currently dev-level, CORS-scoped, no secrets exposed).
- CRM integrations, human-handoff escalation, retry/queue policies for telephony scale.
