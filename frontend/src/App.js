import { useEffect, useRef, useState } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STAGE_ORDER = [
  "INPUT",
  "ROUTER",
  "ORCHESTRATOR",
  "DECISION",
  "TASK",
  "MEMORY",
  "OUTPUT",
];

function StageCard({ name, payload, error }) {
  const body =
    typeof payload === "string"
      ? payload
      : JSON.stringify(payload, null, 2);
  return (
    <div className={`stage ${error ? "stage-error" : ""}`} data-testid={`stage-${name.toLowerCase()}`}>
      <h3>{name}</h3>
      <pre>{body}</pre>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [pipeline, setPipeline] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [health, setHealth] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    let alive = true;
    axios
      .get(`${API}/health`)
      .then((r) => {
        if (alive) setHealth(r.data);
      })
      .catch(() => {
        if (alive) setHealth(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function run() {
    const text = (input || "").trim();
    if (!text) {
      setStatus("type something first");
      return;
    }
    setRunning(true);
    setStatus("running pipeline...");
    setPipeline(null);
    setErrorMsg("");
    const t0 = Date.now();
    try {
      const res = await axios.post(`${API}/run`, { input: text });
      if (!res.data.ok) {
        setErrorMsg(res.data.error || "unknown error");
        setStatus("failed");
      } else {
        setPipeline(res.data.pipeline);
        setStatus(`done · ${Date.now() - t0}ms`);
      }
    } catch (e) {
      setErrorMsg(String(e?.response?.data?.error || e.message || e));
      setStatus("failed");
    } finally {
      setRunning(false);
    }
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
  }

  return (
    <div className="shell">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" data-testid="brand-mark">P/S</span>
          <span className="brand-name">PURVIS SOVEREIGN CORE</span>
        </div>
        <p className="pipeline-line">
          INPUT → ROUTER → ORCHESTRATOR → DECISION → TASK → TOOL → MEMORY → OUTPUT
        </p>
        {health && (
          <p className="health" data-testid="health-line">
            v{health.version} · tools: {health.tools.join(", ")} · memory: {health.memorySize}
          </p>
        )}
      </header>

      <section className="composer" data-testid="composer">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={4}
          placeholder="Speak to Purvis. e.g. 'write a blog post about sovereign AI', or 'debug this javascript function'..."
          data-testid="input-textarea"
        />
        <div className="row">
          <button
            type="button"
            onClick={run}
            disabled={running}
            data-testid="run-button"
          >
            {running ? "RUNNING..." : "RUN PIPELINE"}
          </button>
          <span className="status" data-testid="status-line">{status}</span>
        </div>
      </section>

      <section className="output" aria-live="polite" data-testid="output-region">
        {errorMsg && <StageCard name="ERROR" payload={errorMsg} error />}
        {pipeline &&
          STAGE_ORDER.map((k) => (
            <StageCard key={k} name={k} payload={pipeline[k]} />
          ))}
      </section>

      <footer className="foot">
        <span>v1.0.0 · stub modules · in-memory log · GitHub-portable Node skeleton at /purvis-sovereign</span>
      </footer>
    </div>
  );
}
