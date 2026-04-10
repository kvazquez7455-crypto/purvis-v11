# 🧠 PURVIS 11 — Owner's Manual
**Kelvin Vazquez | SunBiz LLC | Orlando, FL**
**Mission: $100 → $1,000,000**

---

## What PURVIS Is

PURVIS is your **private, permanent AI operator**. It lives at:

**https://purvis-v11-production.up.railway.app**

Login: **kvazquez7455@gmail.com** (type this once, never asked again)

It runs 24/7 on Railway (free), stores everything in Supabase (free), uses your OpenAI key for AI (pay per use only), and gets smarter every time you use it.

---

## What PURVIS Has Right Now

### AI Engines (19 total)
| Engine | What it does |
|--------|-------------|
| ⚡ Chat + Planner | GPT-4o brain. Planner breaks goals into steps, asks approval, executes |
| 📱 Content Farm | Scripture Daily, Political, Plumbing, Motivation, Legal Awareness scripts |
| ⚖️ Legal Engine | Florida motions: Napue v. Illinois, Rule 1.540(b), Case 2024-DR-012028-O |
| 🎨 Image Gen | DALL-E 3 (free fallback: Pollinations.ai) |
| 🎵 Music | Suno/Udio AI music prompts |
| 🔬 Research | Deep web research + analysis |
| 📺 YouTube | Real search, trending, SEO optimizer, content ideas from trends |
| 📲 Social | Repurpose content to all platforms |
| 📧 Email | Draft professional emails for leads |
| 🖼️ Canva/CapCut | Design briefs + video editing scripts |
| 💼 Leads/CRM | Track leads, follow up, convert |
| 🔧 Plumbing IPC | DFU calculator, Florida code, estimates |
| 🌙 Sleep Mode | Task queue runs overnight while you sleep |
| 🧠 Brain & Tests | Self-tests with real API calls, logs results |
| 🔍 Web Search | DuckDuckGo + Wikipedia + news RSS |
| 🏛️ Gov Access | Congress bills, federal courts, NASA, Federal Register |
| 💾 Memory | Supabase persistent memory across all devices |
| 📋 Life Thread | Your key events, decisions, milestones timeline |
| ⚡ Sub-Agents | Spawn specialized agents for any task |

### API Keys Wired
| Key | Service | Status |
|-----|---------|--------|
| OPENAI_API_KEY | GPT-4o + DALL-E 3 | ✅ Active |
| YOUTUBE_API_KEY | YouTube Data v3 (AIzaSyCGW...) | ✅ Active |
| GOVDATA_API_KEY | api.data.gov / Congress (MBFDln...) | ✅ Active |
| COURTLISTENER_KEY | Federal court cases (2103ffc4...) | ✅ Active |
| SUPABASE_KEY | Database memory | ✅ Active |
| ELEVENLABS_KEYS | Voice cloning | ⚙️ Add when ready |
| SPORTSBOOK_API_KEY | Betting analysis ($30 credit) | ⚙️ Add when ready |
| HUGGINGFACE_API_KEY | Free AI backup | ⚙️ Add at huggingface.co |

### Free APIs (No Key, Always Work)
- DuckDuckGo web search
- Wikipedia research
- BBC / Reuters news
- YouTube trending RSS
- SCOTUS opinions RSS
- Florida Courts public portal
- Federal Register rules
- NASA images
- Open-Meteo weather
- Pollinations.ai images (free DALL-E alternative)
- Web Speech API (free voice in Chrome/Safari)

---

## How PURVIS Learns

1. **Every AI response** → saved to `purvis_cache` table → next identical question costs **$0**
2. **Every mistake you flag** → saved to `purvis_improvements` → daily learning loop reads and adapts
3. **Template library** → 9 pre-built responses cover 80% of common tasks with **zero API calls**
4. **Life thread** → your key decisions and milestones stored in `purvis_life_thread` → PURVIS references this for context
5. **The more you use PURVIS, the cheaper and smarter it gets**

---

## How to Talk to PURVIS (Best Results)

**Type messy — PURVIS always figures out what you mean.**

| What you want | What to say |
|--------------|------------|
| Content | "make me a david goliath youtube short" |
| Legal | "draft a napue motion for my case" |
| Research | "search web for florida parental rights 2025" |
| Planning | Use Planner tab — type anything, PURVIS builds the plan |
| Overnight task | Go to Sleep Mode tab, add task, PURVIS does it while you sleep |
| Test yourself | Go to Brain & Tests tab, click RUN on any scenario |

**For big goals:** Use Planner Mode. Type the goal messy. PURVIS rewrites it clean, shows the plan, asks your approval, then executes step by step.

---

## Roadmap (Next Capabilities to Build)

| Priority | Feature | What it unlocks |
|----------|---------|----------------|
| 1 | Real email sending (Nodemailer + Gmail) | Auto follow-up leads, send estimates |
| 2 | Content scheduler | Auto-prepare posts for next week |
| 3 | Telegram bot (token exists) | Chat with PURVIS from Telegram |
| 4 | Social auto-posting | Content posts itself |
| 5 | Voice cloning (ElevenLabs) | Narrate Bible content in your voice |

---

## How to Maintain PURVIS

- **Add API keys:** Railway dashboard → Variables → Add new variable
- **Update brain laws:** Supabase → purvis_memory table → INSERT or UPDATE
- **New features:** push to GitHub → Railway auto-deploys in 90 seconds
- **If broken:** check `https://purvis-v11-production.up.railway.app/api/health`
- **Golden rule:** ONLY ADD. Never delete or reset existing data.

---

## Key Links

| Resource | URL |
|----------|-----|
| PURVIS App | https://purvis-v11-production.up.railway.app |
| GitHub Code | https://github.com/kvazquez7455-crypto/purvis-v11 |
| Railway Dashboard | https://railway.com/project/533d0a2c-bfed-4296-8c5d-3b8e140742f9 |
| Supabase Database | https://supabase.com/dashboard/project/uxbyrfqizqzkcpoyiexz |
| Google Cloud | https://console.cloud.google.com (project: graphite-setup-492923-s8) |
| CodePen v10 | https://codepen.io/kvazquez7455-crypto/pen/JoRaReP (backup) |

---

## Your Context (Always Active in PURVIS Brain)

- **Business:** SunBiz LLC — plumbing contractor — Orlando, FL
- **Legal case:** 2024-DR-012028-O — Orange County FL — Napue v. Illinois — Rule 1.540(b)
- **Mission:** $100 → $1,000,000 through content empire + plumbing
- **Content:** Scripture Daily (NT), Political Commentary, Plumbing Tips, Motivation, Legal Awareness
- **Platforms:** YouTube Shorts, TikTok, Instagram, Facebook
- **Email:** kvazquez7455@gmail.com

---

*PURVIS 11 — Built April 2026 — Owned permanently by Kelvin Vazquez*
*"One brain. One memory. One path. No duplicates. Build the empire."*

---

## How to Ask PURVIS to Build Things

### "Build an app that does X"
```
POST /api/app-builder/plan
{"spec": "describe your app in plain language", "appName": "my-app"}
```
Or just tell PURVIS in chat: **"Build me an app that tracks my plumbing jobs and sends invoices"**

PURVIS will: plan → design schema → build routes → build frontend → ask your approval → deploy

### "Automate Y every day/week"
```
POST /api/automation-builder
{"description": "send me a daily lead report", "frequency": "daily"}
```
Or say: **"Automate a weekly content calendar every Sunday"**

### "Use my voice to say Z"
Add `ELEVENLABS_KEYS` to Railway → then say: **"Narrate this script in my voice"**

### "Work on this CapCut/Canva project"
- Paste your script → `POST /api/capcut/generate {script: "your script", duration: 60}`
- Get design brief → `POST /api/canva/generate {topic: "topic", platform: "youtube_thumbnail"}`
- Or say: **"Make me a CapCut script for this Bible story video"**

### See what's running
```
GET /api/status         — everything at once
GET /api/agents/health  — sub-agent status
GET /api/budget         — API spend this month
GET /api/apps           — all apps you've built
GET /api/automations    — all scheduled tasks
```

### Control sub-agents
```
PATCH /api/agents/controls/purvis_daily_content
{"enabled": false}      — turn off
{"frequency_hours": 48} — run every 2 days instead
```

---

## Budget ($35/month target)
PURVIS tracks every API call. When approaching limit, it warns you before proceeding.
Check spend: `GET /api/budget`

---

*Last updated: April 2026 | PURVIS 11 Final Master Launch*
