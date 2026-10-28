CREATE TABLE IF NOT EXISTS feedback_threads (
 id text PRIMARY KEY, request_id text UNIQUE NOT NULL, token_hash bytea NOT NULL,
 payload_hash bytea NOT NULL, description text NOT NULL, role text NOT NULL DEFAULT '',
 goal text NOT NULL DEFAULT '', impact text NOT NULL DEFAULT '', contact text NOT NULL DEFAULT '',
 notify boolean NOT NULL DEFAULT false, technical_info jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'received', owner_name text NOT NULL DEFAULT '',
 fix_version text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, deletion_pending boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS feedback_messages (
 id text PRIMARY KEY, thread_id text NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
 request_id text NOT NULL, payload_hash bytea NOT NULL, author text NOT NULL CHECK(author IN ('user','handler')),
 description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(thread_id,request_id)
);
CREATE TABLE IF NOT EXISTS feedback_attachments (
 id text PRIMARY KEY, thread_id text NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
 message_id text REFERENCES feedback_messages(id) ON DELETE CASCADE,
 name text NOT NULL, media_type text NOT NULL, size_bytes bigint NOT NULL, sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), deletion_pending boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS feedback_expiry ON feedback_threads(expires_at);
-- Short-lived opaque receipt tombstones prevent an uncertain retry recreating deleted content.
CREATE TABLE IF NOT EXISTS feedback_requests (
 request_hash bytea PRIMARY KEY, token_hash bytea NOT NULL, thread_id text,
 deleted boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL
);

-- Minimal private audit: no body, contact, IP, filenames or credentials.
CREATE TABLE IF NOT EXISTS feedback_events (
 id bigserial PRIMARY KEY, thread_id text NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
 action text NOT NULL, actor text NOT NULL CHECK(actor IN ('user','handler','system')),
 created_at timestamptz NOT NULL DEFAULT now()
);
