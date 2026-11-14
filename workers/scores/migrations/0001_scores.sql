CREATE TABLE IF NOT EXISTS score_snapshots (day TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS score_attempts (id TEXT PRIMARY KEY, attempted_at TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, error_code TEXT);
CREATE TABLE IF NOT EXISTS score_leases (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS score_provider_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
