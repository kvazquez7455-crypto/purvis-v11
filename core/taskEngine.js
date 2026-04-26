import { toolExecutor } from "./toolExecutor.js";

export async function taskEngine(module, input, context) {
  if (!module || typeof module !== "object") {
    throw new Error("Invalid module passed to taskEngine");
  }

  try {
    // CASE 1: Single tool
    if (module.tool) {
      const result = await toolExecutor(module.tool, { input }, context);
      return {
        success: true,
        data: result
      };
    }

    // CASE 2: Multiple tools
    if (Array.isArray(module.tools) && module.tools.length > 0) {
      const results = [];

      for (const tool of module.tools) {
        if (!tool) {
          throw new Error("Missing tool in module.tools");
        }

        const res = await toolExecutor(tool, { input }, context);
        results.push(res);
      }

      return {
        success: true,
        data: results
      };
    }

    // CASE 3: Fallback to module.run
    if (typeof module.run === "function") {
      const result = await module.run(input, context);
      return {
        success: true,
        data: result
      };
    }

    throw new Error("No executable method found in module");

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
