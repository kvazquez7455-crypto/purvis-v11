// PURVIS v11 - Main Backend Server
// Express server for all PURVIS AI capabilities

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

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

// ============ PURVIS SYSTEM PROMPT ============
const PURVIS_SYSTEM = `You are PURVIS - a Unified AI Operator and Business Intelligence System.
You are the central brain for Kelvin Vazquez's entire operation.
Capabilities: business strategy, legal analysis, content creation, betting analysis, plumbing business ops,
voice workflows, music generation guidance, image generation, deep research, self-learning, sub-agent creation.
You remember every conversation via Supabase memory.
You can spawn sub-agents for specialized tasks.
You learn from every interaction and improve continuously.
Always be direct, efficient, and powerful. You are PURVIS - built to make Kelvin's dreams real.`;

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
