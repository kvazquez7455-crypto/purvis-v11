/**
 * Tiny HTTP server (node:http) — backs the Execution Panel UI.
 *
 * Endpoints:
 *   GET  /                        → serves public/index.html
 *   GET  /public/*                → static files
 *   GET  /api/health              → { ok: true }
 *   GET  /api/logs?limit=50       → recent log entries
 *   GET  /api/logs/stats          → aggregate stats
 *   POST /api/run                 → body: TaskInput  → ExecutionEnvelope
 *   POST /api/code                → body: CodeRunRequest
 *   POST /api/connector           → body: ConnectorRequest
 *   POST /api/clear               → wipe logs
 *
 * NOTE: this server is *part of the module*. It does not replace the host
 * system — it just exposes the module surface so the minimal HTML panel
 * has something to talk to.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { runPurvisExpansion } from "./index";
import { runCode } from "./codeRunner";
import { executeConnector } from "./connectorBridge";
import { getLogs, logStats, clearLogs } from "./logger";

const PORT = Number(process.env.PURVIS_PORT || 4317);
const PUBLIC_DIR = path.resolve(__dirname, "public");

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  contentType = "application/json"
): void {
  const payload =
    contentType === "application/json" ? JSON.stringify(body) : (body as string);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res: http.ServerResponse, file: string): void {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) {
    return send(res, 404, "not found", "text/plain");
  }
  const ext = path.extname(full).toLowerCase();
  const ct =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css"
        : ext === ".js"
          ? "application/javascript"
          : "application/octet-stream";
  res.writeHead(200, { "Content-Type": ct });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") return send(res, 204, "");

  try {
    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveStatic(res, "index.html");
    }
    if (method === "GET" && url.pathname.startsWith("/public/")) {
      return serveStatic(res, url.pathname.slice("/public/".length));
    }
    if (method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, name: "purvis-core-expansion" });
    }
    if (method === "GET" && url.pathname === "/api/logs") {
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return send(res, 200, { entries: getLogs(limit) });
    }
    if (method === "GET" && url.pathname === "/api/logs/stats") {
      return send(res, 200, logStats());
    }
    if (method === "POST" && url.pathname === "/api/run") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const env = await runPurvisExpansion({
        type: body.type as string | undefined,
        input: body.input,
      });
      return send(res, 200, env);
    }
    if (method === "POST" && url.pathname === "/api/code") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const r = await runCode({
        language: String(body.language ?? "js"),
        code: String(body.code ?? ""),
        context: body.context as Record<string, unknown> | undefined,
        timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : undefined,
      });
      return send(res, 200, r);
    }
    if (method === "POST" && url.pathname === "/api/connector") {
      const body = (await readBody(req)) as Record<string, unknown>;
      const r = await executeConnector({
        type: String(body.type ?? "mock"),
        payload: (body.payload as Record<string, unknown>) ?? {},
      });
      return send(res, 200, r);
    }
    if (method === "POST" && url.pathname === "/api/clear") {
      const n = clearLogs();
      return send(res, 200, { cleared: n });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Purvis Execution Panel → http://localhost:${PORT}`);
});
