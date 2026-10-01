-- AgentSpeak AI — PostgreSQL schema (canonical; SQLAlchemy models mirror this)
-- Apply with: psql "$DATABASE_URL" -f database/schema.sql

CREATE TABLE IF NOT EXISTS customers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL,
    phone_number    VARCHAR(32)   NOT NULL,
    company_name    VARCHAR(200),
    purpose         TEXT,
    product         VARCHAR(200),
    industry        VARCHAR(40) NOT NULL DEFAULT 'general',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry VARCHAR(40) NOT NULL DEFAULT 'general';

CREATE TABLE IF NOT EXISTS campaigns (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL,
    product         VARCHAR(200)  NOT NULL,
    description     TEXT,
    price           DOUBLE PRECISION NOT NULL DEFAULT 0,
    price_label     VARCHAR(100)  NOT NULL DEFAULT '',
    category        VARCHAR(100)  NOT NULL DEFAULT 'General',
    highlights      JSONB         NOT NULL DEFAULT '[]'::jsonb,
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
    id                    SERIAL PRIMARY KEY,
    customer_id           INTEGER      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider_call_id      VARCHAR(120),
    mode                  VARCHAR(16)  NOT NULL DEFAULT 'browser',
    direction             VARCHAR(16)  NOT NULL DEFAULT 'outbound',
    status                VARCHAR(24)  NOT NULL DEFAULT 'queued',
    outcome               VARCHAR(32)  NOT NULL DEFAULT 'pending',
    lead_status           VARCHAR(24)  NOT NULL DEFAULT 'new',
    follow_up_required    BOOLEAN      NOT NULL DEFAULT FALSE,
    silence_strike_count  INTEGER      NOT NULL DEFAULT 0,
    started_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ended_at              TIMESTAMPTZ,
    duration_seconds      INTEGER,
    error_message         TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_calls_customer ON calls(customer_id);
CREATE INDEX IF NOT EXISTS ix_calls_status   ON calls(status);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              SERIAL PRIMARY KEY,
    call_id         INTEGER      NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    speaker         VARCHAR(16)  NOT NULL,           -- customer | ai | system
    message         TEXT         NOT NULL,
    sequence_number INTEGER      NOT NULL,
    metadata        JSONB,
    timestamp       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_conv_call_seq ON conversation_messages(call_id, sequence_number);

CREATE TABLE IF NOT EXISTS call_summaries (
    id                  SERIAL PRIMARY KEY,
    call_id             INTEGER      NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
    summary             TEXT         NOT NULL,
    customer_intent     TEXT,
    key_requirements    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    budget              VARCHAR(200),
    timeline            VARCHAR(200),
    location            VARCHAR(200),
    application         VARCHAR(200),
    follow_up_required  BOOLEAN      NOT NULL DEFAULT FALSE,
    lead_status         VARCHAR(24)  NOT NULL DEFAULT 'new',
    outcome             VARCHAR(32)  NOT NULL DEFAULT 'pending',
    generated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_states (
    id              SERIAL PRIMARY KEY,
    call_id         INTEGER      NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
    collected       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    missing_fields  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    stage           VARCHAR(24)  NOT NULL DEFAULT 'greeting',
    turn_count      INTEGER      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_events (
    id          SERIAL PRIMARY KEY,
    call_id     INTEGER      NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    event       VARCHAR(64)  NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_events_call ON call_events(call_id);

CREATE TABLE IF NOT EXISTS scheduled_calls (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    campaign_id     INTEGER      REFERENCES campaigns(id) ON DELETE SET NULL,
    campaign_name   VARCHAR(200),
    scheduled_for   TIMESTAMPTZ  NOT NULL,
    notes           TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'scheduled',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    user_email    VARCHAR(200) NOT NULL,
    pack_key      VARCHAR(40)  NOT NULL,
    pack_name     VARCHAR(100) NOT NULL,
    credits       INTEGER      NOT NULL,
    amount_usd    DOUBLE PRECISION NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
    provider      VARCHAR(24)  NOT NULL DEFAULT 'simulated',
    provider_ref  VARCHAR(200),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    paid_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS call_comments (
    id            SERIAL PRIMARY KEY,
    call_id       INTEGER      REFERENCES calls(id) ON DELETE CASCADE,
    customer_id   INTEGER      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    author        VARCHAR(200) NOT NULL DEFAULT 'Team member',
    body          TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_posts (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    body         TEXT         NOT NULL,
    summary      TEXT,
    author       VARCHAR(200) NOT NULL DEFAULT 'Team member',
    published    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
