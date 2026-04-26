// /tools/fileReader.js
// FILE READER (stub) — safe read of a local text file. Returns truncated content.

const fs = require("fs");
const path = require("path");

async function run({ filePath } = {}) {
  if (!filePath) {
    return {
      ok: false,
      error: "No filePath provided. Pass { filePath: '/relative/or/absolute/path' }.",
      note: "stub",
    };
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `File not found: ${resolved}`, note: "stub" };
  }

  const buf = fs.readFileSync(resolved, "utf8");
  const truncated = buf.length > 4000;
  return {
    ok: true,
    path: resolved,
    bytes: buf.length,
    content: truncated ? buf.slice(0, 4000) + "\n…[truncated]" : buf,
    truncated,
    note: "stub",
  };
}

module.exports = { run };
