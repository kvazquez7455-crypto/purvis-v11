# PURVIS STRUCTURE MAP

## CORE SYSTEM (CURRENT WORKING)
UI → API (/api/purvis/run) → executor → Groq → output

## TARGET ARCHITECTURE

/purvis-core
  /backend
  /frontend
  /modules
    /purvis_core_expansion
      executor.py
  /brain
    /base44_agent
    /huggingface
  /memory

/docs
  SYSTEM_STATE.md
  STRUCTURE_MAP.md

## PURPOSE
- Separate runtime code from documentation
- Prepare integration of Base44 brain and HuggingFace templates
- Prevent file clutter and confusion

## NEXT INTEGRATION TARGET
- Plug Base44 agent into executor pipeline
- Add HuggingFace templates as generation layer

## NOTE
No files moved yet. This is a map only.
