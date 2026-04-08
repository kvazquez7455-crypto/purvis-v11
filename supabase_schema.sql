-- PURVIS v11 Supabase Schema
-- Run this in your Supabase SQL Editor

-- Memory table for all conversations
CREATE TABLE IF NOT EXISTS purvis_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'kelvin',
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purvis_memory_user_id ON purvis_memory(user_id);
CREATE INDEX idx_purvis_memory_created_at ON purvis_memory(created_at);

-- Sub-agents registry
CREATE TABLE IF NOT EXISTS purvis_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  purpose TEXT,
  system_prompt TEXT,
  capabilities TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content farm outputs
CREATE TABLE IF NOT EXISTS purvis_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT DEFAULT 'kelvin',
  niche TEXT,
  platform TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API key rotation log
CREATE TABLE IF NOT EXISTS purvis_key_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT,
  key_index INTEGER,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks and workflows
CREATE TABLE IF NOT EXISTS purvis_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT DEFAULT 'kelvin',
  task_name TEXT,
  task_type TEXT,
  status TEXT DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE purvis_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE purvis_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE purvis_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE purvis_tasks ENABLE ROW LEVEL SECURITY;

-- Allow all access with service role key (backend uses service role)
CREATE POLICY "Allow all for service role" ON purvis_memory FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON purvis_agents FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON purvis_content FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON purvis_tasks FOR ALL USING (true);
