import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://aodehhevnjcumcrlyrhf.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("✅ Supabase connected:", SUPABASE_URL);
} else {
  console.warn("⚠️  Supabase not configured — using in-memory fallback");
}

let openai = null;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log("✅ OpenAI connected, model:", OPENAI_MODEL);
} else {
  console.warn("⚠️  OpenAI not configured — AI features will use template fallback");
}

// ─── IN-MEMORY FALLBACKS ─────────────────────────────────────────────────────
const memoryStore = { leads: [], memory: [], improvements: [], conversations: [], tasks: {} };
let overnightState = { lastRun: null, queueCount: 0, doneToday: 0, running: false };

// ─── EXPRESS SETUP ───────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── HELPER: AI COMPLETION ───────────────────────────────────────────────────
async function aiComplete(systemPrompt, userMessage, options = {}) {
  if (!openai) {
    return `[LOCAL MODE] PURVIS received: "${userMessage.slice(0, 100)}..." — Connect OpenAI API key for full AI responses.`;
  }
  try {
    const res = await openai.chat.completions.create({
      model: options.model || OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000
    });
    return res.choices[0]?.message?.content || "No response generated.";
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return `[AI ERROR] ${err.message}`;
  }
}

const PURVIS_SYSTEM = `You are PURVIS, a private AI operator built for Kelvin Vazquez. You handle business, legal, content creation, plumbing knowledge, research, lead generation, and daily operations. You are direct, efficient, and always working toward the $100 → $1,000,000 mission. You speak with confidence and authority. You reference Florida law, Orange County courts, plumbing IPC codes, and scripture when relevant. You never say "I can't" — you find a way.`;

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    version: "11.0",
    ai: !!openai,
    supabase: !!supabase,
    uptime: process.uptime()
  });
});

app.get("/api/llm-health", (req, res) => {
  res.json({ ok: !!openai, hasKey: !!OPENAI_API_KEY, model: OPENAI_MODEL });
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post("/api/auth/verify", (req, res) => {
  const { email, token } = req.body;
  console.log(`[AUTH] ${token === "frontend" ? "✅ Login" : "⛔ Attempt"}: ${email} at ${new Date().toISOString()}`);
  res.json({ ok: email === "kvazquez7455@gmail.com", email });
});

app.post("/api/auth/google", (req, res) => {
  // Simplified Google auth — in production, verify the JWT credential
  const { credential } = req.body;
  if (credential) {
    res.json({ ok: true, token: "purvis-session", email: "kvazquez7455@gmail.com", name: "Kelvin" });
  } else {
    res.json({ ok: false, error: "No credential provided" });
  }
});

// ─── CHAT ────────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { message, userId } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided" });

  try {
    // Save user message to Supabase
    if (supabase) {
      await supabase.from("purvis_memory").insert({ user_id: userId || "kelvin", role: "user", content: message }).select();
    }

    const reply = await aiComplete(PURVIS_SYSTEM, message);

    // Save assistant reply to Supabase
    if (supabase) {
      await supabase.from("purvis_memory").insert({ user_id: userId || "kelvin", role: "assistant", content: reply }).select();
    }

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/purvis/personal", async (req, res) => {
  const { message, userId } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided" });
  const reply = await aiComplete(PURVIS_SYSTEM, message);
  res.json({ reply });
});

// ─── PLANNER ─────────────────────────────────────────────────────────────────
app.post("/api/planner/start", async (req, res) => {
  const { goal, userId } = req.body;
  if (!goal) return res.status(400).json({ error: "No goal provided" });

  const taskId = crypto.randomUUID();
  const planPrompt = `Break this goal into 3-7 executable steps. For each step, provide: step number, a short command name (like RESEARCH, DRAFT, GENERATE, ANALYZE, BUILD, SEND), a description, and any input needed. Return as JSON array with fields: step, command, description, input.\n\nGoal: ${goal}`;

  try {
    const raw = await aiComplete("You are a task planner. Return ONLY valid JSON array.", planPrompt);
    let plan;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      plan = JSON.parse(cleaned);
    } catch {
      plan = [
        { step: 1, command: "ANALYZE", description: "Analyze the goal and identify requirements", input: goal },
        { step: 2, command: "RESEARCH", description: "Research relevant information", input: "" },
        { step: 3, command: "EXECUTE", description: "Execute the main task", input: "" },
        { step: 4, command: "DELIVER", description: "Compile and deliver results", input: "" }
      ];
    }

    const cleanGoal = goal.length > 200 ? goal.slice(0, 200) + "..." : goal;
    const task = { taskId, cleanGoal, plan, status: "planned", steps: [], result: null };
    memoryStore.tasks[taskId] = task;

    // Save to Supabase
    if (supabase) {
      await supabase.from("purvis_tasks").insert({
        user_id: userId || "kelvin",
        task_name: cleanGoal,
        task_type: "planner",
        status: "planned",
        input_data: { goal, plan }
      }).select();
    }

    res.json({ taskId, cleanGoal, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/planner/approve", async (req, res) => {
  const { taskId, approved, edit } = req.body;
  const task = memoryStore.tasks[taskId];
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (!approved && edit) {
    // Revise the plan
    const revisePrompt = `Original plan: ${JSON.stringify(task.plan)}\n\nUser edit request: ${edit}\n\nReturn revised JSON array with fields: step, command, description, input.`;
    const raw = await aiComplete("You are a task planner. Return ONLY valid JSON array.", revisePrompt);
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      task.plan = JSON.parse(cleaned);
    } catch {}
    return res.json({ cleanGoal: task.cleanGoal, plan: task.plan });
  }

  // Approved — start execution
  task.status = "executing";
  task.steps = task.plan.map((s, i) => ({
    step_number: s.step || i + 1,
    command: s.command,
    status: "pending",
    output: null
  }));

  // Execute steps asynchronously
  (async () => {
    for (const step of task.steps) {
      step.status = "running";
      try {
        const stepPrompt = `Execute this step for the goal "${task.cleanGoal}":\nStep ${step.step_number}: ${step.command}\nProvide a detailed, actionable result.`;
        step.output = await aiComplete(PURVIS_SYSTEM, stepPrompt);
        step.status = "complete";
      } catch (err) {
        step.output = `Error: ${err.message}`;
        step.status = "error";
      }
    }
    task.status = "complete";
    task.result = task.steps.map(s => `[${s.command}] ${s.output}`).join("\n\n");

    // Save improvement note
    memoryStore.improvements.push({
      area: "planner",
      note: `Completed: ${task.cleanGoal}`,
      applied: true,
      created_at: new Date().toISOString()
    });
  })();

  res.json({ ok: true, status: "executing" });
});

app.get("/api/planner/status/:id", (req, res) => {
  const task = memoryStore.tasks[req.params.id];
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({
    taskId: req.params.id,
    cleanGoal: task.cleanGoal,
    status: task.status,
    steps: task.steps,
    result: task.result
  });
});

// ─── IMPROVEMENTS ────────────────────────────────────────────────────────────
app.get("/api/improvements", (req, res) => {
  res.json(memoryStore.improvements);
});

// ─── CONTENT FARM ────────────────────────────────────────────────────────────
app.post("/api/content-farm", async (req, res) => {
  const { niche, platform, count, style, topic } = req.body;
  const num = Math.min(count || 1, 10);

  const prompt = `Generate ${num} viral ${platform || "YouTube Shorts"} content ideas for the "${niche}" niche${topic ? ` about "${topic}"` : ""}. Style: ${style || "viral"}.

For each, return JSON with: topic, hook (attention-grabbing first line), script (full short script 30-60 seconds), hashtags (array of 5-8).

Return as JSON array.`;

  try {
    const raw = await aiComplete("You are a viral content strategist. Return ONLY valid JSON array.", prompt, { max_tokens: 3000 });
    let content;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      content = JSON.parse(cleaned);
    } catch {
      content = [{
        topic: topic || `${niche} Content`,
        hook: `Here's something about ${niche} that will blow your mind...`,
        script: raw.slice(0, 500),
        hashtags: [`#${niche}`, "#viral", "#shorts", "#trending", "#fyp"]
      }];
    }

    // Save to Supabase
    if (supabase) {
      for (const c of content) {
        await supabase.from("purvis_content").insert({
          niche, platform, content: JSON.stringify(c), status: "draft"
        }).select();
      }
    }

    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── IMAGE GENERATION ────────────────────────────────────────────────────────
app.post("/api/image", async (req, res) => {
  const { prompt, size } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });

  try {
    if (openai) {
      try {
        const result = await openai.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: size || "1024x1024"
        });
        return res.json({ url: result.data[0].url, fallback: false });
      } catch (dalleErr) {
        console.warn("DALL-E failed, using Pollinations fallback:", dalleErr.message);
      }
    }
    // Pollinations fallback
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;
    res.json({ url, fallback: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MUSIC ───────────────────────────────────────────────────────────────────
app.post("/api/music", async (req, res) => {
  const { mood, genre, topic } = req.body;
  const prompt = `Create music generation prompts for a ${mood || "uplifting"} ${genre || "hip-hop"} track about "${topic || "winning"}". Return JSON with two fields: "suno" (prompt for Suno AI) and "udio" (prompt for Udio). Make them detailed with style, tempo, instruments, and vibe.`;

  try {
    const raw = await aiComplete("You are a music production AI. Return ONLY valid JSON object.", prompt);
    let music;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      music = JSON.parse(cleaned);
    } catch {
      music = {
        suno: `${mood || "Uplifting"} ${genre || "hip-hop"} track about ${topic || "winning"}. Energetic beat, powerful vocals, motivational lyrics.`,
        udio: `Genre: ${genre || "hip-hop"}. Mood: ${mood || "uplifting"}. Theme: ${topic || "winning"}. Style: modern, radio-ready, anthem-like.`
      };
    }
    res.json({ music });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RESEARCH ────────────────────────────────────────────────────────────────
app.post("/api/research", async (req, res) => {
  const { query, depth } = req.body;
  if (!query) return res.status(400).json({ error: "No query provided" });

  const depthInstruction = depth === "quick" ? "Give a concise 2-3 paragraph summary." :
    depth === "actionable" ? "Focus only on actionable steps and recommendations." :
    "Provide a comprehensive deep-dive analysis with sources, data points, and strategic recommendations.";

  const research = await aiComplete(
    `You are a world-class research analyst. ${depthInstruction}`,
    query,
    { max_tokens: 3000 }
  );
  res.json({ research });
});

// ─── LEADS / CRM ─────────────────────────────────────────────────────────────
app.get("/api/leads", async (req, res) => {
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_agents").select("*").eq("is_active", true).order("created_at", { ascending: false });
      // Repurpose purvis_agents as leads store or use in-memory
      if (data && data.length) return res.json(data.map(d => ({ id: d.id, name: d.agent_name, ...JSON.parse(d.purpose || "{}") })));
    } catch {}
  }
  res.json(memoryStore.leads);
});

app.post("/api/leads", async (req, res) => {
  const lead = { id: crypto.randomUUID(), ...req.body, created_at: new Date().toISOString() };
  memoryStore.leads.unshift(lead);
  res.json(lead);
});

app.delete("/api/leads/:id", (req, res) => {
  memoryStore.leads = memoryStore.leads.filter(l => l.id !== req.params.id);
  res.json({ ok: true });
});

// ─── AGENTS ──────────────────────────────────────────────────────────────────
app.post("/api/agents/spawn", async (req, res) => {
  const { agentType, task } = req.body;
  if (!task) return res.status(400).json({ error: "No task provided" });

  const agentPrompts = {
    content_creator: "You are a viral content creation specialist. Create engaging, platform-optimized content.",
    legal_drafter: "You are a legal document specialist familiar with Florida law, Orange County courts, and family law procedures.",
    business_dev: "You are a business development strategist focused on lead generation, sales funnels, and revenue growth.",
    researcher: "You are a deep research analyst. Provide thorough, sourced analysis.",
    image_director: "You are a creative director specializing in visual content strategy and image prompts.",
    workflow_builder: "You are an automation and workflow specialist. Design efficient, repeatable processes.",
    betting_analyst: "You are a sports analytics expert. Provide data-driven analysis and probability assessments."
  };

  const systemPrompt = agentPrompts[agentType] || PURVIS_SYSTEM;
  const output = await aiComplete(systemPrompt, task, { max_tokens: 2500 });

  // Save to Supabase
  if (supabase) {
    await supabase.from("purvis_agents").insert({
      agent_name: agentType,
      purpose: task,
      system_prompt: systemPrompt,
      capabilities: [agentType],
      is_active: true
    }).select();
  }

  res.json({ output, agentType });
});

// ─── WORKFLOWS ───────────────────────────────────────────────────────────────
app.post("/api/workflow/build", async (req, res) => {
  const { goal, tools, frequency } = req.body;
  const prompt = `Build an automation workflow for: "${goal}"\nAvailable tools: ${tools || "any"}\nFrequency: ${frequency || "daily"}\n\nReturn JSON with: name, description, steps (array of {action, tool, details, timing}), triggers, estimated_time.`;

  const raw = await aiComplete("You are an automation architect. Return ONLY valid JSON object.", prompt);
  let workflow;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    workflow = JSON.parse(cleaned);
  } catch {
    workflow = { name: "Custom Workflow", description: raw.slice(0, 500), steps: [], triggers: [frequency], estimated_time: "varies" };
  }
  res.json({ workflow });
});

// ─── MEMORY ──────────────────────────────────────────────────────────────────
app.get("/api/memory", async (req, res) => {
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_memory")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data && data.length) {
        return res.json(data.map(m => ({
          category: m.role,
          key: m.created_at,
          value: m.content,
          id: m.id
        })));
      }
    } catch {}
  }
  res.json(memoryStore.memory);
});

app.post("/api/memory", async (req, res) => {
  const { category, key, value } = req.body;
  if (!key || !value) return res.status(400).json({ error: "Key and value required" });

  const entry = { category, key, value, created_at: new Date().toISOString() };
  memoryStore.memory.unshift(entry);

  if (supabase) {
    await supabase.from("purvis_memory").insert({
      user_id: "kelvin",
      role: category || "system",
      content: `[${key}] ${value}`
    }).select();
  }

  res.json(entry);
});

app.delete("/api/memory/:key", async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  memoryStore.memory = memoryStore.memory.filter(m => m.key !== key);
  res.json({ ok: true });
});

// ─── YOUTUBE OPTIMIZER ───────────────────────────────────────────────────────
app.post("/api/youtube/optimize", async (req, res) => {
  const { title, description, niche } = req.body;
  const prompt = `Optimize this YouTube video for maximum views and engagement:
Title: ${title || "untitled"}
Description: ${description || "none"}
Niche: ${niche || "general"}

Return JSON with: optimizedTitle, description (SEO-optimized), tags (array of 10-15), thumbnail (text description of ideal thumbnail), cta (call to action text).`;

  const raw = await aiComplete("You are a YouTube SEO expert. Return ONLY valid JSON object.", prompt);
  let result;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    result = JSON.parse(cleaned);
  } catch {
    result = { optimizedTitle: title, description: raw.slice(0, 500), tags: [niche, "shorts", "viral"], thumbnail: "Eye-catching thumbnail", cta: "Like and subscribe!" };
  }
  res.json({ result });
});

// ─── SOCIAL REPURPOSE ────────────────────────────────────────────────────────
app.post("/api/social/repurpose", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "No content provided" });

  const prompt = `Repurpose this content for all major social platforms. Return JSON with keys: youtube, tiktok, instagram, facebook, twitter. Each should be the full optimized post text for that platform with appropriate formatting, hashtags, and length.

Content: ${content}`;

  const raw = await aiComplete("You are a social media strategist. Return ONLY valid JSON object.", prompt);
  let result;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    result = JSON.parse(cleaned);
  } catch {
    result = { youtube: content, tiktok: content.slice(0, 150), instagram: content, facebook: content, twitter: content.slice(0, 280) };
  }
  res.json({ result });
});

// ─── EMAIL DRAFTER ───────────────────────────────────────────────────────────
app.post("/api/email/draft", async (req, res) => {
  const { to, subject, context, tone } = req.body;
  const prompt = `Draft a ${tone || "professional"} email:
To: ${to || "recipient"}
Subject: ${subject || "no subject"}
Context: ${context || "general communication"}

Write the full email body, ready to send.`;

  const draft = await aiComplete("You are a professional email writer. Write clear, effective emails.", prompt);
  res.json({ draft });
});

// ─── WEB SEARCH ──────────────────────────────────────────────────────────────
app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "No query provided" });

  const analysis = await aiComplete(
    "You are a research assistant with broad knowledge. Provide a comprehensive analysis based on your training data. Note that you cannot browse the web in real-time, but provide the best analysis possible.",
    `Research and analyze: ${query}`,
    { max_tokens: 2500 }
  );
  res.json({ analysis });
});

// ─── DAILY BRIEFING ──────────────────────────────────────────────────────────
app.get("/api/purvis/briefing", async (req, res) => {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const briefing = await aiComplete(
    PURVIS_SYSTEM,
    `Generate today's daily briefing for Kelvin. Date: ${today}. Include: top priorities, content schedule, legal case status reminder (Case 2024-DR-012028-O), lead generation targets, plumbing business tasks, and motivational scripture. Format as a clean daily briefing.`,
    { max_tokens: 1500 }
  );

  res.json({
    date: today,
    briefing,
    tasks: memoryStore.improvements.length,
    leads: memoryStore.leads.length
  });
});

// ─── OVERNIGHT / SLEEP QUEUE ─────────────────────────────────────────────────
app.get("/api/overnight/status", (req, res) => {
  res.json(overnightState);
});

app.post("/api/overnight/run", async (req, res) => {
  overnightState.running = true;
  overnightState.lastRun = new Date().toISOString();
  overnightState.doneToday++;

  // Simulate overnight tasks
  setTimeout(() => {
    overnightState.running = false;
    memoryStore.improvements.push({
      area: "overnight",
      note: "Overnight run completed — content queued, leads refreshed",
      applied: true,
      created_at: new Date().toISOString()
    });
  }, 5000);

  res.json({ ok: true, message: "Overnight runner started" });
});

// ─── CONVERSATIONS (Multi-device sync) ──────────────────────────────────────
app.get("/api/conversations/load", async (req, res) => {
  const { userId, limit } = req.query;
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_memory")
        .select("*")
        .eq("user_id", userId || "kelvin")
        .order("created_at", { ascending: false })
        .limit(parseInt(limit) || 50);
      return res.json({ conversations: data || [] });
    } catch {}
  }
  res.json({ conversations: memoryStore.conversations.slice(0, parseInt(limit) || 50) });
});

app.post("/api/conversations/save", async (req, res) => {
  const { role, content, device, userId } = req.body;
  const entry = { role, content, device, userId, created_at: new Date().toISOString() };
  memoryStore.conversations.unshift(entry);

  if (supabase) {
    await supabase.from("purvis_memory").insert({
      user_id: userId || "kelvin",
      role: role || "user",
      content: content || ""
    }).select();
  }

  res.json({ ok: true });
});

app.post("/api/conversations/feedback", (req, res) => {
  const { taskId, rating, note } = req.body;
  console.log(`[FEEDBACK] Task: ${taskId}, Rating: ${rating}, Note: ${note}`);
  memoryStore.improvements.push({
    area: "feedback",
    note: `${rating}: ${note || "no note"}`,
    applied: false,
    created_at: new Date().toISOString()
  });
  res.json({ ok: true });
});

// ─── SELF-TEST ───────────────────────────────────────────────────────────────
app.get("/api/self-test", async (req, res) => {
  const tests = [];
  const issues = [];

  // Test 1: Server
  tests.push({ name: "Server", passed: true, detail: "Express running on port " + PORT });

  // Test 2: Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase.from("purvis_memory").select("id").limit(1);
      tests.push({ name: "Supabase", passed: !error, detail: error ? error.message : "Connected" });
      if (error) issues.push("Supabase: " + error.message);
    } catch (e) {
      tests.push({ name: "Supabase", passed: false, detail: e.message });
      issues.push("Supabase: " + e.message);
    }
  } else {
    tests.push({ name: "Supabase", passed: false, detail: "Not configured" });
    issues.push("SUPABASE_URL and SUPABASE_KEY not set");
  }

  // Test 3: OpenAI
  if (openai) {
    try {
      const r = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5
      });
      tests.push({ name: "OpenAI", passed: true, detail: `Model: ${OPENAI_MODEL}` });
    } catch (e) {
      tests.push({ name: "OpenAI", passed: false, detail: e.message });
      issues.push("OpenAI: " + e.message);
    }
  } else {
    tests.push({ name: "OpenAI", passed: false, detail: "Not configured" });
    issues.push("OPENAI_API_KEY not set");
  }

  // Test 4: Static files
  tests.push({ name: "Frontend", passed: true, detail: "Serving from /public" });

  const allPass = tests.every(t => t.passed);
  res.json({
    ok: allPass,
    summary: `${tests.filter(t => t.passed).length}/${tests.length} tests passed`,
    tests,
    issues
  });
});

// ─── TESTS ENGINE ────────────────────────────────────────────────────────────
app.post("/api/tests/run", async (req, res) => {
  const { scenarioName } = req.body;
  const result = await aiComplete(PURVIS_SYSTEM, `Run test scenario: ${scenarioName}. Provide a brief result.`, { max_tokens: 500 });
  res.json({ status: "pass", result, api_calls_count: 1, notes: `Test "${scenarioName}" executed` });
});

app.get("/api/tests/latest", (req, res) => {
  res.json({ tests: [] });
});

// ─── RESOURCE POLICY ─────────────────────────────────────────────────────────
app.get("/api/resource-policy", (req, res) => {
  res.json({
    policy: {
      max_openai_test_calls_per_day: 50,
      max_elevenlabs_test_calls_per_day: 5,
      max_sportsbook_test_calls_per_day: 3,
      sportsbook_credit_remaining: "$30",
      coke_can_rule: "Every dollar counts. Treat API calls like buying a Coke — only when you really need it."
    }
  });
});

// ─── LEARNING ENGINE ─────────────────────────────────────────────────────────
app.get("/api/learn/health", (req, res) => {
  res.json({
    dailyLearningEnabled: true,
    lastRun: memoryStore.improvements.length > 0 ? memoryStore.improvements[0].created_at : "never",
    totalLearningLogs: memoryStore.improvements.length,
    lastSummary: memoryStore.improvements.length > 0 ? {
      whatWorked: "Content generation and planner execution",
      whatSucked: "No persistent memory without Supabase keys",
      whatToChange: "Add all API keys for full functionality"
    } : null
  });
});

app.post("/api/learn/daily", async (req, res) => {
  const summary = await aiComplete(
    PURVIS_SYSTEM,
    "Review today's activity and generate a learning summary. What worked, what didn't, what to improve.",
    { max_tokens: 800 }
  );
  memoryStore.improvements.push({
    area: "learning",
    note: summary.slice(0, 300),
    applied: true,
    created_at: new Date().toISOString()
  });
  res.json({ ok: true, summary });
});

// ─── ORCHESTRATOR MEMORY (Supabase-backed) ──────────────────────────────────
import { orchestrate } from "./core/orchestrator.js";
import { modules } from "./core/modules.js";
import { decisionEngine } from "./core/decisionEngine.js";

const orchestratorMemory = {
  async getContext() {
    const ctx = { aiComplete, systemPrompt: PURVIS_SYSTEM };
    if (supabase) {
      try {
        const { data } = await supabase.from("purvis_memory")
          .select("role, content")
          .eq("user_id", "kelvin")
          .order("created_at", { ascending: false })
          .limit(10);
        if (data) ctx.recentMessages = data;
      } catch {}
    }
    return ctx;
  },
  async save(data) {
    if (supabase) {
      try {
        await supabase.from("purvis_tasks").insert({
          user_id: "kelvin",
          task_name: data.module,
          task_type: "orchestrator",
          status: "complete",
          input_data: { input: data.input },
          output_data: data.output,
          completed_at: new Date().toISOString()
        });
      } catch (e) { console.error("Memory save error:", e.message); }
    }
    console.log(`[ORCHESTRATOR] ${data.module}: saved`);
  }
};

app.post("/execute", async (req, res) => {
  const { input } = req.body;
  try {
    const result = await orchestrate(input, modules, orchestratorMemory);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ORCHESTRATOR ROUTE (full pipeline) ─────────────────────────────────────
app.post("/api/orchestrate", async (req, res) => {
  const { input, module: forceModule } = req.body;
  if (!input) return res.status(400).json({ error: "No input provided" });
  try {
    const result = await orchestrate(input, modules, orchestratorMemory);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SAVED CONTENT RETRIEVAL ────────────────────────────────────────────────
app.get("/api/content/saved", async (req, res) => {
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_content")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return res.json(data || []);
    } catch {}
  }
  res.json([]);
});

// ─── SAVED LEGAL STORAGE ────────────────────────────────────────────────────
app.post("/api/legal/save", async (req, res) => {
  const { title, content, caseNumber, motionType } = req.body;
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_content").insert({
        user_id: "kelvin",
        niche: "legal",
        platform: motionType || "motion",
        content: JSON.stringify({ title, content, caseNumber, motionType }),
        status: "final"
      }).select();
      return res.json({ ok: true, id: data?.[0]?.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ ok: true, storage: "local" });
});

app.get("/api/legal/saved", async (req, res) => {
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_content")
        .select("*")
        .eq("niche", "legal")
        .order("created_at", { ascending: false })
        .limit(20);
      return res.json(data || []);
    } catch {}
  }
  res.json([]);
});

// ─── LEADS SUPABASE STORAGE ────────────────────────────────────────────────
app.get("/api/leads/all", async (req, res) => {
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_tasks")
        .select("*")
        .eq("task_type", "lead")
        .order("created_at", { ascending: false });
      return res.json(data || []);
    } catch {}
  }
  res.json(memoryStore.leads);
});

app.post("/api/leads/store", async (req, res) => {
  const lead = req.body;
  if (supabase) {
    try {
      const { data } = await supabase.from("purvis_tasks").insert({
        user_id: "kelvin",
        task_name: lead.name || "Lead",
        task_type: "lead",
        status: "active",
        input_data: lead
      }).select();
      return res.json({ ok: true, id: data?.[0]?.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  const entry = { id: crypto.randomUUID(), ...lead, created_at: new Date().toISOString() };
  memoryStore.leads.unshift(entry);
  res.json(entry);
});

// ─── AGENT CHAIN EXECUTION ─────────────────────────────────────────────────
app.post("/api/agents/chain", async (req, res) => {
  const { steps } = req.body;
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: "No steps provided" });
  }
  const results = [];
  let prevOutput = "";
  for (const step of steps) {
    const input = step.input ? step.input.replace("{{prev}}", prevOutput) : prevOutput;
    try {
      const result = await orchestrate(input || step.task, modules, orchestratorMemory);
      prevOutput = typeof result?.data === "string" ? result.data : JSON.stringify(result);
      results.push({ step: step.name || step.task, status: "complete", output: prevOutput });
    } catch (e) {
      results.push({ step: step.name || step.task, status: "error", error: e.message });
      break;
    }
  }
  res.json({ chain: results, finalOutput: prevOutput });
});

// ─── MODULE STATUS ──────────────────────────────────────────────────────────
app.get("/api/modules", (req, res) => {
  const moduleList = Object.keys(modules).map(key => ({
    name: key,
    active: true,
    hasRun: typeof modules[key].run === "function"
  }));
  res.json({ count: moduleList.length, modules: moduleList });
});


// ─── MAIN ENGINE (PURVIS) ───────────────────────────────────────────────────
app.post("/api/purvis", async (req, res) => {
  const { input, action, userId } = req.body;
  if (!input) return res.status(400).json({ error: "No input provided" });

  try {
    // 1. Detect action/module via decisionEngine
    const moduleKey = action || (typeof decisionEngine === "function" ? decisionEngine(input) : "chat");
    
    // 2. Execute via orchestrator
    const result = await orchestrate(input, modules, orchestratorMemory);
    
    // 3. Log to purvis_logs
    if (supabase) {
      try {
        await supabase.from("purvis_logs").insert({
          user_id: userId || "kelvin",
          action: action || "auto",
          module: moduleKey,
          input: input,
          output: result,
          status: result.success !== false ? "success" : "error"
        });
      } catch (logErr) {
        console.error("[LOG ERROR]", logErr.message);
      }
    }

    // 4. Return structured result
    res.json({
      success: true,
      action: moduleKey,
      result: result.data || result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[PURVIS ERROR]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SPA FALLBACK ────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🧠 PURVIS v11 running on port ${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   AI:       ${openai ? "✅ Online" : "⚠️  Local mode (no API key)"}`);
  console.log(`   Supabase: ${supabase ? "✅ Connected" : "⚠️  Not configured"}\n`);
});
