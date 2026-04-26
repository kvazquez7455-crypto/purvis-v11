/**
 * Purvis Core Expansion — Type Definitions
 * Shared, strict types used across the module surface.
 */

export type TaskType =
  | "legal"
  | "content"
  | "automation"
  | "code"
  | "connector"
  | "default";

export interface TaskInput {
  /** Stable client-supplied or auto-generated id (optional) */
  id?: string;
  /** Logical category that drives the value engine */
  type?: TaskType | string;
  /** Free-form human prompt or structured payload */
  input: unknown;
  /** Optional metadata propagated through the pipeline */
  meta?: Record<string, unknown>;
}

export interface TaskResult {
  id: string;
  type: TaskType | string;
  input: unknown;
  output: unknown;
  /** Estimated economic value produced by this task (USD-ish, abstract) */
  value: number;
  /** Wall-clock duration in ms */
  durationMs: number;
  /** ISO timestamp when the task completed */
  createdAt: string;
  /** Optional error if the task failed (output will be null) */
  error?: string;
}

export interface LogEntry extends TaskResult {
  /** True after the entry has been persisted to disk */
  persisted: boolean;
}

export type ConnectorType = "web" | "http" | "echo" | "math" | "mock";

export interface ConnectorRequest {
  type: ConnectorType | string;
  payload?: Record<string, unknown>;
}

export interface ConnectorResponse {
  ok: boolean;
  type: string;
  data: unknown;
  error?: string;
}

export type CodeLanguage = "js" | "javascript" | "html";

export interface CodeRunRequest {
  language: CodeLanguage | string;
  code: string;
  /** Optional bag of variables exposed to the JS sandbox */
  context?: Record<string, unknown>;
  /** Hard timeout for JS execution in ms (default 1000) */
  timeoutMs?: number;
}

export interface CodeRunResult {
  ok: boolean;
  language: string;
  output: unknown;
  logs: string[];
  error?: string;
  durationMs: number;
}

export interface PurvisConfig {
  enableLogging: boolean;
  enableCodeRunner: boolean;
  enableConnectors: boolean;
  /** Path of the JSON log store (relative to module root) */
  logFile: string;
  /** Max entries kept in the log store */
  logLimit: number;
  /** Default code execution timeout */
  defaultCodeTimeoutMs: number;
}

export interface ExecutionEnvelope {
  result: TaskResult;
  log: LogEntry | null;
}
