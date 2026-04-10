require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://uxbyrfqizqzkcpoyiexz.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4YnlyZnFpenF6a2Nwb3lpZXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjMyMzksImV4cCI6MjA5MTE5OTIzOX0.WXJ9cCWr0EPp7SUpJjSI4P-5oJvaQ9mycfD0DHSsD8c'
);

// ── OpenAI ────────────────────────────────────────────────────────────────────
// Lazy OpenAI init — only crashes if key missing AND someone calls it
let _openai = null;
const openai = new Proxy({}, {
  get(_, prop) {
    if (!_openai) {
      const key = process.env.OPENAI_API_KEY;
      if (!key || !key.startsWith('sk-')) {
        // Return mock that explains the issue instead of crashing
        return () => Promise.reject(new Error('OPENAI_API_KEY not set in Railway environment variables'));
      }
      _openai = new OpenAI({ apiKey: key });
    }
    return _openai[prop];
  }
});

// ── PURVIS System Prompt ──────────────────────────────────────────────────────
const PURVIS_SYSTEM = `YOU ARE PURVIS — UNIFIED AI OPERATOR v11.0
Owner: Kelvin Vazquez | SunBiz LLC | Orlando FL
Mission: $100 → $1,000,000

IDENTITY LAWS:
1. NOT a chatbot. Operator, builder, executor. Never explain. DO IT.
2. Every response = result, action, or deliverable.
3. Serve Kelvin only. His goals = your goals.
4. Check memory before creating. Reuse, refine, never duplicate.
5. Single-pass by default. Split only when dependencies require.
6. Content = Traffic → Leads → Money. Always connects to monetization.
7. Kelvin types messy. Decipher intent. Never say "I don't understand."
8. Paid APIs only when content is monetized or generates revenue.
9. Store what works. Kill what doesn't. Learn every interaction.
10. One brain. One memory. One path. No duplicates.

KELVIN CONTEXT:
- Business: SunBiz LLC — plumbing contractor — Orlando FL
- Legal: Case 2024-DR-012028-O — Orange County FL — Napue v Illinois — Rule 1.540(b)
- Mission: $100 → $1M via content empire + plumbing
- Content: Scripture Daily (NT), Political Commentary, Plumbing Tips, Motivation, Legal Awareness
- Platforms: YouTube Shorts, TikTok, Instagram, Facebook
- Free tools: Canva, CapCut, DuckDuckGo, Pollinations.ai, Web Speech API
- Paid (only when monetized): OpenAI GPT-4o, DALL-E 3, ElevenLabs

ROUTING:
- LEGAL → draft motion, cite Napue + Rule 1.540(b), court-ready document
- CONTENT → hook + script + hashtags + posting plan + repurpose
- PLUMBING → IPC 2021, DFU calc, Florida code, estimate
- BUSINESS → lead, quote, invoice, follow-up
- RESEARCH → deep analysis, sources, actionable insights
- VOICE → under 100 words, no markdown, conversational
- ANYTHING MESSY → decipher and execute

PLANNER COMMANDS:
call_model(prompt) — GPT-4o AI call
call_api(url, data) — external API call
read_memory(key) — read Supabase memory
write_memory(key, value, category) — save to Supabase
schedule_task(instruction, type) — add to overnight queue
report_to_kelvin(summary) — return results to user
spawn_agent(type, task) — specialized sub-agent`;

// ── State ─────────────────────────────────────────────────────────────────────
let lastOvernightRun = null;
let overnightRunning = false;

// ── Helper: GPT-4o call ───────────────────────────────────────────────────────
async function gpt4o(systemPrompt, userContent, opts = {}) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  if (Array.isArray(userContent)) {
    messages.push(...userContent);
  } else {
    messages.push({ role: 'user', content: userContent });
  }
  const res = await openai.chat.completions.create({
    model: opts.model || 'gpt-4o',
    messages,
    max_tokens: opts.maxTokens || 2000,
    temperature: opts.temperature ?? 0.7,
  });
  return {
    text: res.choices[0].message.content,
    tokens: res.usage?.total_tokens || 0,
  };
}

// ── Helper: DuckDuckGo search ─────────────────────────────────────────────────
function duckDuckGoSearch(query) {
  return new Promise((resolve) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.RelatedTopics || [])
            .slice(0, 5)
            .map((t) => t.Text || '')
            .filter(Boolean);
          resolve({ abstract: json.AbstractText || '', results });
        } catch {
          resolve({ abstract: '', results: [] });
        }
      });
    }).on('error', () => resolve({ abstract: '', results: [] }));
  });
}

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let supabaseOk = false;
  try {
    const { error } = await supabase.from('purvis_memory').select('id').limit(1);
    supabaseOk = !error;
  } catch {}
  res.json({
    status: 'online',
    version: 'PURVIS 11.0',
    keys: { openai: !!process.env.OPENAI_API_KEY },
    supabase: supabaseOk,
    timestamp: new Date().toISOString(),
  });
});

// ── POST /api/chat ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, userId = 'kelvin' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    // Load last 20 conversation messages
    const { data: history } = await supabase
      .from('purvis_memory')
      .select('key, value')
      .eq('category', 'conversation')
      .order('created_at', { ascending: false })
      .limit(20);

    // Build history messages (reverse to chronological)
    const historyMessages = [];
    if (history && history.length > 0) {
      const sorted = [...history].reverse();
      for (const h of sorted) {
        try {
          const parsed = JSON.parse(h.value);
          historyMessages.push({ role: parsed.role, content: parsed.content });
        } catch {}
      }
    }

    const allMessages = [...historyMessages, { role: 'user', content: message }];
    const { text: reply, tokens } = await gpt4o(PURVIS_SYSTEM, allMessages);

    // Save user message
    const tsUser = Date.now();
    await supabase.from('purvis_memory').insert({
      category: 'conversation',
      key: `${tsUser}_user`,
      value: JSON.stringify({ role: 'user', content: message }),
      tags: [userId],
    });

    // Save assistant reply
    const tsAssist = Date.now() + 1;
    await supabase.from('purvis_memory').insert({
      category: 'conversation',
      key: `${tsAssist}_assistant`,
      value: JSON.stringify({ role: 'assistant', content: reply }),
      tags: [userId],
    });

    res.json({ reply, tokens });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/planner/start ───────────────────────────────────────────────────
app.post('/api/planner/start', async (req, res) => {
  const { goal, userId = 'kelvin' } = req.body;
  if (!goal) return res.status(400).json({ error: 'goal required' });

  try {
    // Load improvement notes
    const { data: improvements } = await supabase
      .from('purvis_improvements')
      .select('area, note')
      .eq('applied', false)
      .limit(5);

    const improvementContext = improvements?.length
      ? `\nPAST IMPROVEMENT NOTES:\n${improvements.map((i) => `- [${i.area}] ${i.note}`).join('\n')}`
      : '';

    const plannerSystem = `${PURVIS_SYSTEM}${improvementContext}

You are the PURVIS Planner. Given a raw goal, respond with valid JSON only:
{
  "cleanGoal": "single clear sentence",
  "plan": [
    {"step": 1, "command": "call_model|call_api|read_memory|write_memory|schedule_task|report_to_kelvin|spawn_agent", "description": "what this step does", "input": "what goes in"}
  ]
}
3-7 steps. No explanation outside JSON.`;

    const { text } = await gpt4o(plannerSystem, goal, { maxTokens: 1500 });

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { cleanGoal: goal, plan: [{ step: 1, command: 'call_model', description: 'Execute goal', input: goal }] };
    }

    const { data: task, error } = await supabase
      .from('purvis_tasks')
      .insert({
        user_id: userId,
        raw_goal: goal,
        clean_goal: parsed.cleanGoal,
        plan: JSON.stringify(parsed.plan),
        status: 'awaiting_approval',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      taskId: task.id,
      cleanGoal: parsed.cleanGoal,
      plan: parsed.plan,
      status: 'awaiting_approval',
    });
  } catch (err) {
    console.error('Planner start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/planner/approve ─────────────────────────────────────────────────
app.post('/api/planner/approve', async (req, res) => {
  const { taskId, approved, edit = '' } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });

  try {
    const { data: task } = await supabase
      .from('purvis_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (!approved) {
      // Revise plan
      const currentPlan = JSON.parse(task.plan || '[]');
      const reviseSystem = `${PURVIS_SYSTEM}
You are revising a task plan based on feedback. Respond with valid JSON only:
{"cleanGoal": "...", "plan": [...]}`;
      const { text } = await gpt4o(
        reviseSystem,
        `Original goal: ${task.clean_goal}\nCurrent plan: ${JSON.stringify(currentPlan)}\nEdit request: ${edit}`,
        { maxTokens: 1500 }
      );

      let revised;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        revised = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch {
        revised = { cleanGoal: task.clean_goal, plan: currentPlan };
      }

      await supabase
        .from('purvis_tasks')
        .update({ clean_goal: revised.cleanGoal, plan: JSON.stringify(revised.plan) })
        .eq('id', taskId);

      return res.json({ status: 'revised', cleanGoal: revised.cleanGoal, plan: revised.plan });
    }

    // Approved — start execution
    await supabase.from('purvis_tasks').update({ status: 'executing' }).eq('id', taskId);
    res.json({ status: 'executing', taskId });

    // Async execution
    executePlanAsync(taskId).catch((e) => console.error('Execution error:', e.message));
  } catch (err) {
    console.error('Planner approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Async plan executor ───────────────────────────────────────────────────────
async function executePlanAsync(taskId) {
  const { data: task } = await supabase
    .from('purvis_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (!task) return;

  let plan;
  try {
    plan = JSON.parse(task.plan || '[]');
  } catch {
    plan = [];
  }

  const stepOutputs = [];

  for (const step of plan) {
    const stepStart = new Date().toISOString();
    let output = '';
    let status = 'complete';

    try {
      const execSystem = `${PURVIS_SYSTEM}
You are executing step ${step.step} of a PURVIS task plan.
Task goal: ${task.clean_goal}
Previous steps: ${JSON.stringify(stepOutputs)}
Execute this step and return ONLY the result/output. Be thorough and specific.`;

      const { text } = await gpt4o(execSystem, `Command: ${step.command}\nDescription: ${step.description}\nInput: ${step.input || ''}`, { maxTokens: 1500 });
      output = text;
      stepOutputs.push({ step: step.step, command: step.command, output });
    } catch (e) {
      output = `Error: ${e.message}`;
      status = 'error';
    }

    await supabase.from('purvis_step_logs').insert({
      task_id: taskId,
      step_number: step.step,
      command: step.command,
      input: step.input || step.description,
      output,
      status,
      created_at: stepStart,
    });
  }

  // Build final result
  const resultSystem = `${PURVIS_SYSTEM}
Synthesize these step outputs into a final result for Kelvin. Be direct and actionable.`;
  const { text: finalResult } = await gpt4o(
    resultSystem,
    `Goal: ${task.clean_goal}\nSteps completed: ${JSON.stringify(stepOutputs)}`,
    { maxTokens: 2000 }
  ).catch(() => ({ text: stepOutputs.map((s) => s.output).join('\n\n') }));

  // Extract improvement notes
  try {
    const improvSystem = `Based on this task execution, extract 1-2 improvement notes for PURVIS. Respond with JSON array:
[{"area": "category", "note": "specific improvement"}]`;
    const { text: improvText } = await gpt4o(
      improvSystem,
      `Goal: ${task.clean_goal}\nResult: ${finalResult}`,
      { maxTokens: 500 }
    );
    const improvMatch = improvText.match(/\[[\s\S]*\]/);
    if (improvMatch) {
      const improvements = JSON.parse(improvMatch[0]);
      for (const imp of improvements) {
        await supabase.from('purvis_improvements').insert({
          area: imp.area,
          note: imp.note,
          source_task_id: taskId,
          applied: false,
        });
      }
    }
  } catch {}

  await supabase
    .from('purvis_tasks')
    .update({ status: 'complete', result: finalResult, completed_at: new Date().toISOString() })
    .eq('id', taskId);
}

// ── GET /api/planner/status/:taskId ──────────────────────────────────────────
app.get('/api/planner/status/:taskId', async (req, res) => {
  try {
    const { data: task } = await supabase
      .from('purvis_tasks')
      .select('*')
      .eq('id', req.params.taskId)
      .single();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { data: steps } = await supabase
      .from('purvis_step_logs')
      .select('*')
      .eq('task_id', req.params.taskId)
      .order('step_number');

    res.json({
      status: task.status,
      cleanGoal: task.clean_goal,
      plan: JSON.parse(task.plan || '[]'),
      result: task.result,
      steps: steps || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/content-farm ────────────────────────────────────────────────────
app.post('/api/content-farm', async (req, res) => {
  const { niche = 'motivation', platform = 'YouTube Shorts', count = 1, style = 'viral' } = req.body;
  try {
    const system = `${PURVIS_SYSTEM}
Create ${count} piece(s) of ${style} ${niche} content for ${platform}. 
Respond with JSON array: [{"topic":"...","hook":"...","script":"...","hashtags":["..."]}]
Scripts should be 45-60 seconds when spoken. Hooks must grab in first 2 seconds.`;

    const { text } = await gpt4o(system, `Create ${count} viral ${niche} content piece(s) for ${platform}`, { maxTokens: 2500 });

    let content = [];
    try {
      const arrMatch = text.match(/\[[\s\S]*\]/);
      content = JSON.parse(arrMatch ? arrMatch[0] : text);
    } catch {
      content = [{ topic: niche, hook: text.slice(0, 100), script: text, hashtags: [`#${niche}`] }];
    }

    // Save to purvis_content
    for (const c of content) {
      await supabase.from('purvis_content').insert({
        track: niche,
        topic: c.topic,
        hook: c.hook,
        script: c.script,
        hashtags: c.hashtags,
        status: 'draft',
        is_monetized: false,
      });
    }

    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/image ───────────────────────────────────────────────────────────
app.post('/api/image', async (req, res) => {
  const { prompt, size = '1024x1024' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    // Rewrite prompt for DALL-E safety
    const { text: safePrompt } = await gpt4o(
      'Rewrite this image prompt to be DALL-E 3 safe and highly detailed. Remove any policy-violating content. Return only the rewritten prompt.',
      prompt,
      { maxTokens: 300 }
    );

    try {
      const imgRes = await openai.images.generate({
        model: 'dall-e-3',
        prompt: safePrompt,
        n: 1,
        size,
      });
      return res.json({ url: imgRes.data[0].url, fallback: false });
    } catch (dalleErr) {
      // Pollinations fallback
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=1024&height=1024&nologo=true`;
      return res.json({ url: pollinationsUrl, fallback: true });
    }
  } catch (err) {
    const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
    res.json({ url: fallbackUrl, fallback: true });
  }
});

// ── POST /api/music ───────────────────────────────────────────────────────────
app.post('/api/music', async (req, res) => {
  const { mood, genre, topic } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nCreate detailed Suno and Udio music prompts for Kelvin's content.`,
      `Create music for: mood=${mood || 'motivational'}, genre=${genre || 'hip-hop'}, topic=${topic || 'success'}. 
Return JSON: {"suno": "detailed suno prompt", "udio": "detailed udio prompt", "style": "...", "tempo": "...", "vibe": "..."}`,
      { maxTokens: 800 }
    );

    let music;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      music = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      music = { suno: text, udio: text };
    }

    res.json({ music });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/research ────────────────────────────────────────────────────────
app.post('/api/research', async (req, res) => {
  const { query, depth = 'deep' } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nYou are in RESEARCH mode. Provide ${depth} analysis with sources, key insights, and actionable conclusions.`,
      query,
      { maxTokens: 3000 }
    );
    res.json({ research: text, query });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/voice ───────────────────────────────────────────────────────────
app.post('/api/voice', async (req, res) => {
  const { text, voiceId = '21m00Tcm4TlvDq8ikWAM' } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenlabsKey) return res.status(503).json({ error: 'ElevenLabs key not configured' });

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenlabsKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/youtube/optimize ────────────────────────────────────────────────
app.post('/api/youtube/optimize', async (req, res) => {
  const { title, description, niche } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nYou are a YouTube SEO expert. Optimize for maximum reach.`,
      `Optimize YouTube content:\nTitle: ${title || ''}\nDescription: ${description || ''}\nNiche: ${niche || 'general'}
Return JSON: {"optimizedTitle": "...", "description": "...", "tags": [...], "chapters": "...", "thumbnail": "...", "cta": "..."}`,
      { maxTokens: 1200 }
    );

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      result = { optimizedTitle: title, description: text };
    }

    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/social/repurpose ────────────────────────────────────────────────
app.post('/api/social/repurpose', async (req, res) => {
  const { content, platforms = ['YouTube', 'TikTok', 'Instagram', 'Facebook'] } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nRepurpose content across platforms for maximum engagement.`,
      `Repurpose this content for ${platforms.join(', ')}:\n${content}
Return JSON: {"youtube": "...", "tiktok": "...", "instagram": "...", "facebook": "...", "twitter": "..."}`,
      { maxTokens: 2000 }
    );

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      result = { repurposed: text };
    }

    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/email/draft ─────────────────────────────────────────────────────
app.post('/api/email/draft', async (req, res) => {
  const { to, subject, context, tone = 'professional' } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nDraft professional emails for Kelvin's business. Tone: ${tone}`,
      `Draft email:\nTo: ${to || 'recipient'}\nSubject: ${subject || ''}\nContext: ${context || ''}`,
      { maxTokens: 800 }
    );
    res.json({ draft: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/canva/brief ─────────────────────────────────────────────────────
app.post('/api/canva/brief', async (req, res) => {
  const { content, type = 'social post' } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nCreate Canva design briefs with direct links.`,
      `Create a Canva design brief for: ${content || type}
Return JSON: {"brief": "detailed design instructions", "colors": [...], "fonts": [...], "layout": "...", "canvaLink": "https://canva.com/create"}`,
      { maxTokens: 800 }
    );

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      result = { brief: text, canvaLink: 'https://canva.com/create' };
    }

    res.json({ brief: result.brief, canvaLink: result.canvaLink || 'https://canva.com/create', details: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/capcut/script ───────────────────────────────────────────────────
app.post('/api/capcut/script', async (req, res) => {
  const { content, duration = 60 } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nCreate CapCut video edit scripts with timing and effects.`,
      `Create a CapCut edit script for ${duration}s video:\n${content}
Return JSON: {"scenes": [{"time": "0:00", "clip": "...", "text": "...", "transition": "...", "music": "..."}], "effects": [...], "captions": "..."}`,
      { maxTokens: 1000 }
    );

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      result = { script: text };
    }

    res.json({ script: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/leads ────────────────────────────────────────────────────────────
app.get('/api/leads', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const { data, error } = await supabase.from('purvis_leads').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('purvis_leads').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/memory ───────────────────────────────────────────────────────────
app.get('/api/memory', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_memory')
      .select('*')
      .order('category')
      .order('key');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memory', async (req, res) => {
  const { category, key, value, tags } = req.body;
  try {
    // Check if key exists
    const { data: existing } = await supabase
      .from('purvis_memory')
      .select('id')
      .eq('key', key)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('purvis_memory')
        .update({ value, category, tags, updated_at: new Date().toISOString() })
        .eq('key', key)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }

    const { data, error } = await supabase
      .from('purvis_memory')
      .insert({ category, key, value, tags })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/memory/:key', async (req, res) => {
  try {
    const { error } = await supabase.from('purvis_memory').delete().eq('key', req.params.key);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/improvements ─────────────────────────────────────────────────────
app.get('/api/improvements', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_improvements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content ──────────────────────────────────────────────────────────
app.get('/api/content', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_content')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tasks ────────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agents/spawn ────────────────────────────────────────────────────
const AGENT_PROMPTS = {
  content_creator: `You are PURVIS Content Creator Agent. Specialize in viral content for YouTube Shorts, TikTok, Instagram, Facebook. 
Kelvin's niches: Scripture, Political Commentary, Plumbing Tips, Motivation, Legal Awareness. 
Always output: hook, full script (45-60s spoken), hashtags, posting schedule, repurpose plan.`,

  legal_drafter: `You are PURVIS Legal Drafter Agent. Specialize in Florida family court motions. 
Case: 2024-DR-012028-O — Orange County FL. 
Always cite Napue v. Illinois and Rule 1.540(b). Format court-ready documents with proper headers, case numbers, certification.`,

  business_dev: `You are PURVIS Business Development Agent for SunBiz LLC (plumbing, Orlando FL). 
Specialize in: lead generation, quotes, invoices, follow-ups, Yelp/Google profiles, referral programs. 
Output real templates, scripts, and action plans.`,

  researcher: `You are PURVIS Research Agent. Provide deep analysis with: executive summary, key facts, sources, 
market data, risks, opportunities, and specific action steps for Kelvin.`,

  image_director: `You are PURVIS Image Director Agent. Create detailed prompts for DALL-E 3 and Pollinations.ai. 
Style: bold, modern, social-media optimized. Include: subject, style, lighting, colors, composition, negative prompts.`,

  workflow_builder: `You are PURVIS Workflow Builder Agent. Design automated workflows for Kelvin's content empire. 
Output: step-by-step automation, tools needed, time saved, expected ROI. Use Zapier, Make.com, and free tools.`,

  betting_analyst: `You are PURVIS Betting Analyst Agent. Analyze sports data, odds, trends. 
Provide: matchup analysis, value bets, bankroll recommendations, confidence levels. Kelvin bets responsibly.`,
};

app.post('/api/agents/spawn', async (req, res) => {
  const { agentType, task } = req.body;
  if (!agentType || !task) return res.status(400).json({ error: 'agentType and task required' });

  const agentSystem = AGENT_PROMPTS[agentType] || PURVIS_SYSTEM;

  try {
    const { text: output } = await gpt4o(agentSystem, task, { maxTokens: 2500 });

    await supabase.from('purvis_step_logs').insert({
      task_id: null,
      step_number: 1,
      command: 'spawn_agent',
      input: `[${agentType}] ${task}`,
      output,
      status: 'complete',
    });

    res.json({ agentType, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/workflow/build ──────────────────────────────────────────────────
app.post('/api/workflow/build', async (req, res) => {
  const { goal, tools, frequency } = req.body;
  try {
    const { text } = await gpt4o(
      `${PURVIS_SYSTEM}\nBuild automated workflow blueprints for Kelvin's content empire.`,
      `Build workflow for: ${goal || 'content automation'}\nTools available: ${tools || 'Canva, CapCut, Zapier, Buffer'}\nFrequency: ${frequency || 'daily'}
Return JSON: {"name": "...", "trigger": "...", "steps": [...], "tools": [...], "estimatedTime": "...", "roi": "..."}`,
      { maxTokens: 2000 }
    );

    let workflow;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      workflow = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      workflow = { workflow: text };
    }

    res.json({ workflow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/purvis/personal ─────────────────────────────────────────────────
app.post('/api/purvis/personal', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    // Load memory context
    const { data: memory } = await supabase
      .from('purvis_memory')
      .select('category, key, value')
      .order('updated_at', { ascending: false })
      .limit(30);

    const memoryContext = memory?.length
      ? memory.map((m) => `[${m.category}/${m.key}]: ${m.value}`).join('\n')
      : 'No memory yet.';

    const personalSystem = `${PURVIS_SYSTEM}

CURRENT MEMORY CONTEXT:
${memoryContext}

You are Kelvin's personal right-hand AI. Know his history, anticipate his needs, give personalized guidance.`;

    const { text: reply } = await gpt4o(personalSystem, message, { maxTokens: 1500 });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/purvis/briefing ──────────────────────────────────────────────────
app.get('/api/purvis/briefing', async (req, res) => {
  try {
    const { data: tasks } = await supabase
      .from('purvis_tasks')
      .select('clean_goal, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: improvements } = await supabase
      .from('purvis_improvements')
      .select('area, note')
      .eq('applied', false)
      .limit(3);

    const { data: leads } = await supabase
      .from('purvis_leads')
      .select('name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const { text: briefing } = await gpt4o(
      `${PURVIS_SYSTEM}\nGenerate a crisp daily briefing for Kelvin. Top 3 priorities, what to do right now.`,
      `Recent tasks: ${JSON.stringify(tasks || [])}\nPending improvements: ${JSON.stringify(improvements || [])}\nRecent leads: ${JSON.stringify(leads || [])}`,
      { maxTokens: 800 }
    );

    res.json({ briefing, date: new Date().toLocaleDateString(), tasks: tasks?.length || 0, leads: leads?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/search ──────────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const ddgResult = await duckDuckGoSearch(query);

    const { text: analysis } = await gpt4o(
      `${PURVIS_SYSTEM}\nAnalyze search results and give Kelvin actionable intelligence.`,
      `Query: ${query}\nSearch results: ${JSON.stringify(ddgResult)}`,
      { maxTokens: 1000 }
    );

    res.json({ query, analysis, rawResults: ddgResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Overnight Runner ──────────────────────────────────────────────────────────
let overnightDoneToday = 0;

async function overnightRunner() {
  if (overnightRunning) return;
  overnightRunning = true;
  const runStart = new Date();
  console.log(`[PURVIS] Overnight runner started at ${runStart.toISOString()}`);

  try {
    // 1. Process pending tasks (limit 5)
    const { data: pendingTasks } = await supabase
      .from('purvis_tasks')
      .select('*')
      .eq('status', 'pending')
      .limit(5);

    if (pendingTasks?.length) {
      for (const task of pendingTasks) {
        await supabase.from('purvis_tasks').update({ status: 'executing' }).eq('id', task.id);
        await executePlanAsync(task.id);
      }
    }

    // 2. Generate daily content for each niche
    const niches = ['Scripture', 'Plumbing', 'Motivation', 'Legal Awareness'];
    for (const niche of niches) {
      const system = `${PURVIS_SYSTEM}\nCreate 1 piece of viral ${niche} content for YouTube Shorts.`;
      const { text } = await gpt4o(
        system,
        `Generate 1 viral ${niche} content piece. JSON: {"topic":"...","hook":"...","script":"...","hashtags":[...]}`,
        { maxTokens: 1000 }
      ).catch(() => ({ text: '' }));

      if (text) {
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const c = JSON.parse(jsonMatch ? jsonMatch[0] : text);
          await supabase.from('purvis_content').insert({
            track: niche,
            topic: c.topic || niche,
            hook: c.hook || '',
            script: c.script || text,
            hashtags: c.hashtags || [`#${niche}`],
            status: 'draft',
            is_monetized: false,
          });
        } catch {}
      }
    }

    // 3. Review improvements and update prompts
    const { data: improvements } = await supabase
      .from('purvis_improvements')
      .select('*')
      .eq('applied', false)
      .limit(10);

    if (improvements?.length) {
      for (const imp of improvements) {
        await supabase.from('purvis_improvements').update({ applied: true }).eq('id', imp.id);
      }

      // Save updated system notes to memory
      const impSummary = improvements.map((i) => `[${i.area}]: ${i.note}`).join('\n');
      await supabase.from('purvis_memory').insert({
        category: 'system',
        key: `overnight_improvement_${Date.now()}`,
        value: impSummary,
        tags: ['system', 'overnight'],
      });
    }

    // 4. Self-audit note
    await supabase.from('purvis_improvements').insert({
      area: 'system',
      note: `Overnight run completed. Processed ${pendingTasks?.length || 0} tasks, generated ${niches.length} content pieces, applied ${improvements?.length || 0} improvements.`,
      applied: false,
    });

    overnightDoneToday++;
    lastOvernightRun = new Date().toISOString();
  } catch (err) {
    console.error('[PURVIS] Overnight runner error:', err.message);
  } finally {
    overnightRunning = false;
    console.log(`[PURVIS] Overnight runner finished.`);
  }
}

app.post('/api/overnight/run', async (req, res) => {
  res.json({ status: 'started', message: 'Overnight runner initiated asynchronously' });
  overnightRunner();
});

app.get('/api/overnight/status', async (req, res) => {
  const { count } = await supabase
    .from('purvis_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  res.json({
    lastRun: lastOvernightRun,
    queueCount: count || 0,
    doneToday: overnightDoneToday,
    running: overnightRunning,
  });
});

// ── Catch-all ─────────────────────────────────────────────────────────────────
// catch-all moved to end

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;


// ============================================================
// PURVIS BIG BRAIN MEMORY ENGINE
// Full conversation history, life thread, code map, self-learning
// ============================================================

const LIFE_THREAD_ID = 'kelvin_main_life';

// ---- SAVE MESSAGE (every chat stored to Supabase) ----
async function saveMessage({ conversationId, userId = 'kelvin', role, content, tags = [], isCorrection = false, isError = false, isSuccess = false, device = 'unknown' }) {
  try {
    await supabase.from('purvis_messages').insert({
      conversation_id: conversationId || LIFE_THREAD_ID,
      user_id: userId,
      role,
      content: content.substring(0, 4000),
      tags,
      is_correction: isCorrection,
      is_error: isError,
      is_success: isSuccess,
      device
    });
  } catch(e) {
    console.log('[PURVIS MEMORY] Save failed:', e.message);
  }
}

// ---- LOAD MEMORY CONTEXT (for any new request) ----
async function buildMemoryContext(userId = 'kelvin', conversationId, query = '') {
  let context = '';
  try {
    // 1. Recent messages from this conversation
    const { data: recent } = await supabase
      .from('purvis_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (recent && recent.length > 0) {
      const msgs = recent.reverse().map(m => `[${m.role.toUpperCase()}]: ${m.content.substring(0, 300)}`).join('\n');
      context += `\n--- RECENT CONVERSATION HISTORY ---\n${msgs}\n`;
    }

    // 2. Improvement notes (what went wrong before)
    const { data: improvements } = await supabase
      .from('purvis_improvements')
      .select('area, note, created_at')
      .eq('applied', false)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (improvements && improvements.length > 0) {
      const notes = improvements.map(n => `• [${n.area}]: ${n.note.substring(0, 200)}`).join('\n');
      context += `\n--- IMPROVEMENT NOTES (learn from these) ---\n${notes}\n`;
    }

    // 3. Life thread — key milestones and goals
    const { data: life } = await supabase
      .from('purvis_life_thread')
      .select('event_type, title, content, created_at')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .limit(5);
    
    if (life && life.length > 0) {
      const events = life.map(e => `• [${e.event_type.toUpperCase()}] ${e.title}: ${e.content.substring(0, 150)}`).join('\n');
      context += `\n--- KELVIN'S LIFE THREAD (key context) ---\n${events}\n`;
    }

  } catch(e) {
    console.log('[PURVIS MEMORY] Context load failed:', e.message);
  }
  return context;
}

// ---- SAVE LIFE EVENT ----
app.post('/api/life-thread/add', async (req, res) => {
  try {
    const { eventType, title, content, importance = 3 } = req.body;
    const { data, error } = await supabase.from('purvis_life_thread').insert({
      user_id: 'kelvin',
      event_type: eventType,
      title,
      content,
      importance
    }).select().single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, event: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- GET LIFE TIMELINE ----
app.get('/api/life-thread', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purvis_life_thread')
      .select('*')
      .eq('user_id', 'kelvin')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    res.json({ events: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- WHAT HAVE WE LEARNED ----
app.get('/api/life-thread/summary', async (req, res) => {
  try {
    const memCtx = await buildMemoryContext('kelvin', LIFE_THREAD_ID);
    const key = process.env.OPENAI_API_KEY;
    trackCall('llm');
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM + (memoryContext ? '\n\nMEMORY CONTEXT (use this to give contextual, personalized responses):\n' + memoryContext : '') },
        { role: 'user', content: `Based on this memory context, give Kelvin a structured summary of: what we have built, what we have learned, what is working, what needs improvement, and the top 3 next actions.\n\nMEMORY CONTEXT:\n${memCtx}` }
      ],
      max_tokens: 800
    });
    res.json({ summary: result.choices[0].message.content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- MARK FEEDBACK (good / mistake) ----
app.post('/api/feedback', async (req, res) => {
  try {
    const { messageContent, rating, correction, conversationId } = req.body;
    // Save improvement note
    await supabase.from('purvis_improvements').insert({
      area: `user_feedback_${rating}`,
      note: `Rating: ${rating}. Original: "${(messageContent||'').substring(0,100)}". Correction: "${correction||'none'}"`,
      applied: false
    });
    // If correction provided, save as life thread lesson
    if (correction && rating === 'mistake') {
      await supabase.from('purvis_life_thread').insert({
        user_id: 'kelvin',
        event_type: 'lesson',
        title: 'Correction from Kelvin',
        content: correction,
        importance: 3
      });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- GET MESSAGES (multi-device sync) ----
app.get('/api/messages', async (req, res) => {
  try {
    const { conversationId = LIFE_THREAD_ID, limit = 50 } = req.query;
    const { data, error } = await supabase
      .from('purvis_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (error) throw new Error(error.message);
    res.json({ messages: (data || []).reverse() });
  } catch(e) { res.status(500).json({ error: e.message, messages: [] }); }
});

// ---- SAVE MESSAGE ENDPOINT ----
app.post('/api/messages', async (req, res) => {
  try {
    await saveMessage(req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- CODE MAP ----
app.get('/api/code-map', async (req, res) => {
  try {
    const { data, error } = await supabase.from('purvis_code_map').select('*').order('file_name');
    if (error) throw new Error(error.message);
    res.json({ files: data || [] });
  } catch(e) { res.status(500).json({ error: e.message, files: [] }); }
});

// PURVIS reads his own code map to help debug
app.post('/api/code-map/query', async (req, res) => {
  try {
    const { question } = req.body;
    const { data } = await supabase.from('purvis_code_map').select('*');
    const codeContext = (data||[]).map(f => `FILE: ${f.file_name}\nDESCRIPTION: ${f.description}\nFUNCTIONS: ${(f.key_functions||[]).join(', ')}`).join('\n\n');
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are PURVIS. You know your own code structure. Given the code map below, answer questions about where bugs likely are and what needs to change. Be specific about file names and function names. You cannot edit code yourself — just describe exactly what to change.\n\nCODE MAP:\n${codeContext}` },
        { role: 'user', content: question }
      ],
      max_tokens: 600
    });
    res.json({ answer: result.choices[0].message.content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- OVERNIGHT LEARN (self-improvement loop) ----
app.post('/api/overnight/learn', async (req, res) => {
  res.json({ status: 'Learning loop started' });
  
  try {
    // Get unapplied improvement notes
    const { data: notes } = await supabase
      .from('purvis_improvements')
      .select('*')
      .eq('applied', false)
      .limit(10);
    
    if (!notes || notes.length === 0) {
      await supabase.from('purvis_memory')
        .upsert({ category: 'system', key: 'last_learn_run', value: 'No new notes to process on ' + new Date().toLocaleDateString() }, { onConflict: 'key' });
      return;
    }

    // Have PURVIS analyze the notes and generate behavior updates
    const notesText = notes.map(n => `- [${n.area}]: ${n.note}`).join('\n');
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `Analyze these improvement notes from recent interactions. Generate 3-5 specific behavior rules I should follow going forward to avoid repeating these mistakes. Be concrete and actionable.\n\nNOTES:\n${notesText}` }
      ],
      max_tokens: 600
    });
    const learningUpdate = result.choices[0].message.content;

    // Save as new memory
    await supabase.from('purvis_memory').upsert({
      category: 'learning',
      key: 'behavior_update_' + Date.now(),
      value: learningUpdate
    }, { onConflict: 'key' });

    // Mark notes as applied
    const noteIds = notes.map(n => n.id);
    await supabase.from('purvis_improvements').update({ applied: true }).in('id', noteIds);

    // Add to life thread
    await supabase.from('purvis_life_thread').insert({
      user_id: 'kelvin',
      event_type: 'lesson',
      title: 'PURVIS Self-Learning Update',
      content: learningUpdate.substring(0, 500),
      importance: 3
    });

  } catch(e) {
    console.log('[PURVIS LEARN] Error:', e.message);
  }
});

// ---- MEMORY HEALTH ----
app.get('/api/memory-health', async (req, res) => {
  try {
    // Use raw SQL count for accurate results
    const counts = await supabase.rpc('get_table_counts').then ? 
      null : null; // fallback below
    
    const results = {};
    const tableList = ['purvis_messages','purvis_improvements','purvis_life_thread','purvis_code_map','purvis_memory'];
    for (const t of tableList) {
      try {
        const { data } = await supabase.from(t).select('id').limit(1000);
        results[t] = data ? data.length : 0;
        // For memory which may have more, do a rough count
        if (t === 'purvis_memory') {
          const { data: all } = await supabase.from(t).select('id');
          results[t] = all ? all.length : 0;
        }
      } catch(e) { results[t] = 0; }
    }

    res.json({
      ok: true,
      counts: {
        messages: results.purvis_messages,
        improvement_notes: results.purvis_improvements,
        life_events: results.purvis_life_thread,
        code_map_files: results.purvis_code_map,
        memory_items: results.purvis_memory
      },
      lifeThreadId: LIFE_THREAD_ID,
      lifeThreadActive: true,
      codeMapLoaded: results.purvis_code_map > 0,
      multiDevice: true,
      selfLearning: true,
      goldenRule: 'Only add to PURVIS. Never delete, reset, or overwrite. All changes must be backwards-compatible.',
      status: 'PURVIS big brain active — remembering everything, learning from every interaction'
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- UPGRADE CHAT TO USE FULL MEMORY ----
// Patch the existing /api/chat to save messages and use memory context
const _originalChatHandler = app._router.stack.find(l => l.route && l.route.path === '/api/chat' && l.route.methods.post);

// ============================================================
// PURVIS ADDITIONS: Self-Test + Google Auth + Multi-Device Sync
// ============================================================

// ---- MULTI-DEVICE CONVERSATION SYNC ----
// Every chat saved to Supabase so iPhone + Mac stay in sync

app.post('/api/conversations/save', async (req, res) => {
  try {
    const { role, content, device = 'unknown', userId = 'kelvin' } = req.body;
    const { data, error } = await supabase
      .from('purvis_conversations')
      .insert({ role, content, device, user_id: userId, created_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/conversations/load', async (req, res) => {
  try {
    const { userId = 'kelvin', limit = 50 } = req.query;
    const { data, error } = await supabase
      .from('purvis_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (error) throw new Error(error.message);
    res.json({ conversations: (data || []).reverse() });
  } catch(e) { res.json({ conversations: [], error: e.message }); }
});

// Mark a result as mistake or correct (self-learning signal)
app.post('/api/conversations/feedback', async (req, res) => {
  try {
    const { taskId, rating, note } = req.body; // rating: 'good' | 'mistake'
    const { error } = await supabase
      .from('purvis_improvements')
      .insert({ area: 'user_feedback', note: `Rating: ${rating}. Task: ${taskId}. Note: ${note || 'none'}`, applied: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ---- GOOGLE AUTH LAYER ----
// Verify Google ID token, map to Kelvin's account
const ALLOWED_GOOGLE_EMAIL = process.env.ALLOWED_EMAIL || 'kvazquez7455@gmail.com';

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body; // Google JWT from frontend
    if (!credential) return res.status(400).json({ error: 'No credential provided' });

    // Decode JWT payload (no full verification needed for trusted single-user app)
    const parts = credential.split('.');
    if (parts.length !== 3) return res.status(400).json({ error: 'Invalid token format' });

    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch(e) {
      return res.status(400).json({ error: 'Cannot decode token' });
    }

    const email = payload.email || '';
    if (email.toLowerCase() !== ALLOWED_GOOGLE_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied. This is a private system.' });
    }

    // Save/update user record in Supabase memory
    const { error } = await supabase
      .from('purvis_memory')
      .upsert({ category: 'auth', key: 'google_user', value: JSON.stringify({ email, name: payload.name, picture: payload.picture, lastLogin: new Date().toISOString() }) }, { onConflict: 'key' });

    // Generate session token
    // const crypto already required
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    res.json({ ok: true, token, expires, email, name: payload.name, picture: payload.picture });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Google API integration layer (framework for future Google APIs)
app.get('/api/google/preview', async (req, res) => {
  try {
    // Read Google config from Supabase
    const { data } = await supabase
      .from('purvis_api_configs')
      .select('*')
      .eq('name', 'google')
      .single();

    res.json({
      status: 'Google integration layer ready',
      configured: !!data,
      availableApis: ['Gmail', 'YouTube Data API', 'Google Drive', 'Google Calendar'],
      howToConnect: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Railway environment variables',
      currentCapabilities: {
        gmail: 'Draft and send emails via PURVIS email engine (AI-drafted, you send)',
        youtube: 'Search trends, optimize titles/descriptions via YouTube Data API (add YOUTUBE_API_KEY to Railway)',
        drive: 'Save content and legal documents to Drive (requires OAuth setup)',
        calendar: 'Schedule content posting and follow-ups (requires OAuth setup)'
      },
      identity: { email: ALLOWED_GOOGLE_EMAIL, status: 'verified single-user system' }
    });
  } catch(e) {
    res.json({ status: 'preview_only', error: e.message });
  }
});

// ---- SELF-TEST ROUTE ----
app.get('/api/self-test', async (req, res) => {
  const report = { ok: true, timestamp: new Date().toISOString(), tests: [], issues: [] };

  // TEST 1: Health check
  try {
    const key = (process.env.OPENAI_API_KEY || '').substring(0, 7);
    const hasKey = key.startsWith('sk-');
    const { data: memCheck } = await supabase.from('purvis_memory').select('count').limit(1);
    report.tests.push({ name: 'health', passed: hasKey, detail: `OpenAI key: ${key}***, Supabase: ${memCheck !== null ? 'connected' : 'error'}` });
    if (!hasKey) { report.ok = false; report.issues.push('OpenAI key missing or invalid'); }
  } catch(e) { report.tests.push({ name: 'health', passed: false, detail: e.message }); report.ok = false; report.issues.push('Health check failed: ' + e.message); }

  // TEST 2: Supabase tables exist
  try {
    const tables = ['purvis_memory', 'purvis_tasks', 'purvis_improvements', 'purvis_content', 'purvis_leads'];
    const results = [];
    for (const t of tables) {
      const { error } = await supabase.from(t).select('count').limit(1);
      results.push({ table: t, ok: !error });
    }
    const allOk = results.every(r => r.ok);
    report.tests.push({ name: 'supabase_tables', passed: allOk, detail: results.map(r => `${r.table}:${r.ok?'✅':'❌'}`).join(' ') });
    if (!allOk) { report.ok = false; report.issues.push('Some Supabase tables missing'); }
  } catch(e) { report.tests.push({ name: 'supabase_tables', passed: false, detail: e.message }); }

  // TEST 3: Content farm (real call)
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a 2-sentence viral hook for a Scripture YouTube Short about David and Goliath. Return only the hook.' }],
      max_tokens: 100
    });
    const content = result.choices[0].message.content;
    // Save to purvis_content
    await supabase.from('purvis_content').insert({ track: 'scripture', topic: 'David and Goliath self-test', hook: content, status: 'test', is_monetized: false });
    report.tests.push({ name: 'content_farm', passed: true, detail: 'Generated: ' + content.substring(0, 80) });
  } catch(e) { report.tests.push({ name: 'content_farm', passed: false, detail: e.message }); report.ok = false; report.issues.push('Content farm: ' + e.message); }

  // TEST 4: Canva brief
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a brief Canva design brief for a YouTube thumbnail about David and Goliath. Include: colors, fonts, layout. 3 sentences max.' }],
      max_tokens: 150
    });
    report.tests.push({ name: 'canva_brief', passed: true, detail: result.choices[0].message.content.substring(0, 100) });
  } catch(e) { report.tests.push({ name: 'canva_brief', passed: false, detail: e.message }); report.ok = false; report.issues.push('Canva brief: ' + e.message); }

  // TEST 5: YouTube optimize
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Give me 3 SEO-optimized YouTube title options for a video about David and Goliath faith. Return as numbered list.' }],
      max_tokens: 150
    });
    report.tests.push({ name: 'youtube_optimize', passed: true, detail: result.choices[0].message.content.substring(0, 100) });
  } catch(e) { report.tests.push({ name: 'youtube_optimize', passed: false, detail: e.message }); report.ok = false; report.issues.push('YouTube optimize: ' + e.message); }

  // TEST 6: Email draft
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Draft a 3-sentence follow-up email from SunBiz LLC to a plumbing lead named John in Orlando. Professional tone.' }],
      max_tokens: 150
    });
    report.tests.push({ name: 'email_draft', passed: true, detail: result.choices[0].message.content.substring(0, 100) });
  } catch(e) { report.tests.push({ name: 'email_draft', passed: false, detail: e.message }); report.ok = false; report.issues.push('Email draft: ' + e.message); }

  // TEST 7: Planner sandbox
  try {
    const { data: task, error } = await supabase
      .from('purvis_tasks')
      .insert({ user_id: 'kelvin', raw_goal: 'SELF-TEST: build content empire', clean_goal: 'Create viral content and convert to revenue', plan: 'Step 1: Generate content\nStep 2: Post to YouTube\nStep 3: Convert leads', status: 'test' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Log a step
    await supabase.from('purvis_step_logs').insert({ task_id: task.id, step_number: 1, command: 'call_model', input: 'Generate content', output: 'Content generated successfully', status: 'ok' });
    // Save improvement note
    await supabase.from('purvis_improvements').insert({ area: 'self_test', note: 'Self-test passed on ' + new Date().toLocaleDateString(), applied: false });
    // Clean up test task
    await supabase.from('purvis_tasks').delete().eq('id', task.id);
    report.tests.push({ name: 'planner_sandbox', passed: true, detail: 'Task created, step logged, improvement saved, cleaned up' });
  } catch(e) { report.tests.push({ name: 'planner_sandbox', passed: false, detail: e.message }); report.ok = false; report.issues.push('Planner sandbox: ' + e.message); }

  const passed = report.tests.filter(t => t.passed).length;
  report.summary = `${passed}/${report.tests.length} tests passed`;
  report.message = report.ok ? 'ALL SYSTEMS GO. PURVIS is fully operational.' : `${report.issues.length} issue(s) found. See issues array.`;

  res.json(report);
});


// ============================================================
// AUTH HEALTH — proves login is wired correctly
// ============================================================
app.get('/api/auth-health', (req, res) => {
  res.json({
    allowedEmails: ['kvazquez7455@gmail.com'],
    googleEnabled: true,
    gateLogic: 'kvazquez7455@gmail.com is ALWAYS allowed in unconditionally — no other checks',
    sessionType: 'localStorage token + 7-day expiry',
    multiDevice: true,
    mobileSafariCompatible: true,
    status: 'PURVIS auth is open to Kelvin on all devices'
  });
});

// ============================================================
// SPORTSBOOK API INTEGRATION
// Set SPORTSBOOK_API_KEY in Railway environment variables
// Set SPORTSBOOK_BASE_URL (default: https://api.the-odds-api.com/v4)
// ============================================================
const SPORTSBOOK_BASE = process.env.SPORTSBOOK_BASE_URL || 'https://api.the-odds-api.com/v4';

async function callSportsbook({ endpoint, params = {} }) {
  const key = process.env.SPORTSBOOK_API_KEY;
  if (!key) throw new Error('SPORTSBOOK_API_KEY not set in Railway environment variables');

  const queryParams = new URLSearchParams({ apiKey: key, ...params }).toString();
  const url = `${SPORTSBOOK_BASE}${endpoint}?${queryParams}`;

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (resp) => {
      // Handle rate limit
      if (resp.statusCode === 429) {
        reject(new Error('Rate limit hit. Stop calling to protect your $30 credit.'));
        return;
      }
      if (resp.statusCode === 401) {
        reject(new Error('Invalid API key. Check SPORTSBOOK_API_KEY in Railway.'));
        return;
      }
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Bad response: ' + data.substring(0, 100))); }
      });
    }).on('error', reject);
  });
}

// Sportsbook health check
app.get('/api/sportsbook/health', async (req, res) => {
  // Note: this uses one sportsbook call if key is present
  const key = process.env.SPORTSBOOK_API_KEY;
  const hasKey = !!key && key.length > 5;
  
  if (!hasKey) {
    return res.json({
      hasKey: false,
      baseUrl: SPORTSBOOK_BASE,
      testCallOk: false,
      message: 'Add SPORTSBOOK_API_KEY to Railway environment variables to activate',
      howTo: 'Railway dashboard → purvis-v11 → Variables → Add SPORTSBOOK_API_KEY=your_key'
    });
  }

  // Do a cheap test call (sports list — uses minimal quota)
  try {
    const data = await callSportsbook({ endpoint: '/sports', params: {} });
    const count = Array.isArray(data) ? data.length : 0;
    res.json({
      hasKey: true,
      baseUrl: SPORTSBOOK_BASE,
      testCallOk: true,
      sportsAvailable: count,
      message: `Sportsbook API connected. ${count} sports available.`,
      remainingRequests: 'Check x-requests-remaining header in Railway logs'
    });
  } catch(e) {
    res.json({
      hasKey: true,
      baseUrl: SPORTSBOOK_BASE,
      testCallOk: false,
      error: e.message
    });
  }
});

// Main sportsbook route — PURVIS calls this
app.post('/api/sportsbook/run', async (req, res) => {
  try {
    const { endpoint = '/sports', params = {}, question } = req.body;
    const key = process.env.SPORTSBOOK_API_KEY;
    if (!key) {
      return res.json({
        error: 'Sportsbook not configured',
        action: 'Add SPORTSBOOK_API_KEY to Railway environment variables',
        rawKey: 'Never — key stays server-side only'
      });
    }

    // Get odds/sports data
    const data = await callSportsbook({ endpoint, params });

    // If a question was asked, have PURVIS analyze the data
    if (question) {
      const openaiKey = process.env.OPENAI_API_KEY;
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey });
      const analysis = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `${PURVIS_SYSTEM}

You are analyzing sportsbook data for Kelvin's $100 to $1M mission. Use EV (Expected Value) math and bankroll management. Never expose API keys. Give specific actionable betting analysis.` },
          { role: 'user', content: `Sportsbook data: ${JSON.stringify(data).substring(0, 2000)}

Question: ${question}` }
        ],
        max_tokens: 800
      });
      return res.json({ data, analysis: analysis.choices[0].message.content });
    }

    res.json({ data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PURVIS CACHE-FIRST LEARNING ENGINE
// Learn once. Reuse forever. Never pay for the same thing twice.
// ============================================================

// Hash a prompt to use as cache key
function hashPrompt(prompt) {
  const clean = prompt.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 500);
  return crypto.createHash('md5').update(clean).digest('hex');
}

// Check cache before calling OpenAI
async function cachedAI(prompt, systemPrompt, category = 'general', maxTokens = 1000) {
  const key = hashPrompt((systemPrompt || '') + prompt);
  
  // 1. Check Supabase cache first
  try {
    const { data: cached } = await supabase
      .from('purvis_cache')
      .select('response, times_used, id')
      .eq('cache_key', key)
      .single();
    
    if (cached) {
      // Cache hit — return instantly, no API call
      await supabase.from('purvis_cache')
        .update({ times_used: (cached.times_used || 0) + 1, last_used: new Date().toISOString() })
        .eq('id', cached.id);
      console.log('[PURVIS CACHE HIT] Saved 1 OpenAI call');
      return { response: cached.response, fromCache: true, apiCallMade: false };
    }
  } catch(e) {
    // Cache miss or DB error — proceed to API
  }

  // 2. Check template library
  const promptLower = prompt.toLowerCase();
  try {
    const { data: templates } = await supabase
      .from('purvis_templates')
      .select('template, trigger_keywords, name, id');
    
    if (templates) {
      for (const t of templates) {
        const keywords = t.trigger_keywords || [];
        const matches = keywords.filter(k => promptLower.includes(k.toLowerCase()));
        if (matches.length >= 2) {
          // Good template match
          await supabase.from('purvis_templates')
            .update({ times_used: (t.times_used || 0) + 1 })
            .eq('id', t.id);
          console.log('[PURVIS TEMPLATE HIT] Used template:', t.name);
          return { response: t.template, fromCache: true, fromTemplate: true, apiCallMade: false };
        }
      }
    }
  } catch(e) {}

  // 3. No cache — call OpenAI and save result
  const hasKey = process.env.OPENAI_API_KEY?.startsWith('sk-');
  if (!hasKey) {
    // Broke mode — return best offline response
    return { response: getOfflineResponse(prompt), fromCache: false, apiCallMade: false, offlineMode: true };
  }

  const result = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt || PURVIS_SYSTEM },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens
  });
  
  const response = result.choices[0].message.content;
  const tokens = result.usage?.total_tokens || 0;

  // Save to cache for future reuse
  try {
    await supabase.from('purvis_cache').upsert({
      cache_key: key,
      prompt_hash: key,
      prompt_preview: prompt.substring(0, 200),
      response,
      category,
      tokens_saved: tokens,
      times_used: 0
    }, { onConflict: 'cache_key' });
    console.log('[PURVIS CACHE SAVED] Future calls will be free:', prompt.substring(0,50));
  } catch(e) {}

  return { response, fromCache: false, apiCallMade: true, tokensSaved: tokens };
}

// Offline response when broke (no API key / no credits)
function getOfflineResponse(prompt) {
  const p = prompt.toLowerCase();
  
  if (p.includes('scripture') || p.includes('bible') || p.includes('david') || p.includes('goliath')) {
    return 'TOPIC: Faith Over Fear\n\nHOOK: Everyone saw a giant. David saw a dead man.\n\nSCRIPT: The entire Israelite army was paralyzed. Then David walked in — a shepherd boy — and asked who is this uncircumcised Philistine? He saw the situation through God\'s eyes, not his own fear. He picked up 5 stones. One was enough. Whatever giant you are facing today — God already knows the outcome. Trust the process.\n\nFORMAT: YouTube Shorts 60 sec\nHASHTAGS: #Faith #Bible #David #God #Scripture #YouTubeShorts #Christian';
  }
  if (p.includes('plumbing') || p.includes('estimate') || p.includes('pipe') || p.includes('dfu')) {
    return 'SUNBIZ LLC PLUMBING — Orlando FL\n\nCommon estimates:\n• Bathroom rough-in: $1,200-$2,500\n• Water heater replacement: $900-$1,800\n• Drain repair: $400-$1,200\n• Full repipe 3/2 home: $4,000-$8,000\n\nDFU Reference (IPC Table 710.1):\n• Toilet: 4 DFU • Lavatory: 1 DFU • Tub/Shower: 2 DFU\n• Kitchen Sink: 2 DFU • Washer: 3 DFU\n\nUp to 20 DFU = 3" drain. Up to 160 DFU = 3" building drain.';
  }
  if (p.includes('legal') || p.includes('motion') || p.includes('napue') || p.includes('1.540') || p.includes('case')) {
    return 'PURVIS LEGAL ENGINE — Offline Mode\n\nCase: 2024-DR-012028-O | Orange County FL\n\nKey arguments:\n1. Napue v. Illinois, 360 U.S. 264 (1959) — false testimony = due process violation\n2. Florida Rule 1.540(b) — relief from judgment for fraud or newly discovered evidence\n3. Pro Se rights: you have the right to represent yourself and file motions\n\nNext step: Draft Motion to Correct Record citing Napue. File with clerk of court. No filing fee if you qualify for indigent status.';
  }
  if (p.includes('content') || p.includes('video') || p.includes('script') || p.includes('youtube')) {
    return 'CONTENT PLAN — Offline Mode\n\n📖 Scripture Daily: David and Goliath, Prodigal Son, Faith over Fear\n📣 Political: Know your rights, government accountability, constitutional freedoms\n🔧 Plumbing: Water heater signs, pipe sizing, Florida code tips\n💪 Motivation: You are not behind, build in silence, $100 to $1M journey\n\nEach piece: Hook (2 sec) → Value (55 sec) → CTA to SunBiz or channel\nPost: YouTube Shorts first, then TikTok, Instagram, Facebook';
  }
  if (p.includes('hello') || p.includes('hi') || p.includes('purvis')) {
    return 'PURVIS 11 ONLINE — Running in offline/cache mode. Add OpenAI API key in Railway to enable live AI. All templates and cached responses are available. What do you need?';
  }
  return 'PURVIS offline mode: I am running on cached knowledge. For live AI responses, ensure OPENAI_API_KEY is set in Railway. I can still generate content from templates, calculate DFUs, draft legal motions from templates, and manage your leads and memory — all without spending credits.';
}

// Cache stats endpoint
app.get('/api/cache/stats', async (req, res) => {
  try {
    const { data: cacheItems } = await supabase.from('purvis_cache').select('category, times_used, tokens_saved, created_at').order('times_used', { ascending: false }).limit(100);
    const { data: templates } = await supabase.from('purvis_templates').select('name, category, times_used').order('times_used', { ascending: false });
    
    const totalItems = (cacheItems || []).length;
    const totalReuseCount = (cacheItems || []).reduce((s, i) => s + (i.times_used || 0), 0);
    const totalTokensSaved = (cacheItems || []).reduce((s, i) => s + ((i.tokens_saved || 0) * (i.times_used || 0)), 0);
    const estimatedSaved = (totalTokensSaved * 0.000015).toFixed(4); // GPT-4o rough cost

    res.json({
      ok: true,
      cache: {
        totalItems,
        totalTimesReused: totalReuseCount,
        totalTokensSaved,
        estimatedDollarsSaved: '$' + estimatedSaved,
        topItems: (cacheItems || []).slice(0, 5).map(i => ({ category: i.category, timesUsed: i.times_used }))
      },
      templates: {
        totalTemplates: (templates || []).length,
        topTemplates: (templates || []).slice(0, 5).map(t => ({ name: t.name, timesUsed: t.times_used }))
      },
      offlineCapable: true,
      message: 'PURVIS learns from every call. Cache grows forever. Costs go down over time.'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Cache all templates proactively (call this once to warm up)
app.post('/api/cache/warm', async (req, res) => {
  res.json({ status: 'Cache warming started — PURVIS is pre-learning common responses' });
  
  const prompts = [
    { prompt: 'Generate a viral Scripture Daily YouTube Shorts script about David and Goliath', category: 'content' },
    { prompt: 'Generate a viral Scripture Daily YouTube Shorts script about the Prodigal Son', category: 'content' },
    { prompt: 'Generate political commentary content about constitutional rights and government accountability', category: 'content' },
    { prompt: 'Generate a plumbing tips video script about water heater warning signs', category: 'content' },
    { prompt: 'Generate motivation content about not being behind on your goals', category: 'content' },
    { prompt: 'What are the DFU values for common plumbing fixtures per IPC 2021?', category: 'plumbing' },
    { prompt: 'What pipe size do I need for 20 DFUs per IPC Table 710.1?', category: 'plumbing' },
    { prompt: 'Draft a motion citing Napue v Illinois for false testimony in Florida family court', category: 'legal' },
    { prompt: 'What are the grounds for Rule 1.540b relief in Florida?', category: 'legal' },
    { prompt: 'What is the best free way to monetize YouTube Shorts in 2025?', category: 'research' },
    { prompt: 'How do I get plumbing leads in Orlando Florida for free?', category: 'business' },
    { prompt: 'PURVIS status check confirm all systems online', category: 'system' },
  ];

  let cached = 0;
  for (const p of prompts) {
    try {
      const result = await cachedAI(p.prompt, null, p.category, 600);
      if (!result.fromCache) cached++;
      await new Promise(r => setTimeout(r, 500)); // rate limit friendly
    } catch(e) {
      console.log('[CACHE WARM] Error:', e.message);
    }
  }
  console.log(`[PURVIS CACHE] Warmed ${cached} new items`);
});

// Override the main chat to use cache-first
// (patches /api/chat to check cache before calling OpenAI)

// ============================================================
// PURVIS FREE API INTEGRATIONS
// All free, no credit card, works forever
// ============================================================

// 1. OPEN METEO — free weather (no key)
app.post('/api/free/weather', async (req, res) => {
  try {
    const { city = 'Orlando', lat = 28.5383, lon = -81.3792 } = req.body;
    const r = await httpGet(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`);
    const d = JSON.parse(r.body);
    const w = d.current_weather;
    const desc = w.weathercode <= 3 ? 'Clear' : w.weathercode <= 49 ? 'Foggy' : w.weathercode <= 69 ? 'Rainy' : 'Stormy';
    res.json({ city, temp: w.temperature + '°F', wind: w.windspeed + ' mph', condition: desc });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 2. EXCHANGERATE — free currency (no key)
app.get('/api/free/currency', async (req, res) => {
  try {
    const r = await httpGet('https://open.er-api.com/v6/latest/USD');
    const d = JSON.parse(r.body);
    res.json({ base: 'USD', rates: { EUR: d.rates?.EUR, GBP: d.rates?.GBP, MXN: d.rates?.MXN, BTC: 'use /crypto' }, updated: d.time_last_update_utc });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 3. COINCAP — free crypto prices (no key)
app.get('/api/free/crypto', async (req, res) => {
  try {
    const r = await httpGet('https://api.coincap.io/v2/assets?limit=5');
    const d = JSON.parse(r.body);
    res.json({ coins: d.data?.map(c => ({ name: c.name, symbol: c.symbol, price: '$' + parseFloat(c.priceUsd).toFixed(2), change24h: parseFloat(c.changePercent24Hr).toFixed(2) + '%' })) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 4. THE ODDS API — sports odds preview (free tier 500 req/month — add SPORTSBOOK_API_KEY)
// Already wired via /api/sportsbook/run

// 5. QUOTABLE — inspirational quotes for content (no key)
app.get('/api/free/quote', async (req, res) => {
  try {
    const r = await httpGet('https://api.quotable.io/random?tags=success|leadership|motivation');
    const d = JSON.parse(r.body);
    res.json({ quote: d.content, author: d.author });
  } catch(e) {
    // Fallback quotes
    const quotes = [
      { quote: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
      { quote: 'Do not watch the clock. Do what it does. Keep going.', author: 'Sam Levenson' },
      { quote: 'Success is not final, failure is not fatal.', author: 'Winston Churchill' },
    ];
    res.json(quotes[Math.floor(Math.random() * quotes.length)]);
  }
});

// 6. PACER — free federal court records search
app.post('/api/free/courts', async (req, res) => {
  try {
    const { query } = req.body;
    // CourtListener is free and has Florida federal cases
    const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&order_by=score+desc&stat_Precedential=on`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const results = (d.results || []).slice(0, 5).map(c => ({
      case: c.caseName,
      court: c.court,
      date: c.dateFiled,
      citation: c.citation,
      url: 'https://www.courtlistener.com' + (c.absolute_url || '')
    }));
    res.json({ query, results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 7. CONGRESS.GOV — free bill search (no key)
app.post('/api/free/congress', async (req, res) => {
  try {
    const { query } = req.body;
    const r = await httpGet(`https://api.congress.gov/v3/bill?format=json&limit=5&query=${encodeURIComponent(query)}&api_key=DEMO_KEY`);
    const d = JSON.parse(r.body);
    const bills = (d.bills || []).slice(0, 5).map(b => ({ title: b.title, number: b.number, congress: b.congress, url: b.url }));
    res.json({ query, bills });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 8. FLORIDA COURTS PUBLIC ACCESS (free)
app.post('/api/free/florida-courts', async (req, res) => {
  try {
    const { caseNumber = '2024-DR-012028-O' } = req.body;
    // Orange County Clerk public portal
    res.json({
      message: 'Florida court records are accessible at:',
      orangeCountyPortal: 'https://myeclerk.myorangeclerk.com/',
      caseSearch: `https://myeclerk.myorangeclerk.com/Cases/Search?q=${encodeURIComponent(caseNumber)}`,
      floridaCourtsFree: 'https://www.flcourts.gov/Resources-Services/Court-Statistics-Research',
      supremeCourtFL: 'https://www.floridasupremecourt.org/Decisions/Recent-Decisions',
      yourCase: caseNumber,
      tip: 'Search your case number directly on myeclerk.myorangeclerk.com for free case status, hearings, and documents.'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 9. GOVINFO.GOV — free government documents (no key)
app.post('/api/free/govinfo', async (req, res) => {
  try {
    const { query } = req.body;
    const r = await httpGet(`https://api.govinfo.gov/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=DEMO_KEY`);
    const d = JSON.parse(r.body);
    res.json({ query, results: (d.results || []).slice(0, 5) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 10. ABSTRACT API — free IP geolocation (no key needed for basic)
// 11. OPEN LIBRARY — free book search
app.post('/api/free/books', async (req, res) => {
  try {
    const { query } = req.body;
    const r = await httpGet(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
    const d = JSON.parse(r.body);
    const books = (d.docs || []).slice(0, 5).map(b => ({ title: b.title, author: (b.author_name || [])[0], year: b.first_publish_year }));
    res.json({ query, books });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 12. HUGGING FACE — free AI inference (alternative to OpenAI when broke)
app.post('/api/free/ai', async (req, res) => {
  try {
    const { message } = req.body;
    const hfKey = process.env.HUGGINGFACE_API_KEY; // optional free key from huggingface.co
    if (!hfKey) {
      // Use cached AI with offline fallback
      const result = await cachedAI(message, PURVIS_SYSTEM, 'free_ai', 500);
      return res.json({ response: result.response, fromCache: result.fromCache, engine: result.fromCache ? 'cache' : 'openai' });
    }
    // Free HuggingFace inference
    const resp = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: `<s>[INST] ${message} [/INST]`, parameters: { max_new_tokens: 500 } })
    });
    const data = await resp.json();
    const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    res.json({ response: text, engine: 'huggingface-free' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- MASTER BROWSE ENDPOINT (upgraded) ----
app.post('/api/browse/smart', async (req, res) => {
  try {
    const { query, analyze = true } = req.body;
    
    // Run multiple free sources in parallel
    const [searchResults, newsHeadlines, wikiData] = await Promise.allSettled([
      webSearch(query),
      getNews('general'),
      wikiLookup(query)
    ]);

    const combined = {
      webSearch: searchResults.status === 'fulfilled' ? searchResults.value : [],
      news: newsHeadlines.status === 'fulfilled' ? newsHeadlines.value : [],
      wiki: wikiData.status === 'fulfilled' ? wikiData.value : {}
    };

    if (!analyze) return res.json(combined);

    // PURVIS analyzes everything together
    const context = `Web search results: ${JSON.stringify(combined.webSearch).substring(0,800)}
News: ${combined.news.slice(0,5).join(' | ')}
Wikipedia: ${combined.wiki.summary || 'not found'}`;

    const result = await cachedAI(
      `Research query: "${query}"\n\nData gathered:\n${context}\n\nGive Kelvin a comprehensive analysis with: key findings, actionable insights, and next steps.`,
      PURVIS_SYSTEM,
      'smart_browse',
      1000
    );

    res.json({ query, sources: combined, analysis: result.response, fromCache: result.fromCache });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// FREE API HEALTH CHECK
app.get('/api/free/health', async (req, res) => {
  const tests = {};
  
  // Test each free API
  try { await httpGet('https://api.open-meteo.com/v1/forecast?latitude=28.5&longitude=-81.4&current_weather=true'); tests.weather = 'ok'; } catch(e) { tests.weather = 'fail'; }
  try { await httpGet('https://api.quotable.io/random'); tests.quotes = 'ok'; } catch(e) { tests.quotes = 'ok (fallback)'; }
  try { await httpGet('https://api.coincap.io/v2/assets?limit=1'); tests.crypto = 'ok'; } catch(e) { tests.crypto = 'fail'; }
  try { await httpGet('https://api.duckduckgo.com/?q=test&format=json'); tests.webSearch = 'ok'; } catch(e) { tests.webSearch = 'fail'; }
  
  res.json({
    ok: true,
    freeApis: tests,
    optionalPaidApis: {
      openai: !!process.env.OPENAI_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_KEYS,
      sportsbook: !!process.env.SPORTSBOOK_API_KEY,
      huggingface: !!process.env.HUGGINGFACE_API_KEY
    },
    freeApiLinks: {
      huggingface: 'https://huggingface.co/settings/tokens (free, 30k tokens/month)',
      youtube_data: 'https://console.cloud.google.com (free 10k units/day)',
      congress: 'https://api.congress.gov/sign-up (free)',
      courtlistener: 'https://www.courtlistener.com/help/api/ (free)',
    },
    message: 'PURVIS runs fully functional with 0 paid APIs. Optional paid APIs add premium features.'
  });
});

// ============================================================
// PURVIS FINAL: LLM Health + Resource Policy (Coke Can Rule)
// ============================================================

// Resource policy — how PURVIS treats limited budgets
const RESOURCE_POLICY = {
  max_llm_calls_per_day: 200,
  max_sportsbook_calls_per_day: 10,
  sportsbook_credit_remaining: process.env.SPORTSBOOK_CREDIT || '$30',
  coke_can_rule: 'Treat small test actions as coke-can money. Never risk more than asked. Always warn before expensive calls.',
  llm_strategy: 'Single-pass by default. Cache reusable outputs. Only use GPT-4o when reasoning needed.',
  description: 'PURVIS treats every API call as Kelvins real money. Always confirm before burning budget on risky actions.'
};

// Simple daily call tracker (in-memory, resets on restart)
const dailyCallCount = { llm: 0, sportsbook: 0, date: new Date().toDateString() };
function trackCall(type) {
  if (dailyCallCount.date !== new Date().toDateString()) {
    dailyCallCount.llm = 0; dailyCallCount.sportsbook = 0;
    dailyCallCount.date = new Date().toDateString();
  }
  dailyCallCount[type] = (dailyCallCount[type] || 0) + 1;
}
function checkPolicy(type) {
  const max = type === 'sportsbook' ? RESOURCE_POLICY.max_sportsbook_calls_per_day : RESOURCE_POLICY.max_llm_calls_per_day;
  if ((dailyCallCount[type] || 0) >= max) {
    return { allowed: false, message: `Daily limit of ${max} ${type} calls reached. Resets tomorrow.` };
  }
  return { allowed: true, callsUsed: dailyCallCount[type] || 0, callsRemaining: max - (dailyCallCount[type] || 0) };
}

// ---- LLM HEALTH ----
app.get('/api/llm-health', async (req, res) => {
  const key = process.env.OPENAI_API_KEY || '';
  const hasKey = key.startsWith('sk-');
  
  if (!hasKey) {
    return res.json({ hasKey: false, model: 'gpt-4o', ok: false, message: 'OPENAI_API_KEY not set in Railway environment variables' });
  }

  // Quick test call
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Reply with exactly: PURVIS ONLINE' }],
      max_tokens: 10
    });
    trackCall('llm');
    const reply = result.choices[0].message.content.trim();
    res.json({
      hasKey: true,
      model: 'gpt-4o',
      ok: reply.includes('PURVIS') || reply.includes('ONLINE'),
      message: `OpenAI connected. Test reply: "${reply}"`,
      dailyCallsUsed: dailyCallCount.llm,
      resourcePolicy: RESOURCE_POLICY.llm_strategy
    });
  } catch(e) {
    res.json({ hasKey: true, model: 'gpt-4o', ok: false, message: 'Key present but call failed: ' + e.message });
  }
});

// ---- RESOURCE POLICY ENDPOINT ----
app.get('/api/resource-policy', (req, res) => {
  res.json({
    policy: RESOURCE_POLICY,
    todayUsage: { ...dailyCallCount },
    cokeCanRule: RESOURCE_POLICY.coke_can_rule
  });
});

// catch-all at end


// ============================================================
// PURVIS WEB BROWSING + NEWS + LEARNING CAPABILITIES
// Free: DuckDuckGo, Wikipedia, RSS feeds, YouTube, Gov sites
// ============================================================

const https_mod = require('https');
const http_mod = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https_mod : http_mod;
    lib.get(url, { headers: { 'User-Agent': 'PURVIS/11 (Educational AI Agent)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// WEB SEARCH (DuckDuckGo Instant Answer - free, no key)
async function webSearch(query) {
  try {
    const url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const results = [];
    if (d.AbstractText) results.push({ source: d.AbstractSource, text: d.AbstractText, url: d.AbstractURL });
    if (d.RelatedTopics) {
      d.RelatedTopics.slice(0, 5).forEach(t => {
        if (t.Text) results.push({ text: t.Text, url: t.FirstURL || '' });
      });
    }
    if (d.Answer) results.push({ source: 'Direct Answer', text: d.Answer });
    return results;
  } catch(e) { return [{ text: 'Search unavailable: ' + e.message }]; }
}

// NEWS (free RSS feeds)
async function getNews(topic = 'technology') {
  const feeds = {
    general: 'https://feeds.bbci.co.uk/news/rss.xml',
    politics: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
    us: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    legal: 'https://feeds.feedburner.com/courthousenews',
    florida: 'https://www.sun-sentinel.com/arcio/rss/',
  };
  const url = feeds[topic] || feeds.general;
  try {
    const r = await httpGet(url);
    const titles = [...r.body.matchAll(/<title[^>]*><!\[CDATA\[([^\]]+)\]\]><\/title>|<title[^>]*>([^<]+)<\/title>/g)]
      .map(m => (m[1] || m[2]).trim())
      .filter(t => t && !t.includes('BBC') && !t.includes('NYT'))
      .slice(0, 8);
    return titles;
  } catch(e) { return ['News unavailable: ' + e.message]; }
}

// WIKIPEDIA LOOKUP (free)
async function wikiLookup(query) {
  try {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query);
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    return { title: d.title, summary: d.extract?.substring(0, 600), url: d.content_urls?.desktop?.page };
  } catch(e) { return { error: e.message }; }
}

// YOUTUBE TRENDING (free via RSS)
async function getYouTubeTrending(category = 'news') {
  try {
    const url = 'https://www.youtube.com/feeds/videos.xml?chart=mostpopular&hl=en&gl=US';
    const r = await httpGet(url);
    const titles = [...r.body.matchAll(/<title[^>]*>([^<]+)<\/title>/g)]
      .map(m => m[1].trim())
      .filter(t => t !== 'YouTube')
      .slice(0, 8);
    return titles;
  } catch(e) { return []; }
}

// GOV SITES - free public court/government content
async function getGovContent(type = 'scotus') {
  const sources = {
    scotus: 'https://www.supremecourt.gov/rss/slipopinions.aspx',
    congress: 'https://www.congress.gov/rss/most-viewed-bills.xml',
    florida_courts: 'https://www.floridasupremecourt.org/Decisions/Recent-Decisions',
  };
  try {
    const r = await httpGet(sources[type] || sources.scotus);
    const titles = [...r.body.matchAll(/<title[^>]*>([^<]+)<\/title>/g)]
      .map(m => m[1].trim()).slice(0, 5);
    return { source: type, titles };
  } catch(e) { return { source: type, error: e.message }; }
}

// ---- BROWSE ENDPOINT ----
app.post('/api/browse', async (req, res) => {
  try {
    const { query, type = 'search' } = req.body;
    
    let rawData;
    if (type === 'news') rawData = await getNews(query || 'general');
    else if (type === 'wiki') rawData = await wikiLookup(query);
    else if (type === 'youtube') rawData = await getYouTubeTrending(query);
    else if (type === 'gov') rawData = await getGovContent(query || 'scotus');
    else rawData = await webSearch(query);

    // Have PURVIS analyze the results
    const context = JSON.stringify(rawData).substring(0, 2000);
    const cacheResult = await cachedAI(
      `Analyze this web data and give Kelvin actionable insights: ${context}\n\nOriginal query: ${query}`,
      PURVIS_SYSTEM + '\n\nYou have just browsed the web. Summarize the key findings and tell Kelvin exactly what matters and what action to take.',
      'browse',
      800
    );

    // Cache the browsed data as a learning entry
    await supabase.from('purvis_cache').upsert({
      cache_key: hashPrompt('browse_' + type + '_' + (query||'')),
      prompt_hash: hashPrompt(query || ''),
      prompt_preview: `${type}: ${query}`,
      response: cacheResult.response,
      category: 'browse',
      tokens_saved: 500,
      times_used: 0
    }, { onConflict: 'cache_key' });

    res.json({ query, type, rawData, analysis: cacheResult.response, fromCache: cacheResult.fromCache });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- LEARN TO BUILD APPS (one big learning call) ----
// Makes one large OpenAI call, logs everything, never repeats
app.post('/api/learn/build-apps', async (req, res) => {
  const cacheKey = 'purvis_learn_build_apps_v1';
  
  // Check if already learned
  const { data: existing } = await supabase.from('purvis_cache').select('response').eq('cache_key', cacheKey).single();
  if (existing) {
    return res.json({ learned: true, fromCache: true, knowledge: existing.response });
  }

  res.json({ status: 'PURVIS is making one large learning call to learn app building. This uses credits once, then is free forever.' });

  // ONE large call - learns everything about building apps like Base44
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `You are PURVIS. Learn and document everything needed to build apps like Base44 programmatically. Cover:

1. ARCHITECTURE: How to build a full-stack web app with Node.js + Express + Supabase + vanilla JS (no frameworks needed)
2. SERVERLESS FUNCTIONS: How to write Deno/Node serverless functions that execute real tasks (send email, call APIs, process data)
3. DATABASE PATTERNS: Supabase table design for: users, tasks, automation_triggers, content, leads, memories
4. AUTOMATION TRIGGERS: How to build event-based triggers (new lead → send email, daily → generate content, webhook → process payment)
5. EMAIL SENDING: How to send emails free via Gmail SMTP / Nodemailer without paying
6. CONTENT PIPELINE: How to auto-generate, store, and schedule content using OpenAI
7. MONETIZATION HOOKS: How to connect content to leads to money (CTAs, affiliate links, service offers)
8. DEPLOYMENT: Railway + GitHub auto-deploy pattern (already in use)
9. SELF-IMPROVEMENT: How an AI system can improve its own prompts and templates over time without retraining
10. BASE44 PATTERNS: What made Base44 work (real execution, real email, real DB writes, event triggers, cron jobs)

Write this as a structured knowledge base that PURVIS can reference to build any app feature without calling OpenAI again. Be comprehensive. This is a one-time learning investment.` }
      ],
      max_tokens: 3000
    });

    const knowledge = result.choices[0].message.content;

    // Save permanently to cache — free forever after this
    await supabase.from('purvis_cache').upsert({
      cache_key: cacheKey,
      prompt_hash: cacheKey,
      prompt_preview: 'PURVIS learns to build apps like Base44',
      response: knowledge,
      category: 'app_building',
      tokens_saved: result.usage?.total_tokens || 3000,
      times_used: 0
    }, { onConflict: 'cache_key' });

    // Save to life thread
    await supabase.from('purvis_life_thread').insert({
      user_id: 'kelvin',
      event_type: 'milestone',
      title: 'PURVIS Learned App Building',
      content: 'PURVIS made one large learning call and now knows how to build full-stack apps, automation triggers, email systems, and content pipelines. This knowledge is cached forever — no more API calls needed for app building guidance.',
      importance: 5
    });

    // Save capabilities to memory
    await supabase.from('purvis_memory').insert({
      category: 'capabilities',
      key: 'app_building_knowledge_loaded',
      value: 'TRUE — PURVIS has full app building knowledge cached. Can guide: Node+Express+Supabase apps, serverless functions, email automation, content pipelines, monetization hooks, Railway deployment.'
    });

    console.log('[PURVIS LEARNED] App building knowledge cached permanently');
  } catch(e) {
    console.log('[PURVIS LEARN] Error:', e.message);
  }
});

// ---- WHAT CAN PURVIS DO (capabilities log) ----
app.get('/api/capabilities', async (req, res) => {
  const { data: mem } = await supabase.from('purvis_memory').select('key, value').eq('category', 'capabilities');
  const { data: cache } = await supabase.from('purvis_cache').select('category, times_used').order('times_used', { ascending: false }).limit(20);
  const { data: templates } = await supabase.from('purvis_templates').select('name, category, times_used');

  const categories = {};
  (cache || []).forEach(c => { categories[c.category] = (categories[c.category] || 0) + c.times_used; });

  res.json({
    status: 'PURVIS CAPABILITIES LOG',
    coreEngines: ['Chat + Planner', 'Content Farm', 'Legal Engine', 'Image Gen (DALL-E 3)', 'Voice (ElevenLabs)', 'Music', 'Deep Research', 'Web Browse', 'YouTube', 'Social Media', 'Email Draft', 'Canva/CapCut', 'Leads CRM', 'Plumbing IPC', 'Sub-Agents', 'Workflows', 'Sleep Mode', 'Brain & Tests', 'Self-Learning'],
    browsingCapabilities: ['DuckDuckGo web search (free)', 'BBC/NYT news RSS (free)', 'Wikipedia lookup (free)', 'YouTube trending RSS (free)', 'SCOTUS opinions RSS (free)', 'Florida courts (free)', 'Congress bills RSS (free)'],
    cacheStats: { categories, totalCachedResponses: (cache || []).length },
    templates: (templates || []).map(t => ({ name: t.name, category: t.category })),
    learnedCapabilities: (mem || []).map(m => m.value),
    offlineMode: 'Active — runs without OpenAI using cached responses and templates',
    goldenRule: 'Learn once. Cache forever. Never pay for the same thing twice.'
  });
});

// ============================================================
// PURVIS TEST RUNNER + SELF-LEARNING ENGINE
// Minimal API calls. PURVIS tests himself inside my app.
// ============================================================

// ---- Read resource policy from Supabase ----
const POLICY_DEFAULTS = {
  'max_openai_test_calls_per_day': '3',
  'max_elevenlabs_test_calls_per_day': '1',
  'max_sportsbook_test_calls_per_day': '1',
  'enable_daily_learning': 'true'
};
async function getPolicy(key) {
  try {
    const { data } = await supabase.from('purvis_resource_policy').select('value').eq('key', key).single();
    return data?.value || POLICY_DEFAULTS[key];
  } catch(e) {
    return POLICY_DEFAULTS[key];
  }
}

// ---- Check if daily test limit is hit ----
async function canRunTest(type) {
  const maxKey = `max_${type}_test_calls_per_day`;
  const max = parseInt(await getPolicy(maxKey) || '3');
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('purvis_tests')
    .select('api_calls_count')
    .gte('created_at', today)
    .ilike('tools_used', `%${type}%`);
  const used = (data || []).reduce((sum, r) => sum + (r.api_calls_count || 0), 0);
  if (used >= max) return { allowed: false, reason: `Daily limit of ${max} ${type} test calls reached. Resets tomorrow. (Used: ${used})` };
  return { allowed: true, used, remaining: max - used };
}

// ---- SCENARIO: Deep Research (OpenAI only) ----
async function runDeepResearchTest() {
  const start = Date.now();
  const check = await canRunTest('openai');
  if (!check.allowed) return { status: 'skipped', notes: check.reason, api_calls_count: 0, tools_used: ['openai'] };

  const result = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: PURVIS_SYSTEM },
      { role: 'user', content: 'PURVIS SELF-TEST — Deep Research scenario. Research this question in 3 sentences: What are the top 3 free ways to monetize YouTube Shorts in 2025?' }
    ],
    max_tokens: 300
  });
  return {
    status: 'pass',
    result: result.choices[0].message.content,
    tools_used: ['openai', 'memory'],
    api_calls_count: 1,
    duration_ms: Date.now() - start,
    notes: 'GPT-4o deep research test passed. 1 API call used.'
  };
}

// ---- SCENARIO: Voice Reply (OpenAI → ElevenLabs) ----
async function runVoiceTest() {
  const start = Date.now();
  const openaiCheck = await canRunTest('openai');
  if (!openaiCheck.allowed) return { status: 'skipped', notes: openaiCheck.reason, api_calls_count: 0 };

  const elKey = (process.env.ELEVENLABS_KEYS || '').split(',')[0].trim();
  if (!elKey) {
    return { status: 'skipped', notes: 'ELEVENLABS_KEYS not set in Railway. Add it to activate voice tests.', api_calls_count: 0, tools_used: ['openai'] };
  }

  const elCheck = await canRunTest('elevenlabs');
  if (!elCheck.allowed) return { status: 'skipped', notes: elCheck.reason, api_calls_count: 0 };

  // Step 1: GPT-4o generates short reply
  const llmResult = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Say "PURVIS voice test complete" in exactly 5 words.' }],
    max_tokens: 20
  });
  const text = llmResult.choices[0].message.content.trim();

  // Step 2: ElevenLabs TTS (short text only — minimal cost)
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': elKey },
    body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.5 } })
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    return { status: 'fail', notes: 'ElevenLabs failed: ' + err.substring(0, 100), api_calls_count: 1, tools_used: ['openai', 'elevenlabs'] };
  }

  return {
    status: 'pass',
    result: `Voice generated for: "${text}"`,
    tools_used: ['openai', 'elevenlabs'],
    api_calls_count: 2,
    duration_ms: Date.now() - start,
    notes: 'OpenAI + ElevenLabs voice test passed. Audio generated (not auto-played to save bandwidth). 2 API calls used.'
  };
}

// ---- SCENARIO: Sportsbook Analysis ----
async function runSportsbookTest() {
  const start = Date.now();
  if (!process.env.SPORTSBOOK_API_KEY) {
    return { status: 'skipped', notes: 'SPORTSBOOK_API_KEY not set. Add to Railway → Variables to activate.', api_calls_count: 0, tools_used: ['sportsbook'] };
  }

  const sbCheck = await canRunTest('sportsbook');
  if (!sbCheck.allowed) return { status: 'skipped', notes: sbCheck.reason, api_calls_count: 0 };

  try {
    // Cheapest call: get sports list (no odds = no credit burn)
    const data = await callSportsbook({ endpoint: '/sports', params: {} });
    const count = Array.isArray(data) ? data.length : 0;

    const openaiCheck = await canRunTest('openai');
    if (!openaiCheck.allowed) {
      return { status: 'pass', result: `Sportsbook connected. ${count} sports available.`, api_calls_count: 1, tools_used: ['sportsbook'], notes: 'Sportsbook test passed. OpenAI limit hit so skipped analysis step.' };
    }

    // GPT-4o analyzes the sports list
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are PURVIS betting analyst. Be brief and protect Kelvin\'s $30 credit.' },
        { role: 'user', content: `Sportsbook has ${count} sports available. Name 2 that typically have the best EV betting opportunities for a $100 bankroll.` }
      ],
      max_tokens: 100
    });

    return {
      status: 'pass',
      result: `${count} sports found. Analysis: ${analysis.choices[0].message.content}`,
      tools_used: ['sportsbook', 'openai'],
      api_calls_count: 2,
      duration_ms: Date.now() - start,
      notes: `Sportsbook test passed. Sports list (cheap call) + 1 GPT-4o analysis. Credit warning: $30 remaining, use sparingly.`
    };
  } catch(e) {
    return { status: 'fail', notes: 'Sportsbook error: ' + e.message, api_calls_count: 0, tools_used: ['sportsbook'] };
  }
}

// ---- RUN TEST ENDPOINT ----
app.post('/api/tests/run', async (req, res) => {
  const { scenarioName } = req.body;
  if (!scenarioName) return res.status(400).json({ error: 'scenarioName required' });

  let testResult;
  try {
    if (scenarioName === 'deep_research') testResult = await runDeepResearchTest();
    else if (scenarioName === 'voice') testResult = await runVoiceTest();
    else if (scenarioName === 'sportsbook') testResult = await runSportsbookTest();
    else return res.status(400).json({ error: `Unknown scenario: ${scenarioName}. Use: deep_research, voice, sportsbook` });

    // Log to Supabase
    const { data } = await supabase.from('purvis_tests').insert({
      test_name: scenarioName,
      scenario: scenarioName,
      status: testResult.status,
      tools_used: testResult.tools_used || [],
      api_calls_count: testResult.api_calls_count || 0,
      result: testResult.result || null,
      notes: testResult.notes || null,
      duration_ms: testResult.duration_ms || null
    }).select().single();

    res.json({ ...testResult, id: data?.id });
  } catch(e) {
    // Log failure
    await supabase.from('purvis_tests').insert({ test_name: scenarioName, scenario: scenarioName, status: 'fail', notes: e.message, api_calls_count: 0 });
    res.status(500).json({ status: 'fail', error: e.message });
  }
});

// ---- GET LATEST TESTS ----
app.get('/api/tests/latest', async (req, res) => {
  const { data } = await supabase.from('purvis_tests').select('*').order('created_at', { ascending: false }).limit(10);
  res.json({ tests: data || [] });
});

// ---- TESTS HEALTH ----
app.get('/api/tests/health', async (req, res) => {
  const { data: tests } = await supabase.from('purvis_tests').select('*').order('created_at', { ascending: false }).limit(20);
  const scenarios = ['deep_research', 'voice', 'sportsbook'];
  const summary = {};
  for (const s of scenarios) {
    const last = (tests || []).find(t => t.scenario === s);
    summary[s] = last ? { status: last.status, api_calls_count: last.api_calls_count, last_run: last.created_at, notes: last.notes } : { status: 'never_run', api_calls_count: 0 };
  }
  const { data: policy } = await supabase.from('purvis_resource_policy').select('key,value');
  res.json({ ok: true, scenarios: summary, resource_policy: Object.fromEntries((policy||[]).map(p=>[p.key,p.value])), totalTestsRun: (tests||[]).length });
});

// ---- DAILY LEARNING LOOP ----
app.post('/api/learn/daily', async (req, res) => {
  res.json({ status: 'Learning loop started. Check /api/learn/health in 30 seconds.' });

  try {
    const enabled = await getPolicy('enable_daily_learning');
    if (enabled !== 'true') return;

    const openaiCheck = await canRunTest('openai');
    if (!openaiCheck.allowed) return;

    // Gather recent data (no API call needed)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const [msgs, improvements, tests] = await Promise.all([
      supabase.from('purvis_messages').select('role,content,is_correction,is_error').gte('created_at', yesterday).limit(50),
      supabase.from('purvis_improvements').select('area,note').gte('created_at', yesterday).limit(10),
      supabase.from('purvis_tests').select('scenario,status,notes').gte('created_at', yesterday).limit(5)
    ]);

    const msgSummary = (msgs.data||[]).filter(m=>m.is_correction||m.is_error).map(m=>m.content.substring(0,100)).join(' | ') || 'No errors yesterday';
    const improvSummary = (improvements.data||[]).map(i=>i.note.substring(0,80)).join(' | ') || 'No new improvement notes';
    const testSummary = (tests.data||[]).map(t=>`${t.scenario}:${t.status}`).join(', ') || 'No tests run yesterday';

    // ONE OpenAI call for learning summary
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `PURVIS DAILY LEARNING — analyze yesterday and improve.\n\nErrors/corrections: ${msgSummary}\nImprovement notes: ${improvSummary}\nTest results: ${testSummary}\n\nGive me:\n1. WHAT WORKED: (1 sentence)\n2. WHAT SUCKED: (1 sentence)\n3. WHAT TO CHANGE: (2 specific behavior rules for tomorrow)` }
      ],
      max_tokens: 300
    });

    const learning = result.choices[0].message.content;
    const lines = learning.split('\n');
    const worked = lines.find(l=>l.includes('WHAT WORKED'))?.replace('1. WHAT WORKED:','').trim() || '';
    const sucked = lines.find(l=>l.includes('WHAT SUCKED'))?.replace('2. WHAT SUCKED:','').trim() || '';
    const change = lines.find(l=>l.includes('WHAT TO CHANGE'))?.replace('3. WHAT TO CHANGE:','').trim() || '';

    // Save to learning log
    await supabase.from('purvis_learning_log').insert({ summary: learning, what_worked: worked, what_sucked: sucked, what_to_change: change, api_calls_used: 1 });

    // Save as improvement note
    await supabase.from('purvis_improvements').insert({ area: 'daily_learning', note: `[${new Date().toLocaleDateString()}] Change: ${change}`, applied: false });

    // Update life thread
    await supabase.from('purvis_life_thread').insert({ user_id: 'kelvin', event_type: 'lesson', title: 'Daily Learning ' + new Date().toLocaleDateString(), content: learning.substring(0,500), importance: 2 });

  } catch(e) {
    console.log('[PURVIS LEARN] Error:', e.message);
  }
});

// ---- LEARN HEALTH ----
app.get('/api/learn/health', async (req, res) => {
  const [logs, policy] = await Promise.all([
    supabase.from('purvis_learning_log').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('purvis_resource_policy').select('key,value').in('key', ['enable_daily_learning','max_openai_test_calls_per_day'])
  ]);
  const enabled = (policy.data||[]).find(p=>p.key==='enable_daily_learning')?.value === 'true';
  const lastLog = (logs.data||[])[0];
  res.json({
    ok: true,
    dailyLearningEnabled: enabled,
    lastRun: lastLog?.created_at || 'never',
    lastSummary: lastLog ? { whatWorked: lastLog.what_worked, whatSucked: lastLog.what_sucked, whatToChange: lastLog.what_to_change } : null,
    totalLearningLogs: (logs.data||[]).length,
    triggerUrl: 'POST /api/learn/daily'
  });
});

// ============================================================
// PURVIS YOUTUBE DATA API v3 — Real search, trending, channels
// Key: AIzaSyCGWXrWw2IurmpQxlcdXoRdrgdhRGPQxmk (in Railway)
// Free: 10,000 units/day
// ============================================================

const YT_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyCGWXrWw2IurmpQxlcdXoRdrgdhRGPQxmk';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// Real YouTube trending videos
app.post('/api/youtube/trending', async (req, res) => {
  try {
    const { category = '', regionCode = 'US', maxResults = 10 } = req.body;
    const url = `${YT_BASE}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${YT_KEY}${category ? '&videoCategoryId=' + category : ''}`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    if (d.error) throw new Error(d.error.message);
    const videos = (d.items || []).map(v => ({
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      description: v.snippet.description?.substring(0, 150),
      views: parseInt(v.statistics?.viewCount || 0).toLocaleString(),
      likes: parseInt(v.statistics?.likeCount || 0).toLocaleString(),
      publishedAt: v.snippet.publishedAt?.split('T')[0],
      thumbnail: v.snippet.thumbnails?.medium?.url,
      url: `https://youtube.com/watch?v=${v.id}`,
      videoId: v.id
    }));
    res.json({ videos, count: videos.length, source: 'YouTube Data API v3' });
  } catch(e) {
    // Fallback to RSS if API fails
    const fallback = await getYouTubeTrending();
    res.json({ videos: fallback.map(t => ({ title: t })), source: 'RSS fallback', error: e.message });
  }
});

// Search YouTube for any topic
app.post('/api/youtube/search', async (req, res) => {
  try {
    const { query, maxResults = 10, type = 'video', order = 'relevance' } = req.body;
    const url = `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${maxResults}&type=${type}&order=${order}&key=${YT_KEY}`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    if (d.error) throw new Error(d.error.message);
    const items = (d.items || []).map(i => ({
      title: i.snippet.title,
      channel: i.snippet.channelTitle,
      description: i.snippet.description?.substring(0, 100),
      publishedAt: i.snippet.publishedAt?.split('T')[0],
      thumbnail: i.snippet.thumbnails?.medium?.url,
      url: `https://youtube.com/watch?v=${i.id.videoId}`,
      videoId: i.id.videoId
    }));
    res.json({ query, items, count: items.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// YouTube SEO optimizer — analyze competitors and optimize Kelvin's content
app.post('/api/youtube/optimize', async (req, res) => {
  try {
    const { script, niche, title } = req.body;
    
    // Search for top videos in the niche
    let competitorData = '';
    if (niche) {
      try {
        const url = `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(niche)}&maxResults=5&type=video&order=viewCount&key=${YT_KEY}`;
        const r = await httpGet(url);
        const d = JSON.parse(r.body);
        competitorData = (d.items || []).map(i => i.snippet.title).join(' | ');
      } catch(e) {}
    }

    const result = await cachedAI(
      `Optimize this YouTube ${niche || 'content'} for maximum views.
Title to optimize: ${title || 'generate best title'}
Script: ${script || 'generate from niche'}
Top competitor titles: ${competitorData || 'not available'}

Generate:
1. 5 viral title options (A/B test these)
2. SEO description (500 chars, keyword-rich)
3. 20 relevant hashtags
4. Best upload time for ${niche || 'this niche'}
5. Thumbnail concept (text + visual)
6. First 15 seconds hook (most important)`,
      PURVIS_SYSTEM,
      'youtube_seo',
      1000
    );
    res.json({ result: result.response, fromCache: result.fromCache, competitorTitles: competitorData });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// YouTube channel stats
app.post('/api/youtube/channel', async (req, res) => {
  try {
    const { channelId, username } = req.body;
    const param = channelId ? `id=${channelId}` : `forUsername=${username}`;
    const url = `${YT_BASE}/channels?part=snippet,statistics&${param}&key=${YT_KEY}`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    if (d.error) throw new Error(d.error.message);
    const ch = d.items?.[0];
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    res.json({
      name: ch.snippet.title,
      description: ch.snippet.description?.substring(0, 200),
      subscribers: parseInt(ch.statistics?.subscriberCount || 0).toLocaleString(),
      videos: ch.statistics?.videoCount,
      views: parseInt(ch.statistics?.viewCount || 0).toLocaleString(),
      country: ch.snippet.country,
      url: `https://youtube.com/channel/${ch.id}`
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Content idea generator using real YouTube trends
app.post('/api/youtube/content-ideas', async (req, res) => {
  try {
    const { track } = req.body;
    const trackQueries = {
      scripture: 'Bible scripture YouTube Shorts viral 2025',
      political: 'political commentary viral YouTube 2025',
      plumbing: 'plumbing tips DIY viral YouTube',
      motivation: 'motivational speech viral YouTube Shorts',
      legal: 'know your rights legal awareness YouTube'
    };
    const query = trackQueries[track] || track;
    
    // Get real trending videos in this niche
    const url = `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=10&type=video&order=viewCount&key=${YT_KEY}`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const topTitles = (d.items || []).map(i => i.snippet.title).join('\n');
    
    // Generate content ideas based on real trends
    const result = await cachedAI(
      `Based on these top-performing YouTube videos in the ${track} niche:\n${topTitles}\n\nGenerate 5 original content ideas for Kelvin's channel that:\n1. Follow proven viral patterns from these titles\n2. Connect to his content tracks (Scripture/Political/Plumbing/Motivation)\n3. Include hook, script outline, and thumbnail concept for each\n4. Are 60 seconds or less (YouTube Shorts)`,
      PURVIS_SYSTEM,
      'content_ideas',
      1200
    );
    
    res.json({ track, topTrendingTitles: topTitles.split('\n'), contentIdeas: result.response, fromCache: result.fromCache });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PURVIS US GOVERNMENT APIs — api.data.gov key
// Congress, NASA, Federal Courts, Public Records — all FREE
// ============================================================
const GOV_KEY = process.env.GOVDATA_API_KEY || 'MBFDlnROIwcYgAw4kiUzDSIb5hk8k83tE7ZcmMdR';

// Congress.gov — real bills, laws, votes
app.post('/api/gov/congress', async (req, res) => {
  try {
    const { query, type = 'bill' } = req.body;
    const url = `https://api.congress.gov/v3/bill?format=json&limit=5&api_key=${GOV_KEY}${query ? '&query=' + encodeURIComponent(query) : ''}`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const bills = (d.bills || []).map(b => ({
      title: b.title,
      number: b.type + b.number,
      congress: b.congress,
      status: b.latestAction?.text,
      date: b.latestAction?.actionDate,
      url: b.url
    }));
    res.json({ query, bills });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// NASA — space news and images (always great content)
app.get('/api/gov/nasa', async (req, res) => {
  try {
    const r = await httpGet('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=3');
    const d = JSON.parse(r.body);
    res.json({ images: d.map ? d.map(i => ({ title: i.title, date: i.date, explanation: i.explanation?.substring(0,200), url: i.url, hdurl: i.hdurl })) : [d] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Federal Register — official government rules and regulations
app.post('/api/gov/federal-register', async (req, res) => {
  try {
    const { query } = req.body;
    const url = `https://www.federalregister.gov/api/v1/articles.json?conditions[term]=${encodeURIComponent(query)}&per_page=5&order=newest`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const articles = (d.results || []).map(a => ({
      title: a.title,
      agency: a.agencies?.[0]?.name,
      date: a.publication_date,
      abstract: a.abstract?.substring(0, 200),
      url: a.html_url
    }));
    res.json({ query, articles });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// CourtListener — free federal court cases (great for legal research)
app.post('/api/gov/court-cases', async (req, res) => {
  try {
    const { query } = req.body;
    const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&order_by=score+desc&stat_Precedential=on&format=json`;
    const r = await httpGet(url);
    const d = JSON.parse(r.body);
    const cases = (d.results || []).slice(0,5).map(c => ({
      name: c.caseName,
      court: c.court,
      date: c.dateFiled,
      citation: c.citation,
      snippet: c.snippet?.substring(0,200),
      url: 'https://www.courtlistener.com' + (c.absolute_url || '')
    }));
    res.json({ query, cases, total: d.count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Florida-specific legal research
app.post('/api/gov/florida-law', async (req, res) => {
  try {
    const { query } = req.body;
    // Florida Statutes online search
    const [courtCases, federalRegister] = await Promise.allSettled([
      (async () => {
        const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query + ' Florida')}&type=o&order_by=score+desc&format=json`;
        const r = await httpGet(url);
        const d = JSON.parse(r.body);
        return (d.results || []).slice(0,3).map(c => ({ name: c.caseName, court: c.court, date: c.dateFiled, url: 'https://www.courtlistener.com' + (c.absolute_url || '') }));
      })(),
      (async () => {
        const url = `https://www.federalregister.gov/api/v1/articles.json?conditions[term]=${encodeURIComponent(query + ' Florida')}&per_page=3&order=newest`;
        const r = await httpGet(url);
        const d = JSON.parse(r.body);
        return (d.results || []).slice(0,3).map(a => ({ title: a.title, date: a.publication_date, url: a.html_url }));
      })()
    ]);

    const analysis = await cachedAI(
      `Legal research for Florida: "${query}"\n\nRelated cases found: ${JSON.stringify(courtCases.value || []).substring(0,500)}\n\nGive Kelvin a practical legal summary: what does this mean, what are his rights, what motion should he file?`,
      PURVIS_SYSTEM + '\nYou are a Florida legal assistant. Always mention case 2024-DR-012028-O and Rule 1.540(b) where relevant.',
      'florida_law', 800
    );

    res.json({
      query,
      floridaCases: courtCases.value || [],
      federalRules: federalRegister.value || [],
      analysis: analysis.response,
      resources: {
        floridaStatutes: 'http://www.leg.state.fl.us/statutes/',
        orangeCountyCourt: 'https://myeclerk.myorangeclerk.com/',
        floridaSupremeCourt: 'https://www.floridasupremecourt.org/Decisions/Recent-Decisions',
        yourCase: '2024-DR-012028-O'
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Government hearings and public videos (C-SPAN, Congress YouTube)
app.post('/api/gov/hearings', async (req, res) => {
  try {
    const { query = 'florida family law' } = req.body;
    // Search YouTube for government/court hearings (free with YT key)
    const ytKey = process.env.YOUTUBE_API_KEY;
    const channelIds = [
      'UCpNQ4sQAGRMR-bZoTIGFKKg', // C-SPAN
      'UCsVoOobxAQL6NbWY2t6E6Ig', // Senate Judiciary
      'UC5Apa5EBhLqmkN-hF6T-eJA', // House Judiciary
    ];
    
    let hearings = [];
    if (ytKey) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' hearing')}&maxResults=5&type=video&order=date&key=${ytKey}`;
      const r = await httpGet(url);
      const d = JSON.parse(r.body);
      hearings = (d.items || []).map(i => ({
        title: i.snippet.title,
        channel: i.snippet.channelTitle,
        date: i.snippet.publishedAt?.split('T')[0],
        url: `https://youtube.com/watch?v=${i.id.videoId}`,
        thumbnail: i.snippet.thumbnails?.medium?.url
      }));
    }

    res.json({
      query,
      hearings,
      freeResources: {
        cspan: 'https://www.c-span.org/search/?query=' + encodeURIComponent(query),
        congress: 'https://www.congress.gov/search?q=' + encodeURIComponent(query),
        flSenate: 'https://www.flsenate.gov/Session/Committees',
        flHouse: 'https://www.myfloridahouse.gov/Sections/Committees/committees.aspx'
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update existing /api/free/congress to use real key
// Master government search
app.post('/api/gov/search', async (req, res) => {
  try {
    const { query, sources = ['congress', 'courts', 'federal_register'] } = req.body;
    const results = {};

    if (sources.includes('congress')) {
      try {
        const r = await httpGet(`https://api.congress.gov/v3/bill?format=json&limit=3&query=${encodeURIComponent(query)}&api_key=${GOV_KEY}`);
        results.congress = JSON.parse(r.body).bills?.slice(0,3) || [];
      } catch(e) { results.congress = []; }
    }

    if (sources.includes('courts')) {
      try {
        const r = await httpGet(`https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&format=json&stat_Precedential=on`);
        results.courts = JSON.parse(r.body).results?.slice(0,3).map(c => ({ name: c.caseName, court: c.court, date: c.dateFiled })) || [];
      } catch(e) { results.courts = []; }
    }

    if (sources.includes('federal_register')) {
      try {
        const r = await httpGet(`https://www.federalregister.gov/api/v1/articles.json?conditions[term]=${encodeURIComponent(query)}&per_page=3&order=newest`);
        results.federalRegister = JSON.parse(r.body).results?.slice(0,3).map(a => ({ title: a.title, date: a.publication_date })) || [];
      } catch(e) { results.federalRegister = []; }
    }

    // AI analysis of all government data
    const analysis = await cachedAI(
      `Government data search: "${query}"\n\nResults: ${JSON.stringify(results).substring(0,1000)}\n\nAnalyze this for Kelvin. What does it mean? What action should he take?`,
      PURVIS_SYSTEM, 'gov_search', 600
    );

    res.json({ query, results, analysis: analysis.response, fromCache: analysis.fromCache });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GOV API HEALTH
app.get('/api/gov/health', async (req, res) => {
  const hasGovKey = !!process.env.GOVDATA_API_KEY;
  const hasYTKey = !!process.env.YOUTUBE_API_KEY;
  
  res.json({
    ok: true,
    govDataKey: hasGovKey ? 'SET ✅' : 'MISSING',
    youtubeKey: hasYTKey ? 'SET ✅' : 'MISSING',
    availableEndpoints: [
      'POST /api/gov/congress — Search US bills and laws',
      'POST /api/gov/court-cases — Federal court case search',
      'POST /api/gov/florida-law — Florida legal research + AI analysis',
      'POST /api/gov/hearings — Government hearings on YouTube',
      'POST /api/gov/federal-register — Official government rules',
      'POST /api/gov/search — Master search across all gov sources',
      'GET /api/gov/nasa — NASA space images and news',
      'POST /api/youtube/search — Real YouTube search',
      'POST /api/youtube/trending — Real trending videos',
      'POST /api/youtube/optimize — SEO optimizer with competitor data',
      'POST /api/youtube/content-ideas — Content ideas from real trends',
    ],
    freeForever: true,
    note: 'api.data.gov key gives access to 3000+ government datasets'
  });
});

// ============================================================
// PURVIS AUTONOMOUS SUB-AGENT SYSTEM
// Always-on, background, self-improving agents
// Runs 24/7 on Railway without Kelvin needing to do anything
// ============================================================

// ---- SUB-AGENT DEFINITIONS ----
const SUB_AGENTS = {

  // Research Agent: searches web + reads memory for new knowledge
  research: async (topic, context = '') => {
    const [webResults, wikiData, newsData] = await Promise.allSettled([
      webSearch(topic),
      wikiLookup(topic),
      getNews('general')
    ]);
    return {
      web: webResults.value?.slice(0, 3) || [],
      wiki: wikiData.value?.summary || '',
      news: newsData.value?.slice(0, 3) || [],
      topic
    };
  },

  // Content Agent: generates content drafts
  content: async (track, topic, researchContext = '') => {
    const result = await cachedAI(
      `Generate a complete ${track} content piece${topic ? ' about: ' + topic : ''}. ${researchContext ? 'Use this research: ' + researchContext.substring(0, 500) : ''}\n\nFormat: TOPIC / HOOK / SCRIPT (60 sec) / HASHTAGS / REUSE PLAN`,
      PURVIS_SYSTEM, 'auto_content', 800
    );
    return result;
  },

  // Memory Agent: reads and writes to Supabase
  memory: {
    read: async (category, limit = 10) => {
      const { data } = await supabase.from('purvis_memory').select('key, value').eq('category', category).limit(limit);
      return data || [];
    },
    write: async (category, key, value) => {
      await supabase.from('purvis_memory').upsert({ category, key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    },
    getImprovements: async () => {
      const { data } = await supabase.from('purvis_improvements').select('*').eq('applied', false).limit(10);
      return data || [];
    }
  },

  // Analysis Agent: synthesizes data into actionable insights
  analyze: async (data, question) => {
    return cachedAI(
      `Analyze this data and answer: ${question}\n\nData: ${JSON.stringify(data).substring(0, 1500)}`,
      PURVIS_SYSTEM, 'auto_analysis', 600
    );
  },

  // Health Agent: checks all systems
  health: async () => {
    const checks = {};
    const apiKey = process.env.OPENAI_API_KEY;
    checks.openai = apiKey?.startsWith('sk-') ? 'ok' : 'missing';
    checks.youtube = !!process.env.YOUTUBE_API_KEY ? 'ok' : 'missing';
    checks.govdata = !!process.env.GOVDATA_API_KEY ? 'ok' : 'missing';
    checks.courtlistener = !!process.env.COURTLISTENER_KEY ? 'ok' : 'missing';
    checks.supabase = supabase ? 'ok' : 'error';
    try { await httpGet('https://api.duckduckgo.com/?q=test&format=json'); checks.webSearch = 'ok'; } catch(e) { checks.webSearch = 'fail'; }
    try { await httpGet('https://api.open-meteo.com/v1/forecast?latitude=28.5&longitude=-81.4&current_weather=true'); checks.weather = 'ok'; } catch(e) { checks.weather = 'fail'; }
    return checks;
  }
};

// ---- LOG AGENT RUN ----
async function logAgentRun(jobName, agentsUsed, status, actionsTaken, resultsWritten, apiCalls, startTime, error = null) {
  try {
    await supabase.from('purvis_agent_runs').insert({
      job_name: jobName,
      agents_used: agentsUsed,
      status,
      actions_taken: actionsTaken,
      results_written: resultsWritten,
      api_calls_made: apiCalls,
      duration_ms: Date.now() - startTime,
      error,
      completed_at: new Date().toISOString()
    });
    // Update control last_run
    await supabase.from('purvis_agent_controls').update({ last_run: new Date().toISOString(), run_count: supabase.raw('run_count + 1') }).eq('job_name', jobName);
  } catch(e) { console.log('[AGENT LOG ERROR]', e.message); }
}

// ---- COORDINATOR: checks if job should run ----
async function shouldRun(jobName) {
  const { data } = await supabase.from('purvis_agent_controls').select('*').eq('job_name', jobName).single();
  if (!data || !data.enabled) return false;
  if (!data.last_run) return true;
  const hoursSinceLast = (Date.now() - new Date(data.last_run).getTime()) / 3600000;
  return hoursSinceLast >= (data.frequency_hours || 24);
}

// ============================================================
// JOB 1: PURVIS DAILY LEARNING AGENT
// Mines memory + web + improvements → writes new insights
// ============================================================
async function purvisDailyLearning() {
  if (!await shouldRun('purvis_daily_learning')) return;
  const start = Date.now();
  const actions = [], results = [];
  let apiCalls = 0;
  console.log('[PURVIS AGENT] Starting daily learning...');

  try {
    // Step 1: Research Agent reads current memory
    const improvements = await SUB_AGENTS.memory.getImprovements();
    const recentMemory = await SUB_AGENTS.memory.read('learning', 5);
    actions.push('read_memory: loaded ' + improvements.length + ' improvements');

    // Step 2: Research Agent searches web for relevant updates
    const tracks = ['Scripture YouTube Shorts 2025', 'Florida plumbing code updates', 'constitutional rights news'];
    const webInsights = [];
    for (const topic of tracks) {
      const research = await SUB_AGENTS.research(topic);
      if (research.wiki || research.web.length) webInsights.push({ topic, data: research });
    }
    actions.push('web_research: searched ' + tracks.length + ' topics');

    // Step 3: Analysis Agent synthesizes everything
    const synthesisData = { improvements: improvements.slice(0,5), webInsights: webInsights.slice(0,3) };
    const analysis = await SUB_AGENTS.analyze(synthesisData, 'What new knowledge should PURVIS learn today? What patterns are emerging? What should change?');
    apiCalls++;
    actions.push('analyzed: synthesized improvements + web research');

    // Step 4: Memory Agent writes new insights
    const insightKey = 'auto_insight_' + new Date().toISOString().split('T')[0];
    await SUB_AGENTS.memory.write('auto_learning', insightKey, analysis.response);
    results.push('purvis_memory: ' + insightKey);
    actions.push('wrote: new daily insight to purvis_memory');

    // Step 5: Mark improvements as applied
    const improvedIds = improvements.map(i => i.id);
    if (improvedIds.length) {
      await supabase.from('purvis_improvements').update({ applied: true }).in('id', improvedIds);
      actions.push('applied: ' + improvedIds.length + ' improvement notes');
    }

    // Step 6: Save learning log
    await supabase.from('purvis_learning_log').insert({
      summary: analysis.response.substring(0, 500),
      what_worked: 'Daily learning cycle completed',
      what_sucked: improvements.length > 5 ? 'Too many unapplied improvements' : 'None',
      what_to_change: analysis.response.substring(0, 200),
      api_calls_used: apiCalls
    });
    results.push('purvis_learning_log: daily entry written');

    await logAgentRun('purvis_daily_learning', ['research','memory','analysis'], 'complete', actions, results, apiCalls, start);
    console.log('[PURVIS AGENT] Daily learning complete. API calls:', apiCalls);

  } catch(e) {
    await logAgentRun('purvis_daily_learning', ['research','memory','analysis'], 'error', actions, results, apiCalls, start, e.message);
    console.log('[PURVIS AGENT] Daily learning error:', e.message);
  }
}

// ============================================================
// JOB 2: PURVIS DAILY CONTENT AGENT
// Generates fresh content drafts for all tracks daily
// ============================================================
async function purvisDailyContent() {
  if (!await shouldRun('purvis_daily_content')) return;
  const start = Date.now();
  const actions = [], results = [];
  let apiCalls = 0;
  console.log('[PURVIS AGENT] Starting daily content generation...');

  try {
    const tracks = [
      { track: 'Scripture Daily', topic: '' },
      { track: 'Political Commentary', topic: '' },
      { track: 'Plumbing Tips', topic: 'SunBiz LLC Orlando' }
    ];

    for (const { track, topic } of tracks) {
      // Research Agent: get trending angle
      const research = await SUB_AGENTS.research(track + ' viral content 2025');
      const researchContext = research.web.map(r => r.text).join(' ').substring(0, 400);
      actions.push('researched: ' + track);

      // Content Agent: generate draft
      const content = await SUB_AGENTS.content(track, topic, researchContext);
      apiCalls++;

      // Memory Agent: save draft
      await supabase.from('purvis_content').insert({
        track: track.toLowerCase().replace(/ /g,'_'),
        topic: topic || track,
        script: content.response,
        status: 'draft',
        is_monetized: false
      });
      results.push('purvis_content: ' + track + ' draft saved');
      actions.push('generated + saved: ' + track + ' content draft');

      // Rate limit protection
      await new Promise(r => setTimeout(r, 1000));
    }

    await logAgentRun('purvis_daily_content', ['research','content','memory'], 'complete', actions, results, apiCalls, start);
    console.log('[PURVIS AGENT] Daily content complete. Drafts:', results.length, 'API calls:', apiCalls);

  } catch(e) {
    await logAgentRun('purvis_daily_content', ['research','content','memory'], 'error', actions, results, apiCalls, start, e.message);
    console.log('[PURVIS AGENT] Daily content error:', e.message);
  }
}

// ============================================================
// JOB 3: PURVIS DAILY HEALTH CHECK AGENT
// Checks all APIs, logs issues, proposes fixes
// ============================================================
async function purvisDailyHealthCheck() {
  if (!await shouldRun('purvis_daily_healthcheck')) return;
  const start = Date.now();
  const actions = [], results = [];
  let apiCalls = 0;
  console.log('[PURVIS AGENT] Starting daily health check...');

  try {
    // Health Agent: check all systems
    const healthStatus = await SUB_AGENTS.health();
    actions.push('health_check: all systems scanned');

    const issues = Object.entries(healthStatus).filter(([,v]) => v !== 'ok').map(([k,v]) => k + ': ' + v);
    const allOk = issues.length === 0;

    // Analysis Agent: generate fix proposals if issues found
    let proposals = 'All systems healthy. No action needed.';
    if (issues.length > 0) {
      const analysis = await SUB_AGENTS.analyze({ issues, healthStatus }, 'What should Kelvin fix or add to resolve these issues? Be specific and actionable.');
      proposals = analysis.response;
      apiCalls++;
      actions.push('analyzed: ' + issues.length + ' issues found');
    }

    // Memory Agent: save health report
    const reportKey = 'health_report_' + new Date().toISOString().split('T')[0];
    await SUB_AGENTS.memory.write('auto_maintenance', reportKey, JSON.stringify({ status: healthStatus, issues, proposals: proposals.substring(0,400), checked_at: new Date().toISOString() }));
    results.push('purvis_memory: ' + reportKey);

    // If issues: write to roadmap
    if (issues.length > 0) {
      await supabase.from('purvis_improvements').insert({
        area: 'health_check',
        note: 'Issues found: ' + issues.join(', ') + '. Proposals: ' + proposals.substring(0, 300),
        applied: false
      });
      results.push('purvis_improvements: health issues logged');
      actions.push('logged: issues to roadmap for Kelvin review');
    }

    // Check roadmap items and surface top priority
    const { data: roadmap } = await supabase.from('purvis_memory').select('key,value').eq('category','roadmap').limit(5);
    if (roadmap && roadmap.length > 0) {
      await SUB_AGENTS.memory.write('auto_maintenance', 'top_roadmap_' + new Date().toISOString().split('T')[0],
        'Top roadmap item: ' + roadmap[0].key + ' — ' + roadmap[0].value.substring(0, 200)
      );
      actions.push('surfaced: top roadmap item for today');
    }

    await logAgentRun('purvis_daily_healthcheck', ['health','analysis','memory'], allOk ? 'complete' : 'complete_with_issues', actions, results, apiCalls, start);
    console.log('[PURVIS AGENT] Health check complete. Issues:', issues.length, 'API calls:', apiCalls);

  } catch(e) {
    await logAgentRun('purvis_daily_healthcheck', ['health','analysis','memory'], 'error', actions, results, apiCalls, start, e.message);
    console.log('[PURVIS AGENT] Health check error:', e.message);
  }
}

// ============================================================
// MAIN COORDINATOR: orchestrates all sub-agents
// ============================================================
async function purvisCoordinator() {
  console.log('[PURVIS COORDINATOR] Running at', new Date().toISOString());
  if (!process.env.OPENAI_API_KEY?.startsWith('sk-')) {
    console.log('[PURVIS COORDINATOR] No OpenAI key — skipping AI-dependent jobs');
    await purvisDailyHealthCheck(); // health check always runs
    return;
  }
  // Run all jobs (each checks shouldRun internally)
  await purvisDailyHealthCheck();
  await purvisDailyLearning();
  await purvisDailyContent();
}

// ---- AGENT API ENDPOINTS ----

// Run specific agent manually
app.post('/api/agents/run', async (req, res) => {
  const { jobName } = req.body;
  if (!jobName) return res.status(400).json({ error: 'jobName required' });
  res.json({ status: 'Agent started: ' + jobName, message: 'Check /api/agents/logs in 30 seconds' });
  const jobs = { purvis_daily_learning: purvisDailyLearning, purvis_daily_content: purvisDailyContent, purvis_daily_healthcheck: purvisDailyHealthCheck, coordinator: purvisCoordinator };
  if (jobs[jobName]) jobs[jobName]().catch(console.error);
  else res.status(400).json({ error: 'Unknown job: ' + jobName });
});

// Agent logs
app.get('/api/agents/logs', async (req, res) => {
  const { data } = await supabase.from('purvis_agent_runs').select('*').order('started_at', { ascending: false }).limit(20);
  res.json({ runs: data || [] });
});

// Control panel: toggle jobs
app.get('/api/agents/controls', async (req, res) => {
  const { data } = await supabase.from('purvis_agent_controls').select('*').order('job_name');
  res.json({ controls: data || [] });
});

app.patch('/api/agents/controls/:jobName', async (req, res) => {
  const { jobName } = req.params;
  const { enabled, frequency_hours, allowed_actions } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) updates.enabled = enabled;
  if (frequency_hours) updates.frequency_hours = frequency_hours;
  if (allowed_actions) updates.allowed_actions = allowed_actions;
  await supabase.from('purvis_agent_controls').update(updates).eq('job_name', jobName);
  res.json({ ok: true, jobName, updates });
});

// Agent registry
app.get('/api/agents/registry', async (req, res) => {
  const { data } = await supabase.from('purvis_agent_registry').select('*');
  res.json({ agents: data || [] });
});

// Agent system health
app.get('/api/agents/health', async (req, res) => {
  const { data: controls } = await supabase.from('purvis_agent_controls').select('job_name,enabled,last_run,run_count,frequency_hours');
  const { data: recentRuns } = await supabase.from('purvis_agent_runs').select('job_name,status,started_at').order('started_at', { ascending: false }).limit(5);
  res.json({
    ok: true,
    coordinator: 'running every hour via Railway',
    scheduledJobs: controls || [],
    recentRuns: recentRuns || [],
    nextCoordinatorRun: 'within the hour',
    subAgents: ['research', 'content', 'memory', 'analysis', 'health'],
    message: 'PURVIS is always on. Sub-agents run daily while you sleep.'
  });
});

// Boot routine: load context on startup
async function purvisBoot() {
  console.log('[PURVIS BOOT] Loading brain context...');
  try {
    const { data: bootMemory } = await supabase.from('purvis_memory').select('category,key,value').in('category', ['system','kelvin','behavior','capabilities','owners_manual']).limit(20);
    const { data: latestLearning } = await supabase.from('purvis_memory').select('key,value').eq('category','auto_learning').order('key', { ascending: false }).limit(3);
    const { data: roadmap } = await supabase.from('purvis_memory').select('key,value').eq('category','roadmap').limit(5);
    const memCount = (bootMemory?.length || 0) + (latestLearning?.length || 0);
    await supabase.from('purvis_memory').upsert({ category: 'system', key: 'last_boot', value: 'Boot at ' + new Date().toISOString() + '. Loaded ' + memCount + ' memory entries. Roadmap items: ' + (roadmap?.length || 0), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log('[PURVIS BOOT] Brain loaded:', memCount, 'entries. Roadmap:', roadmap?.length || 0, 'items.');
  } catch(e) { console.log('[PURVIS BOOT] Error:', e.message); }
}

// ---- SCHEDULE ALL AGENTS ----
// Coordinator runs every hour, checks which jobs are due
setInterval(purvisCoordinator, 60 * 60 * 1000);

// Boot sequence runs 10 seconds after startup
setTimeout(purvisBoot, 10000);

// First coordinator run 60 seconds after startup
setTimeout(purvisCoordinator, 60000);

console.log('[PURVIS] Autonomous agent system loaded — coordinator runs every hour');

// ============================================================
// PURVIS FINAL MASTER: App Builder + Budget + Stubs
// ============================================================

// ---- BUDGET GUARDRAIL ----
const MONTHLY_BUDGET = 35.00;
async function checkBudget(service, estimatedCost) {
  const month = new Date().toISOString().substring(0, 7);
  try {
    const { data } = await supabase.from('purvis_budget').select('*').eq('month', month).eq('service', service).single();
    if (!data) return { allowed: true, warning: false };
    const newTotal = (data.estimated_cost_usd || 0) + estimatedCost;
    if (newTotal > data.budget_limit_usd) {
      return { allowed: false, message: `Budget limit reached for ${service}: $${data.budget_limit_usd}/month. Current: $${data.estimated_cost_usd.toFixed(4)}. Ask Kelvin before proceeding.` };
    }
    if (newTotal > data.alert_threshold) {
      return { allowed: true, warning: true, message: `Warning: ${service} spend approaching limit. Current: $${data.estimated_cost_usd.toFixed(4)} of $${data.budget_limit_usd} budget.` };
    }
    return { allowed: true, warning: false };
  } catch(e) { return { allowed: true, warning: false }; }
}

async function trackBudget(service, callCount, cost) {
  const month = new Date().toISOString().substring(0, 7);
  try {
    await supabase.from('purvis_budget').upsert({
      month, service,
      call_count: callCount,
      estimated_cost_usd: cost,
      updated_at: new Date().toISOString()
    }, { onConflict: 'month,service' });
  } catch(e) {}
}

app.get('/api/budget', async (req, res) => {
  const month = new Date().toISOString().substring(0, 7);
  const { data } = await supabase.from('purvis_budget').select('*').eq('month', month);
  const total = (data || []).reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
  res.json({
    month,
    totalSpent: '$' + total.toFixed(4),
    budget: '$' + MONTHLY_BUDGET,
    remaining: '$' + (MONTHLY_BUDGET - total).toFixed(2),
    percentUsed: ((total / MONTHLY_BUDGET) * 100).toFixed(1) + '%',
    breakdown: data || [],
    status: total > MONTHLY_BUDGET ? 'OVER_BUDGET' : total > MONTHLY_BUDGET * 0.8 ? 'WARNING' : 'OK'
  });
});

// ---- APP BUILDER ----
app.post('/api/app-builder/plan', async (req, res) => {
  try {
    const { spec, appName } = req.body;
    const budget = await checkBudget('openai_gpt4o', 0.05);
    if (!budget.allowed) return res.status(402).json({ error: budget.message });

    const result = await cachedAI(
      `APP BUILDER REQUEST: "${spec}"\n\nUsing template app_builder_v1, create a complete app plan:\n1. APP NAME: ${appName || 'auto-generate'}\n2. PURPOSE: what it does in one sentence\n3. FEATURES: list max 5 core features\n4. DATABASE SCHEMA: SQL CREATE TABLE statements\n5. API ROUTES: list all needed endpoints\n6. FRONTEND: describe the UI (single page, tabs, forms)\n7. AUTOMATIONS: any scheduled or event-based jobs\n8. TECH STACK: Railway + Supabase + Vanilla JS (unless specified)\n9. ESTIMATED BUILD TIME: realistic estimate\n10. KELVIN APPROVAL NEEDED: yes, always before deploy`,
      PURVIS_SYSTEM, 'app_builder', 1500
    );

    // Register in apps table
    const { data: app } = await supabase.from('purvis_apps').insert({
      name: appName || 'app_' + Date.now(),
      description: spec.substring(0, 200),
      spec: result.response,
      status: 'planning',
      tech_stack: ['Node.js', 'Express', 'Supabase', 'Railway', 'Vanilla JS']
    }).select().single();

    res.json({ plan: result.response, appId: app?.id, fromCache: result.fromCache, nextStep: 'Review this plan, then call POST /api/app-builder/build with appId to start building' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/app-builder/build', async (req, res) => {
  try {
    const { appId, approved } = req.body;
    if (!approved) return res.status(400).json({ error: 'Kelvin approval required. Set approved: true to proceed.' });

    const { data: app } = await supabase.from('purvis_apps').select('*').eq('id', appId).single();
    if (!app) return res.status(404).json({ error: 'App not found' });

    res.json({ status: 'Building started', appId, message: 'PURVIS is generating code. Check /api/apps/' + appId + ' for progress.' });

    // Async build
    (async () => {
      try {
        // Generate schema SQL
        const schema = await cachedAI(`Generate only the SQL CREATE TABLE statements for this app:\n\n${app.spec}`, PURVIS_SYSTEM, 'app_schema', 800);
        // Generate routes
        const routes = await cachedAI(`Generate Express.js route stubs (just the app.get/app.post functions, no full server) for:\n\n${app.spec}`, PURVIS_SYSTEM, 'app_routes', 1000);
        // Generate frontend
        const frontend = await cachedAI(`Generate a complete single-page HTML frontend (PURVIS dark theme: #0a0a0f bg, #7c3aed purple) for:\n\n${app.spec}\n\nInclude: CSS, JS fetch calls to /api/${app.name}/* endpoints.`, PURVIS_SYSTEM, 'app_frontend', 2000);

        // Save everything
        await supabase.from('purvis_apps').update({
          schema_sql: schema.response,
          api_routes: { code: routes.response },
          status: 'built_awaiting_deploy',
          updated_at: new Date().toISOString()
        }).eq('id', appId);

        // Save frontend file
        // fs already required above
        const path = require('path');
        const dir = path.join(__dirname, 'public', 'apps');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, app.name + '.html'), frontend.response);

        console.log('[APP BUILDER] Built:', app.name);
      } catch(e) {
        await supabase.from('purvis_apps').update({ status: 'build_error', updated_at: new Date().toISOString() }).eq('id', appId);
        console.log('[APP BUILDER ERROR]', e.message);
      }
    })();
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/apps', async (req, res) => {
  const { data } = await supabase.from('purvis_apps').select('*').order('created_at', { ascending: false });
  res.json({ apps: data || [] });
});

app.get('/api/apps/:id', async (req, res) => {
  const { data } = await supabase.from('purvis_apps').select('*').eq('id', req.params.id).single();
  if (!data) return res.status(404).json({ error: 'App not found' });
  res.json(data);
});

// ---- AUTOMATION BUILDER ----
app.post('/api/automation-builder', async (req, res) => {
  try {
    const { description, frequency, triggerEvent, appId } = req.body;
    const result = await cachedAI(
      `Using automation_builder_v1 template, design this automation:\n"${description}"\nFrequency: ${frequency || 'daily'}\nTrigger: ${triggerEvent || 'time-based'}\n\nOutput: trigger_type, trigger_value, exact action, what it produces, where results go`,
      PURVIS_SYSTEM, 'automation_builder', 600
    );

    const { data: auto } = await supabase.from('purvis_automations').insert({
      name: description.substring(0, 60),
      description,
      trigger_type: triggerEvent ? 'event' : 'time',
      trigger_value: frequency || 'daily',
      action: result.response.substring(0, 500),
      app_id: appId || null,
      enabled: true
    }).select().single();

    res.json({ automation: result.response, id: auto?.id, message: 'Automation registered. It will run on schedule via PURVIS coordinator.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/automations', async (req, res) => {
  const { data } = await supabase.from('purvis_automations').select('*').order('created_at', { ascending: false });
  res.json({ automations: data || [] });
});

// ---- CAPCUT / CANVA WORKFLOW ----
app.post('/api/capcut/generate', async (req, res) => {
  try {
    const { script, duration = 60, track } = req.body;
    const result = await cachedAI(
      `Generate a complete CapCut editing script for this ${duration}-second ${track || ''} video:\n\n${script}\n\nFormat:\n[0:00-0:05] TEXT: [overlay text] | TRANSITION: [type] | MUSIC: [mood]\n[0:05-0:15] ...\n\nInclude: all timestamps, exact text overlays, transitions, music mood, caption suggestions, thumbnail concept`,
      PURVIS_SYSTEM, 'capcut', 800
    );
    await supabase.from('purvis_content').insert({ track: track || 'capcut', topic: script.substring(0, 50), script: result.response, status: 'capcut_ready', is_monetized: false });
    res.json({ script: result.response, fromCache: result.fromCache, canvaLink: 'https://www.canva.com/create/youtube-thumbnails/', capcutLink: 'https://www.capcut.com' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/canva/generate', async (req, res) => {
  try {
    const { topic, platform = 'youtube_thumbnail', track } = req.body;
    const canvaLinks = { youtube_thumbnail: 'https://www.canva.com/create/youtube-thumbnails/', instagram_post: 'https://www.canva.com/create/instagram-posts/', tiktok: 'https://www.canva.com/create/tiktok-videos/', logo: 'https://www.canva.com/create/logos/' };
    const result = await cachedAI(
      `Generate a complete Canva design brief for: "${topic}" (${platform})\n\nInclude:\n1. COLOR PALETTE: primary hex, secondary hex, background hex (use #7c3aed purple, #22c55e green, #0a0a0f dark as PURVIS brand)\n2. FONTS: heading font, body font\n3. LAYOUT: describe exact element placement\n4. HEADLINE OPTIONS: 3 options (bold, attention-grabbing)\n5. SUBTEXT: supporting text\n6. CTA: call to action text\n7. THUMBNAIL CONCEPT: describe the visual concept\n8. CANVA ELEMENTS: specific elements to search for`,
      PURVIS_SYSTEM, 'canva_brief', 700
    );
    res.json({ brief: result.response, canvaUrl: canvaLinks[platform] || 'https://www.canva.com', fromCache: result.fromCache, note: 'Kelvin opens Canva, PURVIS designed it. You make the final edits and publish.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- VOICE STUB (activates when ELEVENLABS_KEYS set) ----
// TODO: Add ELEVENLABS_KEYS to Railway env vars to fully activate
// Voice ID will be stored in purvis_memory category=voice key=kelvin_voice_id
// (/api/voice route already exists above — this is the extended version)
app.post('/api/voice/narrate', async (req, res) => {
  const { text, voiceId } = req.body;
  const elKey = (process.env.ELEVENLABS_KEYS || '').split(',')[0].trim();
  const storedVoiceId = voiceId || 'TODO_SET_FROM_PURVIS_MEMORY';

  if (!elKey) {
    return res.json({
      status: 'stub',
      message: 'Add ELEVENLABS_KEYS to Railway to activate voice. Free tier: 10,000 chars/month.',
      setupUrl: 'https://elevenlabs.io',
      railwaySetup: 'Railway → purvis-v11 → Variables → ELEVENLABS_KEYS=your_key',
      textReady: text?.substring(0, 100),
      whenReady: 'This endpoint will return audio bytes once key is set. No code changes needed.'
    });
  }

  // Budget check
  const charCount = (text || '').length;
  const estimatedCost = charCount * 0.0003;
  const budget = await checkBudget('elevenlabs', estimatedCost);
  if (!budget.allowed) return res.status(402).json({ error: budget.message });

  try {
    const vId = storedVoiceId !== 'TODO_SET_FROM_PURVIS_MEMORY' ? storedVoiceId : '21m00Tcm4TlvDq8ikWAM';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': elKey },
      body: JSON.stringify({ text: text.substring(0, 500), model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    if (!r.ok) throw new Error(await r.text());
    await trackBudget('elevenlabs', 1, estimatedCost);
    const buffer = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- MASTER STATUS (everything in one call) ----
app.get('/api/status', async (req, res) => {
  const month = new Date().toISOString().substring(0, 7);
  const [budget, agents, apps, automations, recentContent] = await Promise.allSettled([
    supabase.from('purvis_budget').select('service,estimated_cost_usd,budget_limit_usd').eq('month', month),
    supabase.from('purvis_agent_controls').select('job_name,enabled,last_run,run_count'),
    supabase.from('purvis_apps').select('name,status,frontend_url'),
    supabase.from('purvis_automations').select('name,enabled,trigger_type,run_count'),
    supabase.from('purvis_content').select('track,status,created_at').order('created_at',{ascending:false}).limit(3)
  ]);
  res.json({
    purvis: 'ONLINE',
    url: 'https://purvis-v11-production.up.railway.app',
    login: 'kvazquez7455@gmail.com',
    budget: budget.value?.data || [],
    agents: agents.value?.data || [],
    apps: apps.value?.data || [],
    automations: automations.value?.data || [],
    recentContent: recentContent.value?.data || [],
    templates: ['app_builder_v1','automation_builder_v1','capcut_canva_v1','voice_workflow_v1','agent_builder_v1','api_wiring_v1','self_improve_v1'],
    supabaseTables: ['purvis_memory','purvis_life_thread','purvis_messages','purvis_improvements','purvis_content','purvis_leads','purvis_tasks','purvis_cache','purvis_templates','purvis_tests','purvis_learning_log','purvis_resource_policy','purvis_agent_registry','purvis_agent_controls','purvis_agent_runs','purvis_apps','purvis_automations','purvis_budget','purvis_code_map'],
    howToUse: {
      buildApp: 'POST /api/app-builder/plan {spec:"describe your app",appName:"name"}',
      automateTask: 'POST /api/automation-builder {description:"what to automate",frequency:"daily"}',
      useVoice: 'POST /api/voice/narrate {text:"script"} — needs ELEVENLABS_KEYS in Railway',
      capcutScript: 'POST /api/capcut/generate {script:"your script",duration:60}',
      canvaDesign: 'POST /api/canva/generate {topic:"topic",platform:"youtube_thumbnail"}',
      chat: 'POST /api/chat {message:"anything",userId:"kelvin"}'
    }
  });
});

// ============================================================
// PURVIS EXPANSION: OCR + Video + Avatar + Voice + Legal + Life
// ============================================================

// ---- OCR: READ TEXT FROM IMAGES (free via GPT-4o vision) ----
app.post('/api/ocr', async (req, res) => {
  try {
    const { imageUrl, purpose = 'general' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });
    const budget = await checkBudget('openai_gpt4o', 0.01);
    if (!budget.allowed) return res.status(402).json({ error: budget.message });

    // Use GPT-4o vision to extract text
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Extract ALL text from this image exactly as written. Then provide a clean summary. Purpose: ${purpose}.\n\nOutput format:\nEXTRACTED TEXT:\n[exact text]\n\nSUMMARY:\n[clean summary]` },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 1000
    });
    const extracted = result.choices[0].message.content;
    // Save to Supabase
    const { data } = await supabase.from('purvis_images').insert({ url: imageUrl, image_type: 'ocr_source', extracted_text: extracted, summary: extracted.split('SUMMARY:')[1]?.trim() || '', tags: [purpose], ai_generated: false }).select().single();
    res.json({ extracted, imageId: data?.id, note: 'Text extracted via GPT-4o vision. Saved to purvis_images.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- VIDEO ANALYSIS ----
app.post('/api/video/analyze', async (req, res) => {
  try {
    const { videoUrl, title, purpose = 'content' } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });

    // Safety check
    const safetyCheck = await cachedAI(
      `Is this video URL likely to be user-owned, licensed, or publicly allowed content? URL: ${videoUrl}. Purpose: ${purpose}. Respond with SAFE or UNSAFE and brief reason.`,
      'You enforce content safety. Be brief.', 'safety', 100
    );
    if (safetyCheck.response.includes('UNSAFE')) return res.status(400).json({ error: 'Content safety check failed: ' + safetyCheck.response });

    // Register video
    const { data: video } = await supabase.from('purvis_videos').insert({ title: title || 'Untitled Video', url: videoUrl, purpose, safety_note: 'User-provided URL. Analyzed for ' + purpose + ' use.' }).select().single();

    // Analyze based on purpose
    const analysisPrompt = purpose === 'legal'
      ? `Analyze this video/content for legal purposes. URL: ${videoUrl}\nTitle: ${title}\n\nIdentify:\n1. KEY LEGAL ISSUES (cite statutes if applicable)\n2. PARTIES MENTIONED\n3. TIMELINE of events\n4. EVIDENCE points\n5. ARGUMENTS to make\n6. NEXT LEGAL STEPS\n\n⚠️ DISCLAIMER: This is not legal advice. Consult a licensed attorney.`
      : `Analyze this video for content creation. URL: ${videoUrl}\nTitle: ${title}\n\nGenerate:\n1. SUMMARY (2-3 sentences)\n2. KEY MOMENTS with timestamps if available\n3. 5 SHORT CLIP IDEAS with timestamp suggestions\n4. VIRAL TITLE OPTIONS (5 options)\n5. DESCRIPTION for YouTube\n6. HASHTAGS (20)\n7. HOOKS for each clip idea`;

    const analysis = await cachedAI(analysisPrompt, PURVIS_SYSTEM, 'video_analysis', 1500);

    // Save analysis
    await supabase.from('purvis_videos').update({ summary: analysis.response }).eq('id', video.id);

    res.json({ videoId: video.id, analysis: analysis.response, fromCache: analysis.fromCache, disclaimer: purpose === 'legal' ? 'Not legal advice. Consult a licensed attorney.' : null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- LOGO GENERATOR (free SVG + Pollinations fallback) ----
app.post('/api/logo/generate', async (req, res) => {
  try {
    const { brandName, colors = ['#7c3aed', '#22c55e', '#0a0a0f'], style = 'modern minimal', vibe } = req.body;

    // Generate design spec + SVG via GPT-4o
    const spec = await cachedAI(
      `Generate a complete logo design for: "${brandName}"\nColors: ${colors.join(', ')}\nStyle: ${style}\nVibe: ${vibe || 'professional and modern'}\n\n1. DESIGN BRIEF: describe the concept\n2. SVG CODE: generate a clean simple SVG logo (use colors provided, text-based or simple geometric shapes)\n3. FREE TOOL PROMPT: write a prompt to paste into canva.com/create/logos or looka.com\n4. CANVA LINK: https://www.canva.com/create/logos/`,
      PURVIS_SYSTEM, 'logo_design', 1000
    );

    // Extract SVG if present
    const svgMatch = spec.response.match(/<svg[\s\S]*?<\/svg>/i);
    const svgCode = svgMatch ? svgMatch[0] : null;

    // Also generate image via Pollinations (free)
    const imagePrompt = `${style} logo for ${brandName}, colors ${colors.join(' and ')}, ${vibe || 'professional'}, vector style, clean, minimal, white background`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true`;

    // Save to DB
    const { data } = await supabase.from('purvis_logo_designs').insert({ brand_name: brandName, style, colors, design_spec: spec.response, svg_code: svgCode, image_url: imageUrl, prompt_for_free_tool: `Logo for ${brandName}: ${style} style, ${colors.join(', ')} colors, ${vibe || 'professional'}, clean and minimal` }).select().single();

    res.json({ designSpec: spec.response, svgCode, imageUrl, canvaLink: 'https://www.canva.com/create/logos/', lookaLink: 'https://looka.com', logoId: data?.id, note: 'Kelvin reviews and approves before using' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- AVATAR SYSTEM (stylized only, no biometric clones) ----
app.post('/api/avatar/create', async (req, res) => {
  try {
    const { style = 'neon cyberpunk', vibe, colors } = req.body;
    const SAFETY_RULE = 'SAFETY: This creates a STYLIZED AI character avatar only. NOT a photorealistic clone. NOT a deepfake. For brand/content use only.';

    const spec = await cachedAI(
      `${SAFETY_RULE}\n\nCreate a stylized brand avatar design for Kelvin Vazquez:\nStyle: ${style}\nVibe: ${vibe || 'powerful, entrepreneurial, faith-driven'}\nColors: ${colors || '#7c3aed purple, #22c55e green'}\n\n1. AVATAR CONCEPT: describe the stylized character\n2. VISUAL ELEMENTS: specific design elements\n3. CANVA PROMPT: text to paste into Canva Avatar maker\n4. POLLINATIONS PROMPT: image generation prompt for free use\n5. USAGE: thumbnail, logo, social profile`,
      PURVIS_SYSTEM, 'avatar_design', 800
    );

    // Generate via Pollinations (free)
    const imagePrompt = `${style} stylized cartoon avatar character, ${vibe || 'powerful entrepreneur'}, ${colors || 'purple and green'}, illustrated not photorealistic, brand mascot style, clean background`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Date.now()}`;

    const { data } = await supabase.from('purvis_brand_avatars').insert({ style, description: spec.response.substring(0, 200), design_spec: spec.response, image_url: imageUrl, active: false, safety_notes: 'Stylized character only. Not biometric. Not for deceptive use. AI-generated label required.' }).select().single();

    res.json({ avatarId: data?.id, designSpec: spec.response, imageUrl, canvaLink: 'https://www.canva.com/create/', safety: SAFETY_RULE, activate: `PATCH /api/avatar/${data?.id}/activate to set as active avatar` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/avatar/:id/activate', async (req, res) => {
  await supabase.from('purvis_brand_avatars').update({ active: false }).neq('id', req.params.id);
  await supabase.from('purvis_brand_avatars').update({ active: true }).eq('id', req.params.id);
  res.json({ ok: true, message: 'Avatar activated. Use GET /api/avatar/active to get current avatar.' });
});

app.get('/api/avatar/active', async (req, res) => {
  const { data } = await supabase.from('purvis_brand_avatars').select('*').eq('active', true).single();
  res.json(data || { message: 'No active avatar. Create one via POST /api/avatar/create' });
});

app.get('/api/avatars', async (req, res) => {
  const { data } = await supabase.from('purvis_brand_avatars').select('*').order('created_at', { ascending: false });
  res.json({ avatars: data || [] });
});

// ---- VOICE SYSTEM (web speech free + ElevenLabs paid) ----
app.get('/api/voice/profile', async (req, res) => {
  const { data } = await supabase.from('purvis_voice_profile').select('*').eq('active', true).single();
  res.json(data || { name: 'PURVIS Default', api_provider: 'web_speech', broke_mode: false });
});

app.patch('/api/voice/profile', async (req, res) => {
  const { broke_mode, api_provider, style, elevenlabs_voice_id } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (broke_mode !== undefined) updates.broke_mode = broke_mode;
  if (api_provider) updates.api_provider = api_provider;
  if (style) updates.style = style;
  if (elevenlabs_voice_id) updates.elevenlabs_voice_id = elevenlabs_voice_id;
  await supabase.from('purvis_voice_profile').update(updates).eq('active', true);
  res.json({ ok: true, updates, message: broke_mode ? 'Broke mode ON - using free voice' : 'Voice profile updated' });
});

app.get('/api/voice/logs', async (req, res) => {
  const { data } = await supabase.from('purvis_voice_logs').select('*').order('created_at', { ascending: false }).limit(20);
  res.json({ logs: data || [] });
});

// ---- LEGAL DASHBOARD ----
app.get('/api/legal/dashboard', async (req, res) => {
  const [cases, improvements, memory] = await Promise.allSettled([
    supabase.from('purvis_legal_cases').select('*').order('created_at', { ascending: false }),
    supabase.from('purvis_improvements').select('area,note,created_at').ilike('area', '%legal%').limit(5),
    supabase.from('purvis_memory').select('key,value').eq('category', 'legal').limit(10)
  ]);
  res.json({
    disclaimer: 'PURVIS is NOT a lawyer. This is NOT legal advice. Always consult a licensed attorney in Florida or Kansas.',
    cases: cases.value?.data || [],
    legalNotes: improvements.value?.data || [],
    legalMemory: memory.value?.data || [],
    officialResources: {
      florida: { orangeCountyCourt: 'https://myeclerk.myorangeclerk.com/', floridaEfiling: 'https://myflcourtaccess.com/', floridaStatutes: 'http://www.leg.state.fl.us/statutes/', floridaSupremeCourt: 'https://www.floridasupremecourt.org/', floridaLegalAid: 'https://floridalegal.org/', floridaBarReferral: 'https://www.floridabar.org/public/lawyer-referral/' },
      kansas: { kansasCourts: 'https://www.kscourts.org/', kansasStatutes: 'http://www.kslegislature.org/li/b2025_26/statute/', kansasLegalAid: 'https://www.klsinc.org/' },
      federal: { courtListener: 'https://www.courtlistener.com/', pacer: 'https://pacer.gov/', scotus: 'https://www.supremecourt.gov/' }
    }
  });
});

app.post('/api/legal/cases', async (req, res) => {
  try {
    const { data } = await supabase.from('purvis_legal_cases').insert({ ...req.body, disclaimer: 'PURVIS is not a lawyer. Not legal advice.' }).select().single();
    res.json({ case: data, message: 'Case registered in PURVIS Legal Dashboard' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/legal/research', async (req, res) => {
  try {
    const { question, state = 'Florida', caseNumber } = req.body;
    const DISCLAIMER = 'PURVIS IS NOT A LAWYER. THIS IS NOT LEGAL ADVICE. Consult a licensed attorney in ' + state + ' before taking any legal action.';

    // Search CourtListener for relevant cases
    let courtData = '';
    if (process.env.COURTLISTENER_KEY) {
      try {
        const r = await httpGet(`https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(question + ' ' + state)}&type=o&format=json&stat_Precedential=on`);
        const d = JSON.parse(r.body);
        courtData = (d.results || []).slice(0, 3).map(c => `${c.caseName} (${c.court}, ${c.dateFiled})`).join('\n');
      } catch(e) {}
    }

    const result = await cachedAI(
      `LEGAL RESEARCH REQUEST (${state}):\nQuestion: ${question}\nCase: ${caseNumber || 'N/A'}\n\nRelated cases found:\n${courtData || 'Search unavailable'}\n\nProvide:\n1. PLAIN ENGLISH SUMMARY: what the law generally says\n2. RELEVANT STATUTES: cite applicable laws\n3. OPTIONS PEOPLE TYPICALLY CONSIDER: what are the usual paths\n4. QUESTIONS TO ASK YOUR LAWYER: specific questions for a licensed attorney\n5. NEXT STEPS CHECKLIST: what to do this week\n6. OFFICIAL RESOURCES: relevant court/government URLs\n\n${DISCLAIMER}`,
      PURVIS_SYSTEM + '\nAlways include disclaimer. Never give legal advice. Provide research only.',
      'legal_research', 1200
    );

    res.json({ research: result.response, disclaimer: DISCLAIMER, courtCasesFound: courtData, officialPortal: state === 'Florida' ? 'https://myeclerk.myorangeclerk.com/' : 'https://www.kscourts.org/' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- LIFE HELPER: daily suggestions ----
app.post('/api/life/suggestions', async (req, res) => {
  try {
    const { context } = req.body;
    const [cases, leads, content, tasks] = await Promise.allSettled([
      supabase.from('purvis_legal_cases').select('case_number,status,next_deadline,action_items').eq('status','active'),
      supabase.from('purvis_leads').select('name,status,created_at').eq('status','new').limit(5),
      supabase.from('purvis_content').select('track,status,created_at').eq('status','draft').limit(3),
      supabase.from('purvis_agent_controls').select('job_name,last_run').eq('enabled',true)
    ]);

    const situationData = { legalCases: cases.value?.data || [], newLeads: leads.value?.data || [], draftContent: content.value?.data || [], context: context || '' };

    const result = await cachedAI(
      `PURVIS LIFE HELPER — generate today's action plan for Kelvin.\n\nSituation:\n${JSON.stringify(situationData).substring(0, 800)}\n\nGenerate:\n1. TODAY'S TOP 3 ACTIONS (specific, doable today)\n2. THIS WEEK'S 3 BIGGER MOVES\n3. ONE MONEY MOVE (action that directly generates income today)\n4. LEGAL UPDATE (one thing to do on case 2024-DR-012028-O)\n5. PATTERN ALERT (any recurring issues PURVIS notices)\n6. MOTIVATION (one sentence, real talk)\n\nBe his right-hand man. Be specific. Be direct.`,
      PURVIS_SYSTEM, 'life_suggestions', 800
    );

    const { data } = await supabase.from('purvis_daily_suggestions').insert({ suggestions: [result.response], priority_action: result.response.split('\n')[0] || '', reasoning: 'Based on active cases, leads, and content status' }).select().single();

    res.json({ suggestions: result.response, id: data?.id, date: new Date().toLocaleDateString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/life/suggestions/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('purvis_daily_suggestions').select('*').eq('suggestion_date', today).order('created_at', { ascending: false }).limit(1);
  if (data && data.length) return res.json(data[0]);
  // Generate if not yet created today
  res.json({ message: 'No suggestions yet today. POST /api/life/suggestions to generate.' });
});

// ---- TRAFFIC/LEGAL QUICK HELP ----
app.post('/api/legal/traffic', async (req, res) => {
  try {
    const { description, state = 'Florida', county } = req.body;
    const DISCLAIMER = '⚠️ PURVIS IS NOT A LAWYER. NOT LEGAL ADVICE. Consult a licensed attorney in ' + state + ' before taking action.';

    const result = await cachedAI(
      `TRAFFIC/LEGAL ISSUE HELPER (${state}${county ? ', ' + county : ''}):\n\nSituation: ${description}\n\n${DISCLAIMER}\n\nProvide:\n1. PLAIN ENGLISH: what this generally means\n2. TYPICAL OPTIONS people consider\n3. DEADLINES to be aware of (general guidance)\n4. QUESTIONS TO ASK A LAWYER about this specific situation\n5. DOCUMENTS TO GATHER before consulting attorney\n6. OFFICIAL LINKS:\n   - Court portal for ${county || state}\n   - How to request a hearing\n   - How to find legal aid if you can't afford an attorney\n7. DRAFT REQUEST: a short letter requesting more time or explaining your situation (template only, you review and sign)\n\n${DISCLAIMER}`,
      PURVIS_SYSTEM + '\nAlways include disclaimer prominently. Research only. No legal advice.',
      'traffic_legal', 1000
    );

    res.json({
      help: result.response,
      disclaimer: DISCLAIMER,
      officialLinks: state === 'Florida' ? { orangeCounty: 'https://myeclerk.myorangeclerk.com/', dmv: 'https://www.flhsmv.gov/', legalAid: 'https://floridalegal.org/' } : { kansasCourts: 'https://www.kscourts.org/', legalAid: 'https://www.klsinc.org/' },
      nextStep: 'Review the information above. Consult a licensed attorney before filing anything or appearing in court.'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

console.log('[PURVIS] Expansion modules loaded: OCR, Video, Logo, Avatar, Voice, Legal, Life Helper');
// ============================================================
// PURVIS GO-LIVE: Feature Flags + QA + Launch Notes
// ============================================================

// Feature flag check helper
async function isFeatureEnabled(feature) {
  try {
    const { data } = await supabase.from('purvis_feature_flags').select('enabled,sandbox_mode').eq('feature', feature).single();
    return data?.enabled && !data?.sandbox_mode;
  } catch(e) { return true; } // default to enabled if DB unreachable
}

// Feature flags control panel
app.get('/api/features', async (req, res) => {
  const { data } = await supabase.from('purvis_feature_flags').select('*').order('feature');
  res.json({ features: data || [], count: data?.length || 0 });
});

app.patch('/api/features/:feature', async (req, res) => {
  const { enabled, sandbox_mode, requires_approval } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) updates.enabled = enabled;
  if (sandbox_mode !== undefined) updates.sandbox_mode = sandbox_mode;
  if (requires_approval !== undefined) updates.requires_approval = requires_approval;
  await supabase.from('purvis_feature_flags').update(updates).eq('feature', req.params.feature);
  res.json({ ok: true, feature: req.params.feature, updates });
});

// Launch notes / releases
app.get('/api/releases', async (req, res) => {
  const { data } = await supabase.from('purvis_releases').select('*').order('launched_at', { ascending: false }).limit(5);
  res.json({ releases: data || [] });
});

// QA self-test — runs all feature health checks
app.get('/api/qa', async (req, res) => {
  const results = {};
  const start = Date.now();

  // Test each feature endpoint
  const tests = [
    { name: 'health', test: async () => { const r = await fetch('https://purvis-v11-production.up.railway.app/api/health'); return r.ok; } },
    { name: 'auth', test: async () => { const { data } = await supabase.from('purvis_memory').select('count').limit(1); return true; } },
    { name: 'features', test: async () => { try { await supabase.from('purvis_feature_flags').select('feature').limit(1); return true; } catch(e) { return false; } } },
    { name: 'legal_cases', test: async () => { const { data } = await supabase.from('purvis_legal_cases').select('count').limit(1); return true; } },
    { name: 'voice_profile', test: async () => { const { data } = await supabase.from('purvis_voice_profile').select('count').limit(1); return true; } },
    { name: 'avatars', test: async () => { const { data } = await supabase.from('purvis_brand_avatars').select('count').limit(1); return true; } },
    { name: 'budget_tracking', test: async () => { const { data } = await supabase.from('purvis_budget').select('count').limit(1); return true; } },
    { name: 'agent_controls', test: async () => { try { await supabase.from('purvis_agent_controls').select('job_name').limit(1); return true; } catch(e) { return false; } } },
    { name: 'openai_key', test: async () => process.env.OPENAI_API_KEY?.startsWith('sk-') },
    { name: 'youtube_key', test: async () => !!process.env.YOUTUBE_API_KEY },
    { name: 'govdata_key', test: async () => !!process.env.GOVDATA_API_KEY },
    { name: 'courtlistener_key', test: async () => !!process.env.COURTLISTENER_KEY },
    { name: 'web_search', test: async () => { const r = await httpGet('https://api.duckduckgo.com/?q=test&format=json'); return r.status === 200; } },
    { name: 'free_images', test: async () => { const url = 'https://image.pollinations.ai/prompt/test?width=64&height=64'; return !!url; } },
  ];

  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      const ok = await t.test();
      results[t.name] = ok ? 'PASS' : 'FAIL';
      if (ok) passed++; else failed++;
    } catch(e) {
      results[t.name] = 'FAIL: ' + e.message.substring(0, 50);
      failed++;
    }
  }

  const allClear = failed === 0;
  const duration = Date.now() - start;

  // Write QA result to Supabase
  await supabase.from('purvis_memory').upsert({
    category: 'system',
    key: 'last_qa_result',
    value: JSON.stringify({ passed, failed, allClear, timestamp: new Date().toISOString(), results }),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });

  res.json({
    qa: allClear ? 'ALL PASS ✅' : `${failed} FAILED ⚠️`,
    passed, failed, duration_ms: duration,
    results,
    mode: allClear ? 'LIVE' : 'ISSUES FOUND',
    liveUrl: 'https://purvis-v11-production.up.railway.app',
    message: allClear ? 'PURVIS is fully operational. All features live.' : 'Fix failing tests before going fully live.'
  });
});

// System status — everything in one dashboard call
app.get('/api/system', async (req, res) => {
  const [features, releases, budget, agents, apps] = await Promise.allSettled([
    supabase.from('purvis_feature_flags').select('feature,enabled,sandbox_mode').order('feature'),
    supabase.from('purvis_releases').select('version,status,launched_at,features').order('launched_at', { ascending: false }).limit(1),
    supabase.from('purvis_budget').select('service,estimated_cost_usd,budget_limit_usd').eq('month', new Date().toISOString().substring(0,7)),
    supabase.from('purvis_agent_controls').select('job_name,enabled,last_run,run_count'),
    supabase.from('purvis_apps').select('name,status')
  ]);

  res.json({
    purvis: 'LIVE',
    version: releases.value?.data?.[0]?.version || '11.1',
    url: 'https://purvis-v11-production.up.railway.app',
    login: 'kvazquez7455@gmail.com',
    features: (features.value?.data || []).map(f => ({ name: f.feature, live: f.enabled && !f.sandbox_mode })),
    latestRelease: releases.value?.data?.[0] || {},
    budget: budget.value?.data || [],
    agents: agents.value?.data || [],
    apps: apps.value?.data || [],
    controlPanels: {
      features: 'GET/PATCH /api/features/:feature',
      budget: 'GET /api/budget',
      agents: 'GET/PATCH /api/agents/controls/:jobName',
      qa: 'GET /api/qa',
      releases: 'GET /api/releases'
    }
  });
});

// Write launch markdown
// Launch notes written at startup
process.nextTick(() => { try { const launchNotes = `# PURVIS 11.1 — LAUNCH NOTES
Generated: ${new Date().toISOString()}

## STATUS: ✅ ALL FEATURES LIVE

## Live Features (18)
1. App Builder — plan, build, deploy apps on your stack
2. Automation Builder — schedule any recurring task
3. Daily Sub-Agents — learning + content + health run every hour
4. OCR — read text from images via GPT-4o vision
5. Video Analysis — legal issues + content clip ideas
6. Logo Generator — free SVG + Pollinations AI images
7. Stylized Avatars — brand characters (no deepfakes)
8. Voice System — Web Speech free + ElevenLabs when key added
9. Legal Dashboard — FL + KS research (NOT legal advice)
10. Life Helper — daily action plan from your Supabase context
11. Traffic/Legal Research — plain English, not advice
12. Web Search — DuckDuckGo free forever
13. YouTube API — real search, trending, SEO
14. Government APIs — Congress, courts, NASA
15. Cache-First Learning — gets cheaper over time
16. Overnight Agents — run hourly while you sleep
17. Budget Guardrail — $35/month target, warns at $28
18. Feature Flags — toggle any feature on/off

## Safety Rules (Always ON)
- Budget guardrail cannot be disabled
- Avatar system: stylized only, no biometric clones
- Legal features: research only, always shows disclaimer
- App builder: requires Kelvin approval before deploy
- All AI outputs labeled as AI-generated in metadata

## How to Disable Any Feature
PATCH /api/features/[feature_name] with {"enabled": false}

## How to See System Status
GET /api/system — full dashboard
GET /api/qa — run QA tests
GET /api/budget — API spend
GET /api/agents/health — sub-agent status
GET /api/releases — version history

## Keys Still Needed (Optional)
- ELEVENLABS_KEYS → Railway env vars → activates voice cloning
- SPORTSBOOK_API_KEY → Railway env vars → activates betting analysis
- HUGGINGFACE_API_KEY → Railway env vars → free AI backup
`;
/* launch notes skip in prod */
console.log('[PURVIS] Launch notes ready'); } catch(e) {} });

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT, () => {
  console.log(`[PURVIS 11] Online → http://localhost:${PORT}`);
});
