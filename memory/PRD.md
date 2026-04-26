# Purvis Core Expansion — PRD

## Original problem statement
Build a modular add-on `/modules/purvis-core-expansion/` that extends an existing AI agent system (Base44 clone) with: task logger, value engine, connector bridge, lightweight code runner, execution controller. Pipeline: router → decision → task → toolExecutor → [this module] → memory.

## User choices (this session)
- Standalone module under `/app/modules/purvis-core-expansion/` with mock host integration layer
- Pure Node.js (TypeScript via `tsx`, no compile step) + plain HTML frontend, no React
- Code Runner uses Node's built-in `vm` module
- Storage: JSON file on disk (`data/task-logs.json`)
- Minimal Execution Panel built (HTML + vanilla JS)

## Architecture (delivered)
```
/app/modules/purvis-core-expansion/
├── index.ts             # public entry: runPurvisExpansion(input)
├── executor.ts          # router + value engine + result builder
├── logger.ts            # JSON-file task log
├── connectorBridge.ts   # web/http/echo/math/mock + registerConnector()
├── codeRunner.ts        # vm-isolated JS + sanitized HTML
├── config.ts            # toggles via env vars
├── types.ts             # TaskInput / TaskResult / LogEntry / ConnectorRequest
├── mockHost.ts          # simulated router→decision→tool→purvis→memory
├── server.ts            # node:http server (no Express)
├── public/index.html    # minimal Execution Panel UI
├── test/runTest.ts      # self-test harness
├── tsconfig.json
├── package.json
└── README.md
```

## Implemented (Apr 26, 2026)
- Task logger with id/type/input/output/value/timestamp + persisted JSON store, log limit, stats
- Value Engine: legal=200, automation=150, code=75, content=50, connector=25, default=10
- Connector Bridge: built-in echo/math/mock/web(http) + `registerConnector()` for hosts
- Code Runner: `vm.createContext` with frozen minimal globals, no `process`/`require`/fs/network, hard timeout, HTML sanitiser strips `<script>`/`on*=`/iframe/javascript:
- Execution Controller: `runPurvisExpansion({ input })` → `{ result, log }`
- Config toggles: `enableLogging`, `enableCodeRunner`, `enableConnectors` (env-driven)
- Mock host pipeline simulating router/decision/tool/memory stages
- Lightweight `node:http` server with `/api/run`, `/api/code`, `/api/connector`, `/api/logs`, `/api/logs/stats`, `/api/clear`, `/api/health`
- Minimal HTML Execution Panel: run task / run code (js+html) / connector / live logs / stats — all with `data-testid` hooks
- Self-test harness: 10/10 PASS (sandbox isolation, timeout kill, html sanitisation, value engine, connectors)

## Test results
- `npm test` → 10/10 passed, 0 failed
- `tsc --noEmit` → clean, no type errors
- HTTP server boots, all endpoints return expected JSON, panel serves HTTP 200

## How to run
```
cd /app/modules/purvis-core-expansion
npm test          # self-test + mock pipeline simulation
npm run start     # panel at http://localhost:4317
```

## How a host plugs in
```ts
import { runPurvisExpansion } from "./modules/purvis-core-expansion";
const { result, log } = await runPurvisExpansion({ type: "legal", input: "draft NDA" });
```

## Backlog / next ideas (P1/P2)
- Persist connector registrations to disk for hot-reload hosts
- Optional SQLite adapter behind the same logger interface
- WebSocket stream of new logs to the panel (live tail)
- Per-task cost field alongside `value` for net-margin analytics
- Auth middleware on the http server when exposed beyond localhost
