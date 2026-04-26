import { route } from "./router.js";

export async function orchestrate(input, modules, memory) {
  const moduleKey = route(input);

  const module = modules[moduleKey] || modules["general"];

  const context = await memory.getContext();

  const result = await module.run(input, context);

  await memory.save({
    input,
    module: moduleKey,
    output: result
  });

  return result;
}
