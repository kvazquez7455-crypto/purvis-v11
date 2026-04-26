export async function toolExecutor(tool, payload = {}, context = {}) {
  if (!tool) {
    throw new Error("No tool provided to toolExecutor");
  }

  // tool can be a function or an object with execute()
  try {
    if (typeof tool === "function") {
      return await tool(payload, context);
    }

    if (tool && typeof tool.execute === "function") {
      return await tool.execute(payload, context);
    }

    throw new Error("Invalid tool interface");
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
