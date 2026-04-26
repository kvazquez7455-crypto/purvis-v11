// /core/toolExecutor.js
// TOOL EXECUTOR — dynamically loads a tool by name and invokes its `.run(args)`.
// New tools only need to be dropped into /tools and registered here.

const webSearch = require("../tools/webSearch");
const fileReader = require("../tools/fileReader");

const toolRegistry = {
  webSearch,
  fileReader,
};

async function call(toolName, args) {
  const tool = toolRegistry[toolName];
  if (!tool || typeof tool.run !== "function") {
    return {
      tool: toolName,
      ok: false,
      error: `Tool "${toolName}" is not registered.`,
    };
  }
  try {
    const data = await tool.run(args || {});
    return { tool: toolName, ok: true, data };
  } catch (err) {
    return { tool: toolName, ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function listTools() {
  return Object.keys(toolRegistry);
}

module.exports = { call, listTools, registry: toolRegistry };
