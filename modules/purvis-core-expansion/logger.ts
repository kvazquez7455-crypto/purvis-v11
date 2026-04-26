/**
 * Purvis Core Expansion — Task Logger
 * Captures every execution and persists to a JSON file on disk.
 *
 * Storage shape: { entries: LogEntry[] }
 * Append-only (with logLimit cap, trimming the oldest).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config";
import { LogEntry, TaskResult } from "./types";

interface LogStore {
  entries: LogEntry[];
}

function ensureFile(): void {
  const dir = path.dirname(config.logFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(config.logFile)) {
    fs.writeFileSync(config.logFile, JSON.stringify({ entries: [] }, null, 2));
  }
}

function readStore(): LogStore {
  ensureFile();
  try {
    const raw = fs.readFileSync(config.logFile, "utf8");
    const parsed = JSON.parse(raw) as LogStore;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function writeStore(store: LogStore): void {
  ensureFile();
  if (store.entries.length > config.logLimit) {
    store.entries = store.entries.slice(-config.logLimit);
  }
  fs.writeFileSync(config.logFile, JSON.stringify(store, null, 2));
}

/**
 * Persist a single task result. Returns the LogEntry (with persisted flag).
 * If logging is disabled via config, returns a non-persisted entry.
 */
export function logTask(result: TaskResult): LogEntry {
  const entry: LogEntry = { ...result, persisted: false };
  if (!config.enableLogging) return entry;

  const store = readStore();
  store.entries.push(entry);
  writeStore(store);
  entry.persisted = true;
  return entry;
}

export function getLogs(limit = 50): LogEntry[] {
  const store = readStore();
  return store.entries.slice(-limit).reverse();
}

export function getLogById(id: string): LogEntry | undefined {
  const store = readStore();
  return store.entries.find((e) => e.id === id);
}

export function clearLogs(): number {
  const store = readStore();
  const n = store.entries.length;
  writeStore({ entries: [] });
  return n;
}

export function logStats(): {
  count: number;
  totalValue: number;
  byType: Record<string, { count: number; value: number }>;
} {
  const store = readStore();
  const byType: Record<string, { count: number; value: number }> = {};
  let totalValue = 0;
  for (const e of store.entries) {
    totalValue += e.value || 0;
    const k = String(e.type || "default");
    if (!byType[k]) byType[k] = { count: 0, value: 0 };
    byType[k].count += 1;
    byType[k].value += e.value || 0;
  }
  return { count: store.entries.length, totalValue, byType };
}
