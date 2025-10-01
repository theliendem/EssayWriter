-- Run this SQL in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

-- Drop existing tables if they exist (careful - this deletes data!)
DROP TABLE IF EXISTS essay_versions CASCADE;
DROP TABLE IF EXISTS essays CASCADE;

-- Create essays table
CREATE TABLE essays (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  prompt TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Create essay_versions table
CREATE TABLE essay_versions (
  id BIGINT PRIMARY KEY,
  essay_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  prompt TEXT,
  tags TEXT,
  changes_only TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (essay_id) REFERENCES essays (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_essays_updated_at ON essays(updated_at);
CREATE INDEX IF NOT EXISTS idx_essays_deleted_at ON essays(deleted_at);
CREATE INDEX IF NOT EXISTS idx_essay_versions_essay_id ON essay_versions(essay_id);
CREATE INDEX IF NOT EXISTS idx_essay_versions_created_at ON essay_versions(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE essay_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
-- For development: Allow all operations
CREATE POLICY "Allow all operations on essays" ON essays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on essay_versions" ON essay_versions FOR ALL USING (true) WITH CHECK (true);

-- For production, you might want more restrictive policies like:
-- CREATE POLICY "Allow read access to essays" ON essays FOR SELECT USING (true);
-- CREATE POLICY "Allow insert access to essays" ON essays FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow update access to essays" ON essays FOR UPDATE USING (true);
-- CREATE POLICY "Allow delete access to essays" ON essays FOR DELETE USING (true);
