# PURVIS SOVEREIGN CORE — PRD

## Original Problem Statement
Build PURVIS SOVEREIGN CORE — a modular AI agent system / execution engine.
Pipeline: INPUT → ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT.
Stack constraint from user: Node.js + Express + plain HTML/JS, GitHub-portable, runnable on any free platform (Render, Railway, Fly.io, Replit, Glitch). No simplification, no skipped files, exact folder structure.

## Architecture
- `/app/purvis-sovereign/` — the GitHub-portable Node.js project (the deliverable).
  - `frontend/` (index.html, app.js, styles.css)
  - `backend/server.js` + `backend/routes/run.js` (Express on port 8002)
  - `core/` (router, orchestrator, decisionEngine, taskEngine, toolExecutor, memoryEngine)
  - `modules/` (devModule, legalModule, contentModule)
  - `tools/` (webSearch, fileReader — stubs)
  - `config/systemPrompt.js`
- `/app/backend/server.py` — FastAPI shim used only inside the Emergent container. Spawns `node backend/server.js` as a child process and reverse-proxies every `/api/*` request to it. Not needed for free-platform deploys.
- `/app/frontend/` — React UI mirroring the plain HTML/JS interface, used inside Emergent for testing. The portable plain HTML lives under `/app/purvis-sovereign/frontend/`.

## What's been implemented (2026-02)
- Full pipeline INPUT → ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT.
- 3 registered modules (dev, legal, content), keyword-based router with fallback.
- Dynamic tool executor with 2 stub tools (webSearch, fileReader).
- In-memory log of every run, accessible via `GET /api/memory`.
- Endpoints: `POST /api/run`, `GET /api/health`, `GET /api/memory`.
- React UI shows every pipeline stage as a separate card.
- npm/yarn install green, all stages tested via curl, all 3 modules route correctly.

## Core Requirements (static)
- Modular: each core stage and module is a single-responsibility file with its own export.
- Extensible: new module = drop file in `/modules` + register; new tool = drop file in `/tools` + register.
- Portable: zero Emergent-specific code in `/app/purvis-sovereign`. Pure Node + Express + static HTML.
- Spec-faithful: file tree mirrors the user's roadmap exactly.

## Backlog / Next Action Items
P0
- Plug an LLM (Claude / GPT / Gemini) into one or more modules so output is generative, not stub.
- Add a file-upload endpoint + analyzer module so user can feed in past Purvis 11 attempts and have the system extract reusable code/logic.

P1
- Persist `memoryEngine` to MongoDB / SQLite so runs survive restarts.
- Real `webSearch` tool (Brave / Tavily / SerpAPI).
- Add an admin/inspect view that streams `/api/memory` live.

P2
- Auth on `/api/run` for hosted deploys.
- Per-module config files.
- Metrics endpoint (per-stage timings, per-module counts).

## Notes for future agents
- The spec is sacred: do not collapse files, do not "simplify architecture", do not refactor module boundaries.
- All third-party API integrations MUST go through `integration_playbook_expert_v2` first.
- The FastAPI proxy (`/app/backend/server.py`) is throwaway infra for Emergent — never put business logic there.
