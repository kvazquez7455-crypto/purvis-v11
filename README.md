# PURVIS v11.0 - The Unified Intelligence & Operations Brain

> Your personal AI operator for business, legal, content, betting, plumbing, music, images & more.

## LIVE APP
**Access PURVIS now:** https://codepen.io/kvazquez7455-crypto/full/JoRaReP

**QR Code for phone:** https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://codepen.io/kvazquez7455-crypto/full/JoRaReP

## Features
- AI Command Center (GPT-4o powered)
- Image Generation (DALL-E 3)
- Music Generation Prompts (Suno/Udio ready)
- Deep Research Engine
- Content Farm Automation
- Sub-Agent Creator
- Legal Analysis
- Plumbing / IPC Brain
- Voice Input (Speech-to-Text)
- PIN Security Login
- Supabase Memory (persistent conversations)
- API Key Rotation (auto-secure)

## Quick Start (Frontend Only)
1. Go to: https://codepen.io/kvazquez7455-crypto/full/JoRaReP
2. Enter PIN: 1234 (default)
3. When prompted, enter your OpenAI API key (stored in your browser only)
4. Start using PURVIS!

## Backend Setup (Optional - for Supabase memory)

### 1. Deploy Backend to Railway (Free)
1. Go to https://railway.app
2. Click "New Project" > "Deploy from GitHub"
3. Select this repo: kvazquez7455-crypto/purvis-v11
4. Add environment variables:
   - `OPENAI_API_KEY` = your OpenAI key
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_KEY` = your Supabase service role key
   - `ELEVENLABS_KEYS` = your ElevenLabs key (optional)
5. Railway auto-deploys!

### 2. Set Up Supabase Memory
1. Go to https://supabase.com - create free project
2. Go to SQL Editor
3. Copy & run the contents of `supabase_schema.sql`
4. Get your Project URL and Service Role Key from Settings > API

### 3. Multiple API Keys (Auto-Rotation)
For OPENAI_KEYS, separate multiple keys with commas:
```
OPENAI_KEYS=sk-key1,sk-key2,sk-key3
```
PURVIS will automatically rotate between them to maximize usage.

## Files
- `server.js` - Main Express backend server
- `package.json` - Dependencies
- `railway.json` - Railway deployment config
- `supabase_schema.sql` - Database schema

## APIs Used (All Free Tiers Available)
- OpenAI (GPT-4o + DALL-E 3)
- ElevenLabs (voice cloning - free tier)
- Suno AI / Udio (music - free)
- Supabase (memory - free tier)
- Railway (hosting - free tier)

## Kelvin's Vision
PURVIS is built to run Kelvin Vazquez's entire operation - from plumbing business to content empire to legal cases to betting analysis. One brain to rule them all.
