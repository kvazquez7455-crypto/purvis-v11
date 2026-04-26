export async function orchestrate(input, modules, memory) {
  if (!input) {
    throw new Error("No input provided");
  }

  // pick a module (for now we use 'test')
  const module = modules.test;

  if (!module || typeof module.run !== "function") {
    throw new Error("Invalid module");
  }

  const context = await memory.getContext();

  const result = await module.run(input, context);

  await memory.save({ input, output: result });

  return result;
}
