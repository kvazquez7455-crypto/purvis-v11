/**
 * Mock host system — simulates the existing AI agent pipeline so we can
 * demonstrate that Purvis Core Expansion plugs into it cleanly without
 * replacing anything.
 *
 *   router → decision → task → toolExecutor → [purvis-core-expansion] → memory
 */

import { runPurvisExpansion } from "./index";
import { TaskInput, ExecutionEnvelope } from "./types";

interface RouterDecision {
  intent: string;
  task: TaskInput;
}

function mockRouter(rawUserInput: unknown): RouterDecision {
  // In the real system this would be an LLM/intent classifier. Here we just
  // pass through and hand the task to the next stage.
  return {
    intent: "execute",
    task:
      typeof rawUserInput === "object" && rawUserInput !== null
        ? (rawUserInput as TaskInput)
        : { input: rawUserInput },
  };
}

function mockDecision(d: RouterDecision): RouterDecision {
  // In the real system: policy / safety checks. We approve everything here.
  return d;
}

function mockToolExecutor(d: RouterDecision): TaskInput {
  // In the real system: select tools, prepare payloads. We just forward.
  return d.task;
}

function mockMemory(envelope: ExecutionEnvelope): void {
  // In the real system: write to long-term memory store. We just print.
  if (envelope.log) {
    console.log(
      `[memory] stored task ${envelope.log.id} (${envelope.log.type}) value=${envelope.log.value}`
    );
  }
}

/** Simulate one full pipeline pass. */
export async function simulatePipeline(
  rawUserInput: unknown
): Promise<ExecutionEnvelope> {
  const routed = mockRouter(rawUserInput);
  const decided = mockDecision(routed);
  const taskInput = mockToolExecutor(decided);
  const envelope = await runPurvisExpansion(taskInput);
  mockMemory(envelope);
  return envelope;
}
