/**
 * Purvis Core Expansion — Public Entry Point
 *
 * Plug into existing pipeline:
 *   router → decision → task → toolExecutor → runPurvisExpansion(input) → memory
 *
 * The host system calls `runPurvisExpansion(input)` with a TaskInput and gets
 * back `{ result, log }`. Everything else (logger, connectors, code runner) is
 * accessible as named exports for advanced hosts.
 */

import { buildResult, estimateValue, routeTask } from "./executor";
import { logTask, getLogs, getLogById, clearLogs, logStats } from "./logger";
import {
  executeConnector,
  registerConnector,
  listConnectors,
} from "./connectorBridge";
import { runCode } from "./codeRunner";
import { config, updateConfig } from "./config";
import { ExecutionEnvelope, TaskInput } from "./types";

export async function runPurvisExpansion(
  input: TaskInput
): Promise<ExecutionEnvelope> {
  const startedAt = Date.now();
  const routed = await routeTask(input);
  const result = buildResult(input, routed, startedAt);
  const log = config.enableLogging ? logTask(result) : null;
  return { result, log };
}

/* ---------- Re-exports (so hosts can import a single module) ---------- */

export {
  // executor
  routeTask,
  buildResult,
  estimateValue,
  // logger
  logTask,
  getLogs,
  getLogById,
  clearLogs,
  logStats,
  // connectors
  executeConnector,
  registerConnector,
  listConnectors,
  // code runner
  runCode,
  // config
  config,
  updateConfig,
};

export * from "./types";

/* ---------- Quick self-test (used by `npm run test`) ---------- */

export async function selfTest(): Promise<{
  passed: number;
  failed: number;
  details: Array<{ name: string; ok: boolean; info?: unknown }>;
}> {
  const details: Array<{ name: string; ok: boolean; info?: unknown }> = [];
  const expect = (name: string, ok: boolean, info?: unknown) =>
    details.push({ name, ok, info });

  // 1. Default task
  const a = await runPurvisExpansion({ input: "Write a blog post about AI" });
  expect("content task inferred", a.result.type === "content");
  expect("content value=50", a.result.value === 50);
  expect("logged", !!a.log && a.log.persisted);

  // 2. Legal task explicit
  const b = await runPurvisExpansion({ type: "legal", input: "draft NDA" });
  expect("legal value=200", b.result.value === 200);

  // 3. Code runner JS
  const c = await runPurvisExpansion({
    type: "code",
    input: { language: "js", code: "return 2 + 40;" },
  });
  expect(
    "js sandbox returns 42",
    !!c.result.output &&
      (c.result.output as { output: unknown }).output === 42,
    c.result.output
  );

  // 4. Code runner HTML sanitised
  const d = await runPurvisExpansion({
    type: "code",
    input: {
      language: "html",
      code: "<h1 onclick='x'>hi</h1><script>alert(1)</script>",
    },
  });
  const html = (d.result.output as { output: string }).output;
  expect("html script stripped", !html.includes("<script"));
  expect("html onclick stripped", !html.includes("onclick"));

  // 5. Connector
  const e = await runPurvisExpansion({
    type: "connector",
    input: { connector: "math", payload: { op: "mul", a: 6, b: 7 } },
  });
  expect(
    "math connector 6*7=42",
    !!e.result.output &&
      (e.result.output as { data: { result: number } }).data?.result === 42
  );

  // 6. Sandbox isolation: process must not be reachable
  const f = await runPurvisExpansion({
    type: "code",
    input: { language: "js", code: "return typeof process;" },
  });
  expect(
    "process is undefined in sandbox",
    !!f.result.output &&
      (f.result.output as { output: unknown }).output === "undefined"
  );

  // 7. Sandbox timeout
  const g = await runPurvisExpansion({
    type: "code",
    input: { language: "js", code: "while(true){}", timeoutMs: 50 },
  });
  expect("infinite loop is killed", !!g.result.error);

  const passed = details.filter((d) => d.ok).length;
  const failed = details.length - passed;
  return { passed, failed, details };
}
