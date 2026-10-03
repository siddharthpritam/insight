CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  CHECK (length(name) <= 80),
  CHECK (length(question) BETWEEN 10 AND 3000),
  CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 12000)
);
CREATE INDEX questions_public_order ON questions(hidden, created_at DESC, id DESC);
