export async function taskEngine(module, input, context) {
  if (!module || typeof module.run !== "function") {
    throw new Error("Invalid module passed to taskEngine");
  }

  try {
    const result = await module.run(input, context);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
