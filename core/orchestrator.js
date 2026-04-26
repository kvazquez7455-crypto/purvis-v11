import { decisionEngine } from "./decisionEngine.js";
import { taskEngine } from "./taskEngine.js";
import { modules } from "./modules.js";

export async function orchestrate(input, modulesArg, memory) {
  if (!input) {
    throw new Error("No input provided");
  }

  const moduleSet = modulesArg || modules;

  // STEP 1: Decide module via decisionEngine
  const moduleKey = decisionEngine(input);

  const module = moduleSet[moduleKey] || moduleSet.test;

  if (!module) {
    throw new Error("Module not found");
  }

  // STEP 2: Get memory context
  const context = await memory.getContext();

  // STEP 3: Execute through taskEngine
  const result = await taskEngine(module, input, context);

  // STEP 4: Save memory
  await memory.save({
    input,
    module: moduleKey,
    output: result
  });

  return result;
}
