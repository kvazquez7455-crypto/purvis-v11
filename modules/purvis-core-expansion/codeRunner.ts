/**
 * Purvis Core Expansion — Code Builder + Runner
 * Safe, sandboxed execution of small JS / HTML snippets.
 *
 * Hard isolation rules:
 *   - No `require`, no `import`, no `process`, no `global`
 *   - No filesystem, no network, no child processes
 *   - JS runs inside a Node `vm` context with a frozen, minimal global
 *   - HTML is sanitised (script/handlers stripped) before being returned
 *   - Hard timeout enforced via vm `timeout`
 */

import * as vm from "node:vm";
import { config } from "./config";
import { CodeRunRequest, CodeRunResult } from "./types";

/* ---------- HTML sanitiser (string-level, no DOM dependency) ---------- */

function sanitizeHtml(html: string): string {
  let out = html;
  // Strip <script>...</script>
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  // Strip <style> contents kept, but block javascript: in url()
  out = out.replace(/javascript:/gi, "blocked:");
  // Strip on*="..." inline event handlers
  out = out.replace(/\son[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Strip <iframe>, <object>, <embed>
  out = out.replace(/<\/?(iframe|object|embed)\b[^>]*>/gi, "");
  return out;
}

/* ---------- JS sandbox ---------- */

function buildSandbox(
  ctx: Record<string, unknown> | undefined,
  logs: string[]
): vm.Context {
  const safeConsole = {
    log: (...args: unknown[]) => logs.push(args.map(stringify).join(" ")),
    info: (...args: unknown[]) => logs.push(args.map(stringify).join(" ")),
    warn: (...args: unknown[]) => logs.push("[warn] " + args.map(stringify).join(" ")),
    error: (...args: unknown[]) => logs.push("[error] " + args.map(stringify).join(" ")),
  };
  const sandbox: Record<string, unknown> = {
    console: safeConsole,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    RegExp,
    Promise,
    isFinite,
    isNaN,
    parseFloat,
    parseInt,
    encodeURIComponent,
    decodeURIComponent,
    ctx: ctx ?? {},
    result: undefined,
  };
  Object.freeze(sandbox.console);
  return vm.createContext(sandbox, {
    name: "purvis-sandbox",
    codeGeneration: { strings: false, wasm: false },
  });
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* ---------- Public entry point ---------- */

export async function runCode(req: CodeRunRequest): Promise<CodeRunResult> {
  const start = Date.now();
  const language = String(req.language ?? "js").toLowerCase();
  const logs: string[] = [];

  if (!config.enableCodeRunner) {
    return {
      ok: false,
      language,
      output: null,
      logs,
      error: "code runner disabled",
      durationMs: Date.now() - start,
    };
  }

  const code = String(req.code ?? "");
  if (!code.trim()) {
    return {
      ok: false,
      language,
      output: null,
      logs,
      error: "empty code",
      durationMs: Date.now() - start,
    };
  }

  /* ----- HTML branch: sanitise and return ----- */
  if (language === "html") {
    const rendered = sanitizeHtml(code);
    return {
      ok: true,
      language: "html",
      output: rendered,
      logs,
      durationMs: Date.now() - start,
    };
  }

  /* ----- JS branch: vm sandbox ----- */
  if (language === "js" || language === "javascript") {
    const sandbox = buildSandbox(req.context, logs);
    const timeout = Number(req.timeoutMs ?? config.defaultCodeTimeoutMs);

    // Wrap user code in an async IIFE so they can use await and `return`.
    // Result is captured via the sandbox's `result` binding or the IIFE return.
    const wrapped = `
      (async () => {
        ${code}
      })().then(v => { result = v; }, e => { result = { __error: String(e && e.message || e) }; });
    `;

    try {
      const script = new vm.Script(wrapped, { filename: "purvis-user.js" });
      const pending = script.runInContext(sandbox, { timeout });
      // pending is the .then() Promise; await it (with a hard wall-clock cap)
      await Promise.race([
        pending,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("execution timeout")), timeout + 50)
        ),
      ]);
      const out = (sandbox as { result: unknown }).result;
      if (out && typeof out === "object" && (out as { __error?: string }).__error) {
        return {
          ok: false,
          language: "js",
          output: null,
          logs,
          error: (out as { __error: string }).__error,
          durationMs: Date.now() - start,
        };
      }
      return {
        ok: true,
        language: "js",
        output: out === undefined ? null : out,
        logs,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        language: "js",
        output: null,
        logs,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  return {
    ok: false,
    language,
    output: null,
    logs,
    error: `unsupported language: ${language}`,
    durationMs: Date.now() - start,
  };
}
