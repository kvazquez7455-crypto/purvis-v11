import { route } from "./router.js";
import { modules } from "./modules.js";

export async function orchestrate(input, modulesArg, memory) {
  if (!input) {
    throw new Error("No input provided");
  }

  // decide which module to use
  const moduleKey = route(input);

  // use passed modules OR fallback to local import
  const moduleSet = modulesArg || modules;

  const module = moduleSet[moduleKey] || moduleSet.test;

  if (!module || typeof module.run !== "function") {
    throw new Error("Invalid module");
  }

  const context = await memory.getContext();

  const result = await module.run(input, context);

  await memory.save({
    input,
    module: moduleKey,
    output: result
  });

  return result;
}
