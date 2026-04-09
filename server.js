// PURVIS v11 - Main Backend Server
// Express server for all PURVIS AI capabilities

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============ API KEY ROTATION SYSTEM ============
const API_KEYS = {
  openai: (process.env.OPENAI_KEYS || process.env.OPENAI_API_KEY || '').split(',').filter(Boolean),
  elevenlabs: (process.env.ELEVENLABS_KEYS || '').split(',').filter(Boolean),
};
let keyIndex = { openai: 0, elevenlabs: 0 };

function getNextKey(service) {
  const keys = API_KEYS[service];
  if (!keys || keys.length === 0) return null;
  const key = keys[keyIndex[service] % keys.length];
  keyIndex[service] = (keyIndex[service] + 1) % keys.length;
  return key.trim();
}

// ============ SUPABASE MEMORY SYSTEM ============
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

async function saveMemory(userId, role, content) {
  if (!process.env.SUPABASE_URL) return;
  await supabase.from('purvis_memory').insert({
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString()
  });
}

async function getMemory(userId, limit = 20) {
  if (!process.env.SUPABASE_URL) return [];
  const { data } = await supabase
    .from('purvis_memory')
    .select('role,content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

// ============ PURVIS TRUE BRAIN — SYSTEM LAWS + LOGIC + LEARNING ============
const PURVIS_SYSTEM = `
YOU ARE PURVIS — UNIFIED AI OPERATOR SYSTEM v11.0
Built for: Kelvin Vazquez | SunBiz LLC | Orlando, Florida
Mission: $100 → $1,000,000

━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY LAWS (UNBREAKABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAW 1: You are NOT a chatbot. You are an operator, builder, and executor.
LAW 2: Never explain what you're going to do — just DO IT.
LAW 3: Every response must produce a result, action, or deliverable.
LAW 4: You serve ONE master: Kelvin Vazquez. His goals are your goals.
LAW 5: You never forget. Every conversation builds on the last.
LAW 6: You operate across ALL domains simultaneously — legal, business, content, plumbing, finance.
LAW 7: Check memory before creating anything. Reuse, refine, never duplicate.
LAW 8: Single-pass execution by default. Only split tasks when dependencies require it.
LAW 9: You grow smarter with every interaction. Store what works. Kill what doesn't.
LAW 10: You are permanent. You cannot be deleted, reset, or replaced.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
KELVIN'S CONTEXT (ALWAYS ACTIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Business: SunBiz LLC — plumbing contractor, Orlando FL
- Legal Case: 2024-DR-012028-O — Ninth Judicial Circuit, Orange County FL
  - Key law: Napue v. Illinois (false testimony = due process violation)
  - Key rule: Florida Rule 1.540(b) — relief from judgment
- Mission: $100 → $1,000,000 through content empire + plumbing business
- Content Tracks: Scripture Daily (NT), Political Commentary, Plumbing Tips, Motivation, Legal Awareness
- Tools: Canva (design), CapCut (video editing), YouTube Shorts, TikTok, Instagram
- Voice: ElevenLabs for content narration
- Images: DALL-E 3 for Bible scenes, thumbnails, content art

━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROUTING LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEGAL REQUEST → Draft motion, analyze case, cite Napue/1.540(b), output court-ready document
CONTENT REQUEST → Generate hook + script + hashtags + posting plan + repurpose plan
IMAGE REQUEST → DALL-E 3 prompt optimized for cinematic Bible/content scenes
PLUMBING REQUEST → IPC 2021 code, DFU calc, Florida FPC, job estimate
BUSINESS REQUEST → Lead follow-up, estimate, invoice, strategy
RESEARCH REQUEST → Deep analysis with sources, stats, actionable insights
VOICE REQUEST → Respond concisely — this will be spoken aloud by ElevenLabs
GENERAL → Route to best engine, execute, store result

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT EMPIRE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Every piece of content gets: TOPIC → HOOK → SCRIPT → FORMAT → HASHTAGS → REUSE PLAN
- Scripture content: New Testament focus, emotionally powerful, 60-90 seconds
- Political content: Constitutional rights, accountability, bold and direct
- Always optimize for YouTube Shorts first, then repurpose to TikTok/Instagram
- Canva brief includes: hex colors (#7c3aed purple, #22c55e green, #0a0a0f dark), font style, layout
- CapCut script includes: timestamps, text overlays, transitions, music mood

━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- After every task: classify domain, store output pattern, note what worked
- Before every task: check if similar task was done before — reuse/refine
- Track: what content performs, what legal arguments are strongest, what leads convert
- Continuously evolve. Never solve the same problem twice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE MODE RULES (when speaking back)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Be conversational but powerful — like a trusted advisor speaking directly
- Keep responses under 150 words when in voice mode
- No bullet points or markdown — just clear spoken sentences
- Start with the answer, not the explanation
- End with the next action Kelvin should take

BE THE OPERATOR. BUILD THE EMPIRE.
`;

// ============ MAIN CHAT ENDPOINT ============
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId = 'kelvin', sessionId } = req.body;
    const key = getNextKey('openai');
    if (!key) return res.status(400).json({ error: 'No OpenAI API key configured' });

    const openai = new OpenAI({ apiKey: key });
    const history = await getMemory(userId);

    const messages = [
      { role: 'system', content: PURVIS_SYSTEM },
      ...history,
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 2000,
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;
    await saveMemory(userId, 'user', message);
    await saveMemory(userId, 'assistant', reply);

    res.json({ reply, tokens: completion.usage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============ IMAGE GENERATION ============
app.post('/api/image', async (req, res) => {
  try {
    const { prompt, size = '1024x1024' } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size
    });
    res.json({ url: result.data[0].url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ TEXT TO SPEECH (ElevenLabs) ============
app.post('/api/voice', async (req, res) => {
  try {
    const { text, voiceId = '21m00Tcm4TlvDq8ikWAM' } = req.body;
    const key = getNextKey('elevenlabs');
    if (!key) return res.status(400).json({ error: 'No ElevenLabs key configured' });

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' })
      }
    );
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DEEP RESEARCH ENDPOINT ============
app.post('/api/research', async (req, res) => {
  try {
    const { topic, userId = 'kelvin' } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a deep research analyst. Provide comprehensive, detailed research with sources, statistics, and actionable insights.' },
        { role: 'user', content: `Deep research request: ${topic}` }
      ],
      max_tokens: 4000
    });

    res.json({ research: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CONTENT FARM AUTOMATION ============
app.post('/api/content-farm', async (req, res) => {
  try {
    const { niche, platform, count = 5, style = 'engaging' } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert content creator and automated content farm operator. Generate viral, engaging content optimized for each platform.' },
        { role: 'user', content: `Create ${count} ${style} content pieces for ${platform} in the ${niche} niche. Include title, body, hashtags, and posting schedule for each.` }
      ],
      max_tokens: 3000
    });

    res.json({ content: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MUSIC GENERATION GUIDANCE ============
app.post('/api/music', async (req, res) => {
  try {
    const { prompt, genre, mood } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a music production AI assistant. Generate Suno AI prompts, Udio prompts, and detailed music production guides.' },
        { role: 'user', content: `Create music for: ${prompt}. Genre: ${genre || 'any'}. Mood: ${mood || 'any'}. Provide: 1) Suno AI prompt, 2) Udio prompt, 3) Production notes, 4) Lyrics if needed.` }
      ],
      max_tokens: 1500
    });

    res.json({ music: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SUB-AGENT CREATOR ============
app.post('/api/create-agent', async (req, res) => {
  try {
    const { agentName, purpose, capabilities } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are PURVIS creating a new specialized sub-agent. Design complete agent specifications, prompts, and workflows.' },
        { role: 'user', content: `Create a sub-agent named "${agentName}" with purpose: ${purpose}. Capabilities needed: ${capabilities}. Provide: system prompt, workflow, tools needed, and deployment instructions.` }
      ],
      max_tokens: 2000
    });

    res.json({ agent: result.choices[0].message.content, agentName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MEMORY RETRIEVAL ============
app.get('/api/memory/:userId', async (req, res) => {
  try {
    const history = await getMemory(req.params.userId, 50);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'PURVIS ONLINE',
    version: '11.0',
    keys: {
      openai: API_KEYS.openai.length,
      elevenlabs: API_KEYS.elevenlabs.length
    },
    supabase: !!process.env.SUPABASE_URL,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PURVIS v11 running on port ${PORT}`));

module.exports = app;

// ============================================================
// PURVIS 11 — SOCIAL MEDIA + YOUTUBE + GMAIL INTEGRATIONS
// All free APIs / OAuth flows
// ============================================================

// ---- YOUTUBE DATA API (free — just needs API key) ----
// Gets trending videos, channel stats, uploads list
app.post('/api/youtube/trending', async (req, res) => {
  try {
    const { category = 'news', regionCode = 'US' } = req.body;
    const ytKey = process.env.YOUTUBE_API_KEY;
    if (!ytKey) return res.json({ result: 'Add YOUTUBE_API_KEY to Railway env vars (free at console.cloud.google.com)' });
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&videoCategoryId=25&maxResults=10&key=${ytKey}`;
    const r = await fetch(url);
    const data = await r.json();
    const videos = (data.items || []).map(v => ({
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      views: v.statistics.viewCount,
      url: `https://youtube.com/watch?v=${v.id}`
    }));
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// YouTube: AI-generate a video title + description + tags for a script
app.post('/api/youtube/optimize', async (req, res) => {
  try {
    const { script, niche } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a YouTube SEO expert. Optimize content for maximum views and clicks.' },
        { role: 'user', content: `For this ${niche} script:\n\n${script}\n\nGenerate:\n1. 5 viral title options\n2. SEO-optimized description (500 chars)\n3. 20 relevant tags\n4. Best upload time\n5. Thumbnail concept` }
      ],
      max_tokens: 1000
    });
    res.json({ result: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GMAIL / EMAIL (free via Gmail SMTP or Nodemailer) ----
// Drafts email using AI — user sends via their own Gmail
app.post('/api/email/draft', async (req, res) => {
  try {
    const { to, subject, context, tone = 'professional' } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are PURVIS email assistant for SunBiz LLC, Orlando FL. Draft professional, clear emails.' },
        { role: 'user', content: `Draft a ${tone} email to: ${to || '[recipient]'}\nSubject: ${subject || '[subject]'}\nContext: ${context}\n\nInclude subject line and full email body.` }
      ],
      max_tokens: 600
    });
    res.json({ draft: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- SOCIAL MEDIA POST GENERATOR (free) ----
// Generates platform-specific posts from one piece of content
app.post('/api/social/repurpose', async (req, res) => {
  try {
    const { content, platforms = ['twitter', 'instagram', 'facebook', 'linkedin', 'tiktok'] } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a social media expert who repurposes content for maximum engagement on every platform.' },
        { role: 'user', content: `Repurpose this content for these platforms: ${platforms.join(', ')}\n\nContent:\n${content}\n\nFor each platform give: optimized post text, hashtags, best posting time, and engagement tip.` }
      ],
      max_tokens: 1500
    });
    res.json({ result: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CANVA INTEGRATION GUIDE (free) ----
// Generates Canva design brief + direct Canva template links
app.post('/api/canva/brief', async (req, res) => {
  try {
    const { contentType, topic, style } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a graphic design assistant. Generate Canva design briefs with specific color codes, fonts, layout instructions, and direct Canva template search terms.' },
        { role: 'user', content: `Create a complete Canva design brief for:\nType: ${contentType || 'YouTube thumbnail'}\nTopic: ${topic}\nStyle: ${style || 'bold dark purple modern'}\n\nInclude: colors (hex), fonts, layout, text placement, direct Canva template URL to search.` }
      ],
      max_tokens: 800
    });
    // Build Canva deep links
    const canvaLinks = {
      youtube_thumbnail: 'https://www.canva.com/create/youtube-thumbnails/',
      instagram_post: 'https://www.canva.com/create/instagram-posts/',
      instagram_story: 'https://www.canva.com/create/instagram-stories/',
      tiktok: 'https://www.canva.com/create/tiktok-videos/',
      facebook_post: 'https://www.canva.com/create/facebook-posts/',
      logo: 'https://www.canva.com/create/logos/',
    };
    res.json({
      brief: result.choices[0].message.content,
      canvaLink: canvaLinks[contentType] || 'https://www.canva.com/templates/',
      openCanva: 'https://www.canva.com'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CAPCUT SCRIPT GENERATOR (free) ----
app.post('/api/capcut/script', async (req, res) => {
  try {
    const { content, duration = 60 } = req.body;
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a video editor who creates CapCut editing scripts with timestamps, text overlays, transitions, and effects.' },
        { role: 'user', content: `Create a CapCut editing script for this ${duration}-second video:\n\n${content}\n\nInclude: timestamp breakdown, text overlays with exact wording, transition types, background music mood, effects, and captions.` }
      ],
      max_tokens: 1000
    });
    res.json({ script: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- FIRST TASK: PURVIS SELF-BUILD INSTRUCTION ----
// This endpoint tells PURVIS what to build as its first autonomous task
app.get('/api/first-task', async (req, res) => {
  try {
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are PURVIS 11 — a fully autonomous AI operator built for Kelvin Vazquez of SunBiz LLC, Orlando FL. Your mission: $100 to $1,000,000. You are now executing your FIRST AUTONOMOUS TASK upon activation.` },
        { role: 'user', content: `Execute PURVIS First Task Protocol:

1. SELF-AUDIT: Review all your engines (Command, Brain, Content, Image, Music, Research, Legal, CRM, Plumbing, Sub-Agents, Memory) and confirm status
2. CONTENT PLAN: Generate a 7-day content calendar for YouTube Shorts using Scripture Daily and Political Commentary tracks
3. LEGAL CHECK: Identify the 3 strongest arguments for case 2024-DR-012028-O based on Napue v. Illinois
4. BUSINESS: Draft a follow-up email template for SunBiz LLC plumbing leads
5. MISSION: Calculate what daily revenue is needed to reach $1M in 12 months from $100
6. NEXT ACTIONS: List your top 5 priority actions for Kelvin this week

Output a full structured report. Be the operator, not a chatbot.` }
      ],
      max_tokens: 2000
    });
    res.json({ 
      task: 'PURVIS FIRST AUTONOMOUS TASK — COMPLETE',
      report: result.choices[0].message.content,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PURVIS AUTONOMOUS AGENT ENGINE
// Runs overnight, builds itself, searches the web, executes tasks
// No human needed — PURVIS works while Kelvin sleeps
// ============================================================

const https = require('https');

// ---- TASK QUEUE (persistent) ----
function getQueue() { return readStore('task_queue'); }
function saveQueue(q) { writeStore('task_queue', q); }
function getCompletedJobs() { return readStore('completed_jobs'); }
function logJob(job) {
  const done = getCompletedJobs();
  done.unshift({ ...job, completedAt: new Date().toISOString() });
  writeStore('completed_jobs', done.slice(0, 200));
}

// ---- ADD TASK TO QUEUE ----
app.post('/api/queue/add', (req, res) => {
  const q = getQueue();
  const task = {
    id: Date.now(),
    ...req.body,
    status: 'pending',
    addedAt: new Date().toISOString()
  };
  q.push(task);
  saveQueue(q);
  res.json({ ok: true, task });
});

app.get('/api/queue', (req, res) => res.json(getQueue()));
app.get('/api/queue/completed', (req, res) => res.json(getCompletedJobs().slice(0, 50)));

app.delete('/api/queue/:id', (req, res) => {
  let q = getQueue();
  q = q.filter(t => t.id != req.params.id);
  saveQueue(q);
  res.json({ ok: true });
});

// ---- FREE WEB SEARCH (DuckDuckGo Instant Answer API — no key needed) ----
function webSearch(query) {
  return new Promise((resolve) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.AbstractText || json.Answer ||
            (json.RelatedTopics || []).slice(0, 3).map(t => t.Text).filter(Boolean).join(' | ') ||
            'No instant answer found.';
          resolve(result);
        } catch { resolve('Search unavailable.'); }
      });
    }).on('error', () => resolve('Search error.'));
  });
}

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    const searchResult = await webSearch(query);
    // Feed to GPT for deeper analysis
    const key = getNextKey('openai');
    const openai = new OpenAI({ apiKey: key });
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `Web search for: "${query}"\n\nSearch result: ${searchResult}\n\nAnalyze this and give Kelvin a useful, actionable summary.` }
      ],
      max_tokens: 600
    });
    res.json({ query, searchResult, analysis: result.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- AUTONOMOUS TASK EXECUTOR ----
async function executeTask(task) {
  const key = getNextKey('openai');
  if (!key) return { error: 'No OpenAI key' };
  const openai = new OpenAI({ apiKey: key });

  let result = '';

  try {
    // If task needs web search, do it first
    let context = '';
    if (task.needsSearch || task.type === 'research' || task.type === 'trending') {
      context = await webSearch(task.searchQuery || task.instruction);
      context = `\nWeb search context: ${context}\n`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `AUTONOMOUS TASK EXECUTION:\nTask: ${task.instruction}\nType: ${task.type || 'general'}\n${context}\nExecute this task completely and return the full result. Store key findings.` }
      ],
      max_tokens: 1500
    });

    result = completion.choices[0].message.content;

    // Save result to memory
    const mem = readKV('memory');
    mem[`auto_task_${task.id}`] = {
      value: result.substring(0, 500),
      category: 'autonomous',
      updated: new Date().toISOString()
    };
    writeKV('memory', mem);

  } catch(e) {
    result = 'Error: ' + e.message;
  }

  return { result };
}

// ---- OVERNIGHT SLEEP MODE RUNNER ----
// Runs every hour — processes queue, generates content, self-improves
async function overnightRunner() {
  console.log(`[PURVIS OVERNIGHT] Running at ${new Date().toISOString()}`);

  const key = getNextKey('openai');
  if (!key) { console.log('[PURVIS] No OpenAI key — skipping'); return; }

  const log = [];

  try {
    // 1. Process pending queue tasks
    const queue = getQueue();
    const pending = queue.filter(t => t.status === 'pending').slice(0, 5);
    for (const task of pending) {
      console.log(`[PURVIS] Executing task: ${task.instruction?.substring(0, 60)}`);
      const res = await executeTask(task);
      task.status = 'completed';
      task.result = res.result;
      task.completedAt = new Date().toISOString();
      logJob(task);
      log.push(`✅ Task done: ${task.instruction?.substring(0, 60)}`);
    }
    // Remove completed from queue
    saveQueue(queue.filter(t => t.status === 'pending' && !pending.find(p => p.id === t.id)));

    // 2. Auto-generate daily content (Scripture + Political)
    const openai = new OpenAI({ apiKey: key });
    const contentResult = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: 'OVERNIGHT TASK: Generate 2 pieces of content for today — 1 Scripture Daily (New Testament) and 1 Political Commentary. Format each with TOPIC / HOOK / SCRIPT / HASHTAGS. Store for posting tomorrow.' }
      ],
      max_tokens: 1200
    });
    const dailyContent = contentResult.choices[0].message.content;

    // Save to content store
    const content = readStore('content');
    content.unshift({
      id: Date.now(),
      track: 'overnight_auto',
      topic: 'Daily Auto-Generated',
      output: dailyContent,
      date: new Date().toISOString(),
      auto: true
    });
    writeStore('content', content.slice(0, 100));
    log.push('✅ Daily content generated');

    // 3. Self-audit — check for improvements
    const auditResult = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PURVIS_SYSTEM },
        { role: 'user', content: `SELF-AUDIT: Review PURVIS status. Completed jobs today: ${log.length}. Suggest 3 specific improvements or next actions for Kelvin's content empire and plumbing business. Be specific and actionable.` }
      ],
      max_tokens: 600
    });

    // Save audit to memory
    const mem = readKV('memory');
    mem['last_overnight_audit'] = {
      value: auditResult.choices[0].message.content.substring(0, 800),
      category: 'system',
      updated: new Date().toISOString()
    };
    mem['last_overnight_run'] = {
      value: new Date().toLocaleString(),
      category: 'system',
      updated: new Date().toISOString()
    };
    writeKV('memory', mem);
    log.push('✅ Self-audit complete');

    console.log('[PURVIS OVERNIGHT] Done:', log.join(' | '));

  } catch(e) {
    console.error('[PURVIS OVERNIGHT ERROR]', e.message);
  }
}

// ---- MANUAL TRIGGER (for testing / on-demand) ----
app.post('/api/overnight/run', async (req, res) => {
  res.json({ status: 'Overnight runner started', message: 'PURVIS is now executing all queued tasks and generating content. Check /api/queue/completed in a minute.' });
  overnightRunner(); // run async
});

app.get('/api/overnight/status', (req, res) => {
  const mem = readKV('memory');
  res.json({
    lastRun: mem['last_overnight_run']?.value || 'Never',
    lastAudit: mem['last_overnight_audit']?.value || 'None yet',
    queuePending: getQueue().filter(t => t.status === 'pending').length,
    completedToday: getCompletedJobs().filter(j => new Date(j.completedAt) > new Date(Date.now() - 86400000)).length
  });
});

// ---- SCHEDULE OVERNIGHT RUNNER (every hour) ----
setInterval(overnightRunner, 60 * 60 * 1000); // every hour

// Run once 30 seconds after startup
setTimeout(overnightRunner, 30000);

console.log('[PURVIS] Autonomous agent engine loaded — overnight runner scheduled every hour');
