// /core/decisionEngine.js
// DECISION ENGINE — chooses the concrete strategy & confirms which tools to call.
// It transforms the orchestrator's plan into an executable directive for the task engine.

const systemPrompt = require("../config/systemPrompt");

function decide(input, plan) {
  const toolSteps = plan.steps.filter((s) => s.action === "use_tool");
  const toolsToCall = toolSteps
    .map((s) => s.tool)
    .slice(0, systemPrompt.defaults.maxToolCalls);

  const length = String(input || "").trim().length;
  let strategy = "direct_response";
  if (toolsToCall.length > 0) strategy = "tool_augmented";
  if (length > 280) strategy = "long_form_synthesis";

  let confidence = 0.6;
  if (toolsToCall.length > 0) confidence += 0.15;
  if (length > 0) confidence += 0.1;
  if (confidence > 0.95) confidence = 0.95;

  return {
    stage: "DECISION",
    strategy,
    toolsToCall,
    module: plan.module,
    confidence: Number(confidence.toFixed(2)),
    rationale: `Strategy "${strategy}" chosen for module "${plan.module}" with ${toolsToCall.length} tool call(s).`,
  };
}

module.exports = { decide };
