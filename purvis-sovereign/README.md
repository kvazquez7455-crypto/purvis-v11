# PURVIS SOVEREIGN CORE

A modular AI agent system. Skeleton you can extend.

## Pipeline

```
INPUT → ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT
```

## Structure

```
/frontend
  index.html
  app.js
  styles.css

/backend
  server.js
  routes/
    run.js

/core
  router.js
  orchestrator.js
  decisionEngine.js
  taskEngine.js
  toolExecutor.js
  memoryEngine.js

/modules
  devModule.js
  legalModule.js
  contentModule.js

/tools
  webSearch.js
  fileReader.js

/config
  systemPrompt.js

package.json
```

## Run locally

```bash
npm install
npm start
# open http://localhost:8002
```

## API

`POST /api/run`

```json
{ "input": "write a blog post about sovereign AI" }
```

Returns the full pipeline trace plus `OUTPUT`.

`GET /api/health` — service info.
`GET /api/memory?limit=20` — recent runs from the in-memory log.

## Extend

- **Add a module** → drop a file into `/modules`, register it in `core/taskEngine.js`, add keywords in `core/router.js`.
- **Add a tool** → drop a file into `/tools`, register it in `core/toolExecutor.js`.
- **Plug an LLM** → call your model from inside any module's `run()`.
- **Persist memory** → swap `core/memoryEngine.js` for Redis/Mongo/PG.

## Free-platform deploy

This skeleton is plain Node.js + Express + static HTML. It runs unmodified on Render, Railway, Fly.io, Replit, Glitch, and any container host. No build step.
