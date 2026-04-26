# Purvis Core Expansion — PRD

## Original problem statement
Build a modular full-stack add-on `/modules/purvis-core-expansion/` that extends an existing AI agent system (Base44 clone) with: task logger, value engine, connector bridge, lightweight code runner, execution controller. Pipeline position: `router → decision → task → toolExecutor → [this module] → memory`. Critical rule: **do not rebuild or replace the host system — extend only.**

## User decisions (final)
- Module lives ONLY in `/app/modules/purvis-core-expansion/` (Python)
- Host stack untouched: FastAPI backend (`/app/backend/server.py`) + existing React frontend (`/app/frontend/`)
- Integration: thin API routes added to `server.py` under `/api/purvis/*` — no backend restructure
- Code runner: Python AST-whitelist sandbox (no Node vm)
- Storage: JSON file at `/app/memory/task_logs.json`
- Frontend: small `PurvisPanel` component appended to existing `Home`, no UI rebuild
- Dedicated test endpoint: `POST /api/purvis/run-test`

## Architecture (delivered)
```
/app/modules/purvis-core-expansion/
├── __init__.py             # public surface: run_purvis_expansion(input), self_test()
├── executor.py             # router + value engine + result builder
├── logger.py               # JSON-file task log (thread-safe)
├── connector_bridge.py     # echo / math / mock / web (urllib) / http + register_connector()
├── code_runner.py          # AST-whitelist Python sandbox + HTML sanitiser
├── config.py               # env-driven toggles
└── types.py                # Pydantic models (TaskInput / TaskResult / LogEntry / ...)

/app/backend/server.py      # +73 lines: imports module via importlib.util, adds /api/purvis/* routes
/app/frontend/src/PurvisPanel.js  # NEW: small execution panel (no framework deps)
/app/frontend/src/App.js    # +2 lines: imports + renders <PurvisPanel/> inside existing Home
/app/memory/task_logs.json  # JSON store created on first write
```

## API surface added to backend (additive only)
| Method | Path | Purpose |
|---|---|---|
| GET  | /api/purvis/health      | Module health + active config + connector list |
| POST | /api/purvis/run         | Run a task → ExecutionEnvelope |
| POST | /api/purvis/run-test    | Built-in self-test (8+ cases) |
| POST | /api/purvis/code        | Sandboxed code execution (python / html) |
| POST | /api/purvis/connector   | Invoke a connector |
| GET  | /api/purvis/logs        | List recent log entries |
| GET  | /api/purvis/logs/stats  | Aggregate stats (count, totalValue, byType) |
| POST | /api/purvis/logs/clear  | Wipe persisted log store |

## Value Engine (deterministic, no AI)
| type        | value |
|-------------|-------|
| legal       | 200   |
| automation  | 150   |
| code        | 75    |
| content     | 50    |
| connector   | 25    |
| default     | 10    |

## Sandbox guarantees (Python code runner)
- AST whitelist rejects: `import`, `from … import`, `global`, `nonlocal`, dunder/private attribute access, dunder names, names in `{exec, eval, compile, __import__, open, input, getattr, setattr, …}`
- Execution namespace has a minimal builtins allow-list only
- Hard wall-clock timeout in a worker thread
- HTML sanitiser strips `<script>`, inline `on*=` handlers, `<iframe>`/`<object>`/`<embed>`, and `javascript:` URLs

## Test status
- `POST /api/purvis/run-test` → **11/11 PASS, 0 failed** (verified via curl + browser)
- Frontend panel rendered, task run, self-test triggered, logs populated, stats updated live
- ruff: All checks passed!
- ESLint: No issues found

## Implemented (Apr 26, 2026)
- Initial Node.js TypeScript module (later superseded)
- Full pivot to Python, integrated with existing FastAPI backend
- React `PurvisPanel` component added to existing Home view (no rebuild)
- End-to-end verified: 11/11 self-tests pass, 10 tasks logged, total value 900

## Backlog / next ideas (P1 / P2)
- Optional MongoDB adapter behind the same logger interface (drop-in)
- WebSocket live-tail of new log entries to the panel
- Per-task `cost` field alongside `value` for net-margin analytics
- Auth middleware on `/api/purvis/*` if exposed beyond internal use
- Richer connector registry (Stripe / Twilio / Sendgrid etc.) — gated behind host config
