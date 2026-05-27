-- Migration: Add github_account_id to api_keys for per-key backend routing
ALTER TABLE api_keys ADD COLUMN github_account_id INTEGER REFERENCES github_accounts(user_id) ON DELETE SET NULL;
