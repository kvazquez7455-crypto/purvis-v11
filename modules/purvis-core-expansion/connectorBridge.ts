/**
 * Purvis Core Expansion — Connector Bridge
 * Routes tool/connector requests to APIs, internal functions, or mock connectors.
 *
 * Hosts can register additional connectors at runtime via `registerConnector`.
 */

import { ConnectorRequest, ConnectorResponse } from "./types";
import { config } from "./config";

export type ConnectorHandler = (
  payload: Record<string, unknown>
) => Promise<unknown> | unknown;

const registry = new Map<string, ConnectorHandler>();

/** Register or override a connector handler. */
export function registerConnector(
  type: string,
  handler: ConnectorHandler
): void {
  registry.set(type.toLowerCase(), handler);
}

export function listConnectors(): string[] {
  return [...registry.keys()];
}

/* ---------- Built-in connectors (mocks / safe utilities) ---------- */

registerConnector("echo", (payload) => ({ echoed: payload }));

registerConnector("math", (payload) => {
  const op = String(payload.op ?? "add");
  const a = Number(payload.a ?? 0);
  const b = Number(payload.b ?? 0);
  switch (op) {
    case "add":
      return { result: a + b };
    case "sub":
      return { result: a - b };
    case "mul":
      return { result: a * b };
    case "div":
      return { result: b === 0 ? null : a / b };
    default:
      throw new Error(`Unknown math op: ${op}`);
  }
});

registerConnector("mock", (payload) => ({
  message: "mock connector ok",
  payload,
  at: new Date().toISOString(),
}));

/**
 * Lightweight web/http connector backed by node:fetch (Node 18+).
 * Method defaults to GET, body is JSON-stringified when present.
 * No filesystem, no shell — just an outbound HTTP call.
 */
const httpHandler: ConnectorHandler = async (payload) => {
  const url = String(payload.url ?? "");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("connector.http: url must start with http:// or https://");
  }
  const method = String(payload.method ?? "GET").toUpperCase();
  const headers =
    (payload.headers as Record<string, string> | undefined) ?? {};
  const body =
    payload.body === undefined
      ? undefined
      : typeof payload.body === "string"
        ? (payload.body as string)
        : JSON.stringify(payload.body);

  const controller = new AbortController();
  const timeout = Number(payload.timeoutMs ?? 5000);
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body as BodyInit | undefined,
      signal: controller.signal,
    });
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text();
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(t);
  }
};
registerConnector("web", httpHandler);
registerConnector("http", httpHandler);

/* ---------- Public entry point ---------- */

export async function executeConnector(
  req: ConnectorRequest
): Promise<ConnectorResponse> {
  if (!config.enableConnectors) {
    return { ok: false, type: req.type, data: null, error: "connectors disabled" };
  }
  const key = String(req.type ?? "").toLowerCase();
  const handler = registry.get(key);
  if (!handler) {
    return {
      ok: false,
      type: req.type,
      data: null,
      error: `unknown connector: ${req.type}`,
    };
  }
  try {
    const data = await handler(req.payload ?? {});
    return { ok: true, type: req.type, data };
  } catch (err) {
    return {
      ok: false,
      type: req.type,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
