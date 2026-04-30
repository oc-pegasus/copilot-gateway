CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  account_id INTEGER,
  api_key_id TEXT,
  model TEXT,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  error_body TEXT,
  was_fallback INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_error_log_timestamp ON error_log(timestamp);
