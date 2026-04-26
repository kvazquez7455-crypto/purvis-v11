// /tools/webSearch.js
// WEB SEARCH (stub) — replace .run() with a real search API later (SerpAPI, Brave, Tavily, …).

async function run({ query } = {}) {
  const q = String(query || "").trim();
  return {
    query: q,
    results: [
      {
        title: `Stub result for "${q.slice(0, 60)}"`,
        url: "https://example.com/stub-1",
        snippet: "This is a placeholder web-search result. Wire up a real search provider.",
      },
      {
        title: "Purvis Sovereign Core — README",
        url: "https://example.com/stub-2",
        snippet: "Pipeline: INPUT → ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT.",
      },
    ],
    note: "stub",
  };
}

module.exports = { run };
