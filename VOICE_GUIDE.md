# PURVIS Voice Guide

## How PURVIS Speaks

**Default (Free):** Web Speech API — built into Chrome/Safari, no cost
**Premium:** ElevenLabs TTS — add ELEVENLABS_KEYS to Railway

## Check Voice Profile
```
GET /api/voice/profile
```

## Toggle Broke Mode (free voice only)
```
PATCH /api/voice/profile
{"broke_mode": true}
```
Say: **"Turn broke mode on for voice"** or **"Use the free voice"**

## Set ElevenLabs Voice
```
PATCH /api/voice/profile
{"api_provider": "elevenlabs", "elevenlabs_voice_id": "your_voice_id"}
```
Get voice ID from elevenlabs.io after uploading your voice sample.

## Narrate Content
```
POST /api/voice/narrate
{"text": "your script here"}
```
Say: **"Read this script in your voice"** or **"Narrate this for me"**

## Check Voice Spend
```
GET /api/voice/logs
```
