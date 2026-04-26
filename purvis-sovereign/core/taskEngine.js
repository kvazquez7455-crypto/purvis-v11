// /core/taskEngine.js
// TASK ENGINE — executes the decision by:
//   1) calling required tools through the tool executor
//   2) invoking the chosen module with the gathered context
// It is the only stage that actually does work; everything before it just plans.

const toolExecutor = require("./toolExecutor");

// Module registry — modules are loaded dynamically by name.
const moduleRegistry = {
  devModule: require("../modules/devModule"),
  legalModule: require("../modules/legalModule"),
  contentModule: require("../modules/contentModule"),
};

async function execute(input, decision) {
  const toolResults = [];
  for (const toolName of decision.toolsToCall) {
    const result = await toolExecutor.call(toolName, { query: input });
    toolResults.push(result);
  }

  const moduleImpl = moduleRegistry[decision.module];
  if (!moduleImpl || typeof moduleImpl.run !== "function") {
    return {
      stage: "TASK",
      module: decision.module,
      error: `Module "${decision.module}" is not registered.`,
      toolResults,
    };
  }

  const moduleOutput = await moduleImpl.run(input, {
    strategy: decision.strategy,
    toolResults,
  });

  return {
    stage: "TASK",
    module: decision.module,
    strategy: decision.strategy,
    toolResults,
    moduleOutput,
  };
}

module.exports = { execute, registry: moduleRegistry };
