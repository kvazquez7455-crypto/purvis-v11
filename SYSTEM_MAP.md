# PURVIS SYSTEM MAP

## Current Architecture (from live build)

### Pipeline
User Input → Frontend (React) → FastAPI (/api/purvis/run) → route_task → infer_type → executor → output

### Modules
- executor.py (core execution)
- code_runner.py (code execution)
- connector_bridge.py (external tools)
- types.py (schemas)

### Value Engine
- legal = 200
- automation = 150
- content = 50
- code = 75
- default = 10

---

## Missing Systems
- AI Brain (Groq / OpenAI / Claude not connected)
- Memory Engine (memory/ not used)
- Router Engine (basic regex only)
- Orchestrator (no multi-step execution)
- Persistent logging

---

## Target Architecture
User → Router → Task Engine → Executor → AI → Memory → Response

---

## System Rule
ONE REPO = CONTROL SYSTEM

This repo is now the root brain of PURVIS.
