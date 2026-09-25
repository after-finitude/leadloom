-- Assistant replies are saved hidden while the model phrases them, then published.
ALTER TABLE messages ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS messages_pending ON messages(created_at) WHERE pending=1;
