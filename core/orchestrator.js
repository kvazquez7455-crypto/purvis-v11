import { route } from "./router.js";

export async function orchestrate(input, modules, memory) {
  if (!input) {
    throw new Error("No input provided");
  }

  // decide which module to use
  const moduleKey = route(input) || "test";

  const module = modules[moduleKey];

  if (!module || typeof module.run !== "function") {
    throw new Error(`Invalid module: ${moduleKey}`);
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
