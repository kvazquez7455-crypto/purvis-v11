// core/toolExecutor.js

require("dotenv").config();
const fetch = require("node-fetch");

// ==============================
// TOOL REGISTRY (PLUG SYSTEM)
// ==============================

const tools = {
  webSearch: {
    run: async ({ query }) => {
      const res = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${process.env.SERPER_API_KEY}`);
      const data = await res.json();
      return data;
    }
  },

  fileReader: {
    run: async ({ path }) => {
      const fs = require("fs");
      return fs.readFileSync(path, "utf-8");
    }
  },

  grokChat: {
    run: async ({ message }) => {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROK_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "grok-2-latest",
          messages: [
            { role: "user", content: message }
          ]
        })
      });

      const data = await res.json();

      if (!data.choices) {
        throw new Error("Grok failed: " + JSON.stringify(data));
      }

      return data.choices[0].message.content;
    }
  }
};

// ==============================
// EXECUTOR CORE
// ==============================

async function execute({ tool, input }) {
  const selected = tools[tool];

  if (!selected) {
    return {
      ok: false,
      error: `Tool "${tool}" not found`
    };
  }

  try {
    console.log("EXEC:", tool, input);

    const result = await selected.run(input);

    return {
      ok: true,
      tool,
      result
    };

  } catch (err) {
    console.error("EXEC ERROR:", err);

    return {
      ok: false,
      tool,
      error: err.message
    };
  }
}

// ==============================
// TEST ENTRY (FOR YOU)
// ==============================

async function test() {
  const res = await execute({
    tool: "grokChat",
    input: { message: "Say hello from PURVIS system" }
  });

  console.log("RESULT:", res);
}

// Uncomment to test locally
// test();

module.exports = { execute };