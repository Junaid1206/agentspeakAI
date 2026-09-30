# AgentSpeak AI — AI-Powered Two-Way Calling Agent

An AI outbound calling-agent MVP built with FastAPI, PostgreSQL, an OpenAI-compatible LLM, browser speech APIs, and a Next.js admin console. It supports a browser-based voice demo and a modular Twilio outbound-calling provider.

> **Demo-mode note:** Browser mode is a simulated call session, not a real telephone call. Real outbound dialing requires valid Twilio credentials and is subject to the account's trial restrictions.

## Architecture

```mermaid
flowchart TD
  Admin[Next.js Admin Console] -->|REST| API[FastAPI]
  Admin <-->|WebSocket voice session| API
  API --> Agent[Agent Orchestrator]
  Agent --> LLM[OpenAI-compatible LLM]
  Agent --> DB[(PostgreSQL)]
  API --> Calling[Calling Provider]
  Calling --> Browser[Browser demo]
  Calling --> Twilio[Twilio REST API]
  Browser <-->|Microphone / speech| User[Customer in browser]
```

The orchestrator maintains a structured state for each call, uses recent transcript context to choose the next action, validates the decision, stores messages and extracted requirements, and generates a summary when the call ends.

## Technology

| Layer | Technology | Notes |
|---|---|---|
| Backend | Python 3.10+, FastAPI, SQLAlchemy async | REST + WebSocket |
| Database | PostgreSQL, asyncpg | SQLite is used only by unit-test fixtures |
| LLM | OpenAI-compatible chat completions | Configure endpoint, model and key; API usage may incur cost |
| STT | Browser Web Speech API | Browser demo; supported browser required |
| TTS | Browser SpeechSynthesis | Browser demo |
| Calling | Browser demo / Twilio REST | Trial phone-number verification and other limits may apply |
| Admin | Next.js 15, React 19, TypeScript | Located in `frontend/` |

The repository root also contains the original Vite-based interface; the assignment-oriented Next.js console is in `frontend/`.

## Project structure

```
backend/
  main.py
  app/
    agents/       # LLM, rules, conversation orchestrator
    calling/      # Browser and Twilio providers
    voice/        # STT/TTS provider interfaces
    api_calls.py
    api_customers.py
    api_misc.py
    ws.py
    models.py
    schemas.py
    config.py
  tests/
database/
  schema.sql
frontend/
  app/            # Next.js App Router admin console
  package.json
  tsconfig.json
.env.example
```

## Local setup

### 1. PostgreSQL

Create a database named `agentspeak`, then configure the connection string in `backend/.env`. The default local example is:

```env
DATABASE_URL=postgresql+asyncpg://agentspeak:agentspeak@localhost:5432/agentspeak
```

You can provision the schema manually with `psql "$DATABASE_URL" -f database/schema.sql`; the FastAPI startup also creates missing tables from SQLAlchemy models.

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
```

Copy the root `.env.example` to `backend/.env` and edit the values. Start the API:

```bash
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

### 3. Next.js admin console

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the frontend:

```bash
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` and then `npm start`.

## Demo workflow

1. Start PostgreSQL and the FastAPI backend.
2. Start the Next.js frontend.
3. Add a customer in the admin console.
4. Select **Start demo call** / create a browser-mode call.
5. Use the browser voice console for the two-way speech workflow supported by the existing Vite interface; the Next.js admin console displays call records, transcripts, and available summaries.

For real outbound calls, set `CALL_MODE=telephony` and provide `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`. A public callback URL and provider-side voice/media configuration may also be needed for a complete live phone conversation. Do not commit secrets.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/customers` | Create a customer |
| GET | `/api/customers` | List/search customers |
| POST | `/api/calls` | Create a browser or telephony call |
| GET | `/api/calls` | List calls |
| GET | `/api/calls/{id}` | Call details |
| GET | `/api/calls/{id}/transcript` | Ordered transcript |
| GET | `/api/calls/{id}/summary` | Call summary |
| GET | `/api/calls/{id}/state` | Agent's collected/missing fields |
| POST | `/api/calls/{id}/agent/greeting` | Generate opening message |
| POST | `/api/calls/{id}/agent/message` | Process one customer turn |
| POST | `/api/calls/{id}/end` | End call and generate summary |
| GET | `/api/dashboard/stats` | Dashboard metrics |
| WS | `/ws/calls/{id}` | Real-time call session |

See `/docs` for request and response schemas.

## Database

The canonical schema is `database/schema.sql`. Core tables include `customers`, `calls`, `conversation_messages`, `call_summaries`, `agent_states`, and `call_events`. JSONB stores extracted requirements and structured metadata.

## Tests

```bash
cd backend
python -m pytest -q
```

The test suite uses a fake LLM and an isolated SQLite fixture for deterministic tests. Set `LIVE_DB_URL` to run the optional live PostgreSQL smoke test.

## Limitations

- Browser calling is a demonstration and does not dial a phone number.
- Twilio trial accounts restrict outbound calling (for example, destination verification may be required).
- Browser speech recognition depends on browser support and microphone permission.
- The Next.js admin console is a separate assignment-oriented interface; voice capture is currently handled by the existing browser voice console.
- LLM calls require a compatible API key and may incur usage charges. Without a configured key, only explicitly supported fallback paths are available.
- Authentication, role-based access control, production telephony callbacks, and full duplex media streaming require further hardening before public production use.
