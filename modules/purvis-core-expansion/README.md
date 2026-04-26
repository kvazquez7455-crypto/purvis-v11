# Purvis Core Expansion

Modular add-on for the existing AI agent (Base44 clone).

Pipeline position:

```
router → decision → task → toolExecutor → [purvis-core-expansion] → memory
```

This module **extends** the host system. It does **not** replace any core file.

## What's inside

| File                  | Purpose                                                |
|-----------------------|--------------------------------------------------------|
| `index.ts`            | Public entry point: `runPurvisExpansion(input)`        |
| `executor.ts`         | Router + value engine + result builder                 |
| `logger.ts`           | JSON-file task log (input/output/type/value/timestamp) |
| `connectorBridge.ts`  | Pluggable connectors (web/math/echo/mock + custom)     |
| `codeRunner.ts`       | Safe `vm`-isolated JS + sanitised HTML runner          |
| `config.ts`           | Toggles: `enableLogging`, `enableCodeRunner`, …        |
| `types.ts`            | `TaskInput`, `TaskResult`, `LogEntry`, `ConnectorRequest` |
| `mockHost.ts`         | Mock pipeline (router → decision → tool → purvis → memory) |
| `server.ts`           | Lightweight `node:http` server backing the panel       |
| `public/index.html`   | Plain-HTML Execution Panel UI                          |
| `test/runTest.ts`     | Self-test harness (`npm test`)                         |

## Usage from host system

```ts
import { runPurvisExpansion } from "./modules/purvis-core-expansion";

const { result, log } = await runPurvisExpansion({
  type: "legal",
  input: "draft an NDA"
});
// result.value === 200, log persisted to data/task-logs.json
```

## Value Engine

| type        | value |
|-------------|-------|
| legal       | 200   |
| automation  | 150   |
| code        | 75    |
| content     | 50    |
| connector   | 25    |
| default     | 10    |

## Sandbox guarantees

- No `require`, `import`, `process`, `global`, fs, network or child_process inside JS sandbox
- `vm.createContext` with `codeGeneration: { strings: false, wasm: false }`
- Hard timeout (default 1000 ms)
- HTML stripped of `<script>`, inline `on*` handlers, `iframe`/`object`/`embed`, `javascript:` URLs

## Run locally

```bash
cd /app/modules/purvis-core-expansion
npm install
npm test          # run self-test + mock pipeline
npm run start     # start panel at http://localhost:4317
```

## Config (env vars)

| Var                          | Default                  |
|------------------------------|--------------------------|
| `PURVIS_ENABLE_LOGGING`      | `true`                   |
| `PURVIS_ENABLE_CODE_RUNNER`  | `true`                   |
| `PURVIS_ENABLE_CONNECTORS`   | `true`                   |
| `PURVIS_LOG_FILE`            | `./data/task-logs.json`  |
| `PURVIS_LOG_LIMIT`           | `1000`                   |
| `PURVIS_CODE_TIMEOUT_MS`     | `1000`                   |
| `PURVIS_PORT`                | `4317`                   |
