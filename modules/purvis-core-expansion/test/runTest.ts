/**
 * Test harness — runs the built-in selfTest plus a mock-pipeline simulation.
 * Usage: `npm test`  (which calls `tsx test/runTest.ts`)
 */

import { selfTest, clearLogs } from "../index";
import { simulatePipeline } from "../mockHost";

(async () => {
  console.log("Purvis Core Expansion — test harness\n");
  clearLogs();

  // 1. Built-in self test
  const r = await selfTest();
  for (const d of r.details) {
    console.log(`  ${d.ok ? "PASS" : "FAIL"}  ${d.name}`);
    if (!d.ok && d.info !== undefined)
      console.log("        info:", JSON.stringify(d.info));
  }
  console.log(`\nSelf-test: ${r.passed} passed, ${r.failed} failed\n`);

  // 2. Mock pipeline simulation
  console.log("Simulating mock pipeline (router → decision → task → toolExecutor → purvis → memory):\n");

  const samples: unknown[] = [
    "Please write a blog post about Mars colonies",
    { type: "legal", input: "Draft a 1-page NDA" },
    { type: "automation", input: "Schedule a daily report at 9am" },
    {
      type: "code",
      input: { language: "js", code: "return [1,2,3].reduce((a,b)=>a+b,0);" },
    },
    {
      type: "code",
      input: { language: "html", code: "<h1>Hello Purvis</h1>" },
    },
    {
      type: "connector",
      input: { connector: "echo", payload: { hello: "world" } },
    },
  ];

  for (const s of samples) {
    const env = await simulatePipeline(s);
    console.log(
      `  → type=${env.result.type.padEnd(10)} value=${String(env.result.value).padStart(3)}  ${env.result.error ? "ERR " + env.result.error : "ok"}`
    );
  }

  if (r.failed > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
