/**
 * Purvis Core Expansion — Execution Controller
 *
 * Pipeline position:
 *   router → decision → task → toolExecutor → [executor.ts] → memory(logger)
 *
 * Responsibilities:
 *   1. Normalise the incoming TaskInput
 *   2. Route to the right subsystem (connector / code runner / default)
 *   3. Compute estimated value via the Value Engine
 *   4. Build a TaskResult and hand off to the logger
 */

import { randomUUID } from "node:crypto";
import { TaskInput, TaskResult, TaskType } from "./types";
import { runCode } from "./codeRunner";
import { executeConnector } from "./connectorBridge";

/* ---------- Value Engine (no AI, low cost, deterministic) ---------- */

const VALUE_TABLE: Record<string, number> = {
  legal: 200,
  content: 50,
  automation: 150,
  code: 75,
  connector: 25,
  default: 10,
};

export function estimateValue(type: string | undefined): number {
  const k = String(type ?? "default").toLowerCase();
  return VALUE_TABLE[k] ?? VALUE_TABLE.default;
}

/* ---------- Type inference for free-form inputs ---------- */

function inferType(input: TaskInput): TaskType | string {
  if (input.type) return input.type;
  const payload = input.input;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.code === "string" && typeof obj.language === "string")
      return "code";
    if (typeof obj.connector === "string" || typeof obj.tool === "string")
      return "connector";
  }
  if (typeof payload === "string") {
    const t = payload.toLowerCase();
    if (/\b(contract|nda|legal|clause|liability)\b/.test(t)) return "legal";
    if (/\b(automate|workflow|schedule|cron|pipeline)\b/.test(t))
      return "automation";
    if (/\b(write|article|blog|post|caption|copy)\b/.test(t)) return "content";
  }
  return "default";
}

/* ---------- Default handler (no external AI; deterministic stub) ---------- */

function defaultHandle(type: string, input: unknown): unknown {
  return {
    handled: true,
    type,
    summary:
      typeof input === "string"
        ? `received text task (${input.length} chars)`
        : "received structured task",
    note:
      "Default handler — host system can override by registering a richer router.",
  };
}

/* ---------- Router ---------- */

export async function routeTask(
  input: TaskInput
): Promise<{ output: unknown; type: string; error?: string }> {
  const type = String(inferType(input)).toLowerCase();
  const payload = input.input as Record<string, unknown> | string | undefined;

  try {
    if (type === "code" && payload && typeof payload === "object") {
      const r = await runCode({
        language: String((payload as Record<string, unknown>).language ?? "js"),
        code: String((payload as Record<string, unknown>).code ?? ""),
        context: (payload as Record<string, unknown>).context as
          | Record<string, unknown>
          | undefined,
        timeoutMs: Number(
          (payload as Record<string, unknown>).timeoutMs ?? 0
        ) || undefined,
      });
      return { output: r, type, error: r.ok ? undefined : r.error };
    }

    if (type === "connector" && payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      const connType = String(obj.connector ?? obj.tool ?? "mock");
      const r = await executeConnector({
        type: connType,
        payload: (obj.payload as Record<string, unknown>) ?? {},
      });
      return { output: r, type, error: r.ok ? undefined : r.error };
    }

    return { output: defaultHandle(type, input.input), type };
  } catch (err) {
    return {
      output: null,
      type,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ---------- Build a TaskResult from a routed output ---------- */

export function buildResult(
  input: TaskInput,
  routed: { output: unknown; type: string; error?: string },
  startedAt: number
): TaskResult {
  return {
    id: input.id ?? randomUUID(),
    type: routed.type,
    input: input.input,
    output: routed.error ? null : routed.output,
    value: estimateValue(routed.type),
    durationMs: Date.now() - startedAt,
    createdAt: new Date().toISOString(),
    error: routed.error,
  };
}
