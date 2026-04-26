// /modules/contentModule.js
// CONTENT MODULE — handles write/blog/post/copy style requests.
// Stub implementation: produces a content brief.

async function run(input, context) {
  const text = String(input || "").trim();
  const toolHits = (context && context.toolResults) || [];

  return {
    module: "contentModule",
    summary: `Content request acknowledged: "${text.slice(0, 140)}${text.length > 140 ? "…" : ""}"`,
    brief: {
      angle: "Reader-first, value-dense, no fluff.",
      structure: ["Hook", "Promise", "Proof", "Practical steps", "Call to action"],
      tone: "Confident, plain language, sovereign voice.",
    },
    toolEvidence: toolHits.map((t) => ({ tool: t.tool, ok: t.ok })),
    notes: "Stub content module. Plug an LLM in to generate the actual draft.",
  };
}

module.exports = { run };
