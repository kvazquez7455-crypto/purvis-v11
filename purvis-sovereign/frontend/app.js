// /frontend/app.js — minimal client. Calls POST /api/run and renders every pipeline stage.

(function () {
  const API_BASE = (window.PURVIS_API_BASE || "") + "/api";

  const $input = document.getElementById("input");
  const $send = document.getElementById("send");
  const $status = document.getElementById("status");
  const $output = document.getElementById("output");

  function setStatus(text) {
    $status.textContent = text;
  }

  function renderStage(name, payload, isError) {
    const div = document.createElement("div");
    div.className = "stage" + (isError ? " error" : "");
    const h = document.createElement("h3");
    h.textContent = name;
    const pre = document.createElement("pre");
    pre.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    div.appendChild(h);
    div.appendChild(pre);
    $output.appendChild(div);
  }

  async function run() {
    const input = ($input.value || "").trim();
    if (!input) {
      setStatus("type something first");
      return;
    }
    $output.innerHTML = "";
    $send.disabled = true;
    setStatus("running pipeline...");

    try {
      const res = await fetch(API_BASE + "/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!data.ok) {
        renderStage("ERROR", data.error || data, true);
        setStatus("failed");
        return;
      }
      const p = data.pipeline;
      renderStage("INPUT", p.INPUT);
      renderStage("ROUTER", p.ROUTER);
      renderStage("ORCHESTRATOR", p.ORCHESTRATOR);
      renderStage("DECISION", p.DECISION);
      renderStage("TASK", p.TASK);
      renderStage("MEMORY", p.MEMORY);
      renderStage("OUTPUT", p.OUTPUT);
      setStatus("done · " + data.durationMs + "ms");
    } catch (err) {
      renderStage("ERROR", String(err && err.message ? err.message : err), true);
      setStatus("failed");
    } finally {
      $send.disabled = false;
    }
  }

  $send.addEventListener("click", run);
  $input.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
  });
})();
