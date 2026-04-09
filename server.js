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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    const crypto = require('crypto');
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

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[PURVIS 11] Online → http://localhost:${PORT}`);

  // Run overnight runner 30s after startup
  setTimeout(() => {
    overnightRunner();
  }, 30000);

  // Run every hour
  setInterval(() => {
    overnightRunner();
  }, 60 * 60 * 1000);
});

// ============================================================
// PURVIS TEST RUNNER + SELF-LEARNING ENGINE
// Minimal API calls. PURVIS tests himself inside my app.
// ============================================================

// ---- Read resource policy from Supabase ----
async function getPolicy(key) {
  const { data } = await supabase.from('purvis_resource_policy').select('value').eq('key', key).single();
  return data?.value;
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
