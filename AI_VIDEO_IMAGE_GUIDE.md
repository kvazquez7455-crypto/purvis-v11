# PURVIS AI Video, Image & OCR Guide

## Read Text from Images (OCR)
```
POST /api/ocr
{"imageUrl": "https://...", "purpose": "legal"}
```
Say: **"Read the text from this image: [url]"** or **"Turn this screenshot into a document"**

PURVIS uses GPT-4o vision to extract ALL text, then saves to purvis_images table.

## Analyze Videos
```
POST /api/video/analyze
{"videoUrl": "https://...", "title": "My Video", "purpose": "legal" or "content"}
```
- **Legal**: "Analyze this hearing video for legal issues" → issues, citations, timeline, next steps
- **Content**: "Turn this long video into 5 short clip ideas" → clips, hooks, titles, hashtags

## Generate Logos (Free)
```
POST /api/logo/generate
{"brandName": "SunBiz LLC", "colors": ["#7c3aed"], "style": "modern minimal", "vibe": "professional"}
```
Say: **"Design a logo for SunBiz LLC in purple and green"**
Returns: SVG code + Pollinations.ai image (free) + Canva prompt

## Brand Avatars (Stylized Only — No Deepfakes)
```
POST /api/avatar/create
{"style": "neon cyberpunk", "vibe": "faith-driven entrepreneur"}

PATCH /api/avatar/:id/activate  ← set as default avatar
GET /api/avatar/active          ← get current avatar
```
**SAFETY: Stylized characters only. No photorealistic face clones. No deceptive use.**

## Safety Rules (Hard-Coded)
- No celebrity or real-person impersonation
- No deepfakes or undisclosed synthetic media
- No biometric face cloning
- All generated content labeled as AI-generated in metadata
- Only user-owned or clearly licensed content processed
