# PURVIS 11 — Unified AI Operator System

> One brain. GPT-4o + DALL-E 3 + ElevenLabs + Supabase Memory. Built for Kelvin Vazquez.

---

## LIVE APP
Deploy to Railway (free) and access from any device, any browser, any phone.

## Engines Included
- ⚡ **Command Center** — GPT-4o powered operator
- 🤖 **AI Brain** — Full chat with persistent Supabase memory
- 📱 **Content Farm** — Scripture Daily, Political, Plumbing, Motivation, Legal Awareness
- 🎨 **Image Gen** — DALL-E 3 (real AI images)
- 🎵 **Music** — Suno + Udio prompt generator
- 🔬 **Deep Research** — GPT-4o research engine
- ⚖️ **Legal Engine** — Florida motions, Napue, Rule 1.540(b)
- 💼 **Leads / CRM** — Business lead tracker
- 🔧 **Plumbing IPC** — DFU calculator + Florida code AI
- 🤖 **Sub-Agents** — Spawn specialized AI agents
- 💾 **Memory** — Persistent brain memory (Supabase + localStorage)

## PIN: 7271

---

## Deploy to Railway (FREE — 5 minutes)

1. Go to [railway.app](https://railway.app)
2. Click **New Project → Deploy from GitHub**
3. Select: `kvazquez7455-crypto/purvis-v11`
4. Add these environment variables:

```
OPENAI_API_KEY=sk-your-key-here
SUPABASE_URL=https://uxbyrfqizqzkcpoyiexz.supabase.co
SUPABASE_KEY=your-supabase-anon-key
ELEVENLABS_KEYS=your-elevenlabs-key (optional)
```

5. Railway auto-deploys. Your URL will be `https://purvis-v11-production.up.railway.app`

---

## Run Locally

```bash
git clone https://github.com/kvazquez7455-crypto/purvis-v11
cd purvis-v11
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
npm start
# Open http://localhost:3000 — PIN: 7271
```

---

## APIs Used
| Service | Purpose | Cost |
|---------|---------|------|
| OpenAI GPT-4o | AI Brain, Command, Legal, Research, Content | Pay per use |
| OpenAI DALL-E 3 | Image Generation | Pay per use |
| ElevenLabs | Voice / Text-to-Speech | Free tier available |
| Supabase | Persistent Memory Database | Free tier |
| Railway | Hosting | Free tier |

---

Built by Kelvin Vazquez — SunBiz LLC — Orlando, FL
Mission: $100 → $1,000,000
