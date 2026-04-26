// /core/orchestrator.js
// ORCHESTRATOR — turns the routed input into an explicit step-by-step plan.
// It does not execute anything; it only sequences what the next stages must do.

function plan(input, routerResult) {
  const moduleName = routerResult.selectedModule;
  const text = String(input || "").trim();

  // Heuristic: detect intents that imply tool usage.
  const lower = text.toLowerCase();
  const needsSearch =
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes("look up") ||
    lower.includes("research");
  const needsFile =
    lower.includes("read file") ||
    lower.includes("open file") ||
    lower.includes(".txt") ||
    lower.includes(".md") ||
    lower.includes(".js") ||
    lower.includes(".py");

  const steps = [];
  steps.push({ id: 1, action: "parse_input", detail: "Normalize and tokenize the user request." });
  steps.push({
    id: 2,
    action: "select_strategy",
    detail: `Pick a strategy compatible with ${moduleName}.`,
  });

  if (needsSearch) {
    steps.push({ id: steps.length + 1, action: "use_tool", tool: "webSearch", detail: "Retrieve relevant context." });
  }
  if (needsFile) {
    steps.push({ id: steps.length + 1, action: "use_tool", tool: "fileReader", detail: "Read referenced files." });
  }

  steps.push({
    id: steps.length + 1,
    action: "invoke_module",
    module: moduleName,
    detail: `Hand the prepared payload to ${moduleName}.`,
  });
  steps.push({ id: steps.length + 1, action: "log_memory", detail: "Persist input/output pair." });
  steps.push({ id: steps.length + 1, action: "return_output", detail: "Return structured response." });

  return {
    stage: "ORCHESTRATOR",
    module: moduleName,
    steps,
    estimatedToolCalls: steps.filter((s) => s.action === "use_tool").length,
  };
}

module.exports = { plan };
