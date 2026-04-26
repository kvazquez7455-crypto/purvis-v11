/**
 * Purvis Core Expansion — Runtime Configuration
 * Toggle-driven so the host system can disable subsystems without code changes.
 */

import * as path from "node:path";
import { PurvisConfig } from "./types";

const flag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
};

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};

export const config: PurvisConfig = {
  enableLogging: flag("PURVIS_ENABLE_LOGGING", true),
  enableCodeRunner: flag("PURVIS_ENABLE_CODE_RUNNER", true),
  enableConnectors: flag("PURVIS_ENABLE_CONNECTORS", true),
  logFile: process.env.PURVIS_LOG_FILE
    ? path.resolve(process.env.PURVIS_LOG_FILE)
    : path.resolve(__dirname, "data", "task-logs.json"),
  logLimit: num("PURVIS_LOG_LIMIT", 1000),
  defaultCodeTimeoutMs: num("PURVIS_CODE_TIMEOUT_MS", 1000),
};

/** Allow tests / hosts to override at runtime */
export function updateConfig(patch: Partial<PurvisConfig>): PurvisConfig {
  Object.assign(config, patch);
  return config;
}
