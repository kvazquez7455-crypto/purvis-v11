// /core/router.js
// ROUTER — inspects the raw input and selects which module should handle it.
// Modules are registered by name; the router does NOT execute them, it only chooses.

const systemPrompt = require("../config/systemPrompt");

// Lightweight keyword routing table.
// Extend this map to register more modules without touching the router logic.
const routingTable = [
  {
    module: "devModule",
    keywords: [
      "code",
      "function",
      "bug",
      "javascript",
      "python",
      "api",
      "build",
      "implement",
      "refactor",
      "debug",
      "stack trace",
      "compile",
      "deploy",
    ],
  },
  {
    module: "legalModule",
    keywords: [
      "contract",
      "law",
      "legal",
      "clause",
      "agreement",
      "nda",
      "terms",
      "policy",
      "compliance",
      "gdpr",
      "license",
    ],
  },
  {
    module: "contentModule",
    keywords: [
      "write",
      "article",
      "blog",
      "post",
      "tweet",
      "caption",
      "content",
      "story",
      "summary",
      "rewrite",
      "draft",
    ],
  },
];

function score(input, keywords) {
  const lower = String(input || "").toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits += 1;
  }
  return hits;
}

function route(input) {
  const ranked = routingTable
    .map((entry) => ({ module: entry.module, hits: score(input, entry.keywords) }))
    .sort((a, b) => b.hits - a.hits);

  const top = ranked[0];
  const selected =
    top && top.hits > 0 ? top.module : systemPrompt.defaults.fallbackModule;

  return {
    stage: "ROUTER",
    selectedModule: selected,
    ranking: ranked,
    reason:
      top && top.hits > 0
        ? `Matched ${top.hits} keyword(s) for ${selected}`
        : `No keyword match — falling back to ${selected}`,
  };
}

module.exports = { route };
