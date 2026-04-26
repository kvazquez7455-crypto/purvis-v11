import { useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Home = () => {
  const [input, setInput] = useState("draft an NDA");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runTask = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await axios.post(`${API}/purvis/run`, { input });
      setResult(res.data.result);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "request failed");
    } finally {
      setLoading(false);
    }
  };

  const wrap = {
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#d6e1ee",
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
    padding: "60px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };
  const card = {
    width: "100%",
    maxWidth: 640,
    background: "#11171f",
    border: "1px solid #1e2a38",
    borderRadius: 12,
    padding: 28,
  };
  const title = {
    fontSize: 18,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 600,
    margin: "0 0 4px 0",
  };
  const sub = { color: "#7e8ea3", fontSize: 12, letterSpacing: "0.08em", marginBottom: 24 };
  const label = {
    fontSize: 10,
    letterSpacing: "0.22em",
    color: "#7e8ea3",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };
  const inputStyle = {
    width: "100%",
    background: "#06090d",
    color: "#d6e1ee",
    border: "1px solid #1e2a38",
    borderRadius: 6,
    padding: "10px 12px",
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: 13,
    boxSizing: "border-box",
    outline: "none",
    marginBottom: 14,
  };
  const btn = {
    cursor: loading ? "not-allowed" : "pointer",
    background: loading ? "#3a2c14" : "#ffb347",
    color: "#1a1206",
    border: "none",
    borderRadius: 6,
    padding: "10px 18px",
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  };
  const out = {
    marginTop: 18,
    background: "#06090d",
    border: "1px solid #1e2a38",
    borderRadius: 6,
    padding: 14,
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: 12,
    color: "#b9c7d9",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
  const pill = {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    border: "1px solid #ffb34733",
    color: "#ffb347",
    marginRight: 8,
  };

  return (
    <div style={wrap}>
      <div style={card} data-testid="purvis-panel">
        <h1 style={title}>
          PURVIS<span style={{ color: "#ffb347" }}>.</span>EXEC
        </h1>
        <div style={sub}>core expansion · execution panel</div>

        <label style={label}>Task input</label>
        <input
          data-testid="purvis-input"
          style={inputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. draft an NDA, write a blog post…"
          onKeyDown={(e) => e.key === "Enter" && runTask()}
        />

        <button
          data-testid="purvis-run-button"
          style={btn}
          onClick={runTask}
          disabled={loading}
        >
          {loading ? "running…" : "Run Task"}
        </button>

        {error && (
          <div
            data-testid="purvis-error"
            style={{
              ...out,
              borderColor: "#4a1f1f",
              color: "#ff8a8a",
            }}
          >
            ERROR: {error}
          </div>
        )}

        {result && (
          <div data-testid="purvis-result" style={out}>
            <div style={{ marginBottom: 10 }}>
              <span style={pill}>{result.type}</span>
              <span style={{ color: "#58e1c2" }}>value +{result.value}</span>
              <span style={{ color: "#7e8ea3", marginLeft: 12, fontSize: 11 }}>
                {result.duration_ms}ms · id {result.id?.slice(0, 8)}
              </span>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />}>
            <Route index element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
