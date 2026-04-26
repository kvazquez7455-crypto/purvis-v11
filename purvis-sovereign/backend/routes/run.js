// /backend/routes/run.js
// POST /api/run — entry point for the full pipeline.
// Wires: ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT.

const express = require("express");
const router = express.Router();

const routerCore = require("../../core/router");
const orchestrator = require("../../core/orchestrator");
const decisionEngine = require("../../core/decisionEngine");
const taskEngine = require("../../core/taskEngine");
const memoryEngine = require("../../core/memoryEngine");
const toolExecutor = require("../../core/toolExecutor");
const systemPrompt = require("../../config/systemPrompt");

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: systemPrompt.name,
    version: systemPrompt.version,
    pipeline: systemPrompt.pipeline,
    tools: toolExecutor.listTools(),
    memorySize: memoryEngine.size(),
  });
});

router.get("/memory", (req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json({ ok: true, count: memoryEngine.size(), entries: memoryEngine.recent(limit) });
});

router.post("/run", async (req, res) => {
  const input = (req.body && (req.body.input || req.body.prompt || req.body.message)) || "";
  if (!input || !String(input).trim()) {
    return res.status(400).json({ ok: false, error: "Missing 'input' in request body." });
  }

  const startedAt = Date.now();

  // 1. ROUTER
  const routed = routerCore.route(input);

  // 2. ORCHESTRATOR
  const planned = orchestrator.plan(input, routed);

  // 3. DECISION
  const decision = decisionEngine.decide(input, planned);

  // 4. TASK + 5. TOOL (TOOL stage runs inside taskEngine via toolExecutor)
  const taskResult = await taskEngine.execute(input, decision);

  // 6. MEMORY
  const memoryEntry = memoryEngine.record({
    input,
    routed,
    planned,
    decision,
    taskResult,
  });

  // 7. OUTPUT
  res.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    pipeline: {
      INPUT: input,
      ROUTER: routed,
      ORCHESTRATOR: planned,
      DECISION: decision,
      TASK: taskResult,
      MEMORY: { id: memoryEntry.id, timestamp: memoryEntry.timestamp, size: memoryEngine.size() },
      OUTPUT: taskResult.moduleOutput,
    },
  });
});

module.exports = router;
