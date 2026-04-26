import { useEffect, useState, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/purvis`;

const TYPE_COLORS = {
  legal: "#ffb347",
  content: "#58e1c2",
  automation: "#c08bff",
  code: "#7fc8ff",
  connector: "#ffd166",
  default: "#7e8ea3",
};

const fmt = (v) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

export default function PurvisPanel() {
  const [taskType, setTaskType] = useState("");
  const [taskInput, setTaskInput] = useState(
    "Write a short article about modular AI agents"
  );
  const [output, setOutput] = useState("— output will appear here —");
  const [status, setStatus] = useState("ready");
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ count: 0, totalValue: 0 });

  const refresh = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        axios.get(`${API}/logs?limit=50`),
        axios.get(`${API}/logs/stats`),
      ]);
      setLogs(logsRes.data.entries || []);
      setStats(statsRes.data || { count: 0, totalValue: 0 });
    } catch (e) {
      setStatus("offline: " + (e.response?.data?.detail || e.message));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runTask = async () => {
    setStatus("running…");
    let parsed;
    try {
      parsed = JSON.parse(taskInput);
    } catch {
      parsed = taskInput;
    }
    try {
      const res = await axios.post(`${API}/run`, {
        type: taskType || undefined,
        input: parsed,
      });
      setOutput(fmt(res.data));
      setStatus("ok");
      refresh();
    } catch (e) {
      setOutput("ERROR: " + (e.response?.data?.detail || e.message));
      setStatus("error");
    }
  };

  const runTest = async () => {
    setStatus("self-test…");
    try {
      const res = await axios.post(`${API}/run-test`);
      setOutput(fmt(res.data));
      setStatus(`self-test: ${res.data.passed} passed, ${res.data.failed} failed`);
      refresh();
    } catch (e) {
      setOutput("ERROR: " + (e.response?.data?.detail || e.message));
      setStatus("error");
    }
  };

  const clearLogs = async () => {
    await axios.post(`${API}/logs/clear`);
    refresh();
    setStatus("cleared");
  };

  const styles = {
    wrap: {
      maxWidth: 980,
      margin: "32px auto",
      padding: "24px",
      background: "#11171f",
      border: "1px solid #1e2a38",
      borderRadius: 12,
      color: "#d6e1ee",
      fontFamily:
        "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
      textAlign: "left",
    },
    header: {
      display: "flex",
      alignItems: "baseline",
      gap: 14,
      marginBottom: 18,
      borderBottom: "1px solid #1e2a38",
      paddingBottom: 14,
    },
    title: {
      fontSize: 16,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontWeight: 600,
      margin: 0,
    },
    dot: { color: "#ffb347" },
    sub: { color: "#7e8ea3", fontSize: 12, letterSpacing: "0.08em" },
    stats: {
      marginLeft: "auto",
      display: "flex",
      gap: 16,
      fontSize: 12,
      color: "#7e8ea3",
    },
    grid: { display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 },
    card: {
      background: "#0d131b",
      border: "1px solid #1e2a38",
      borderRadius: 8,
      padding: 14,
    },
    label: {
      fontSize: 10,
      letterSpacing: "0.22em",
      color: "#7e8ea3",
      textTransform: "uppercase",
      marginBottom: 8,
      display: "block",
    },
    input: {
      width: "100%",
      background: "#06090d",
      color: "#d6e1ee",
      border: "1px solid #1e2a38",
      borderRadius: 6,
      padding: "8px 10px",
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 12,
      boxSizing: "border-box",
      outline: "none",
    },
    textarea: {
      width: "100%",
      minHeight: 90,
      resize: "vertical",
      background: "#06090d",
      color: "#d6e1ee",
      border: "1px solid #1e2a38",
      borderRadius: 6,
      padding: "8px 10px",
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      boxSizing: "border-box",
      outline: "none",
    },
    row: { display: "flex", gap: 8, marginTop: 10, alignItems: "center" },
    btn: {
      cursor: "pointer",
      background: "#ffb347",
      color: "#1a1206",
      border: "1px solid #ffb347",
      borderRadius: 6,
      padding: "8px 14px",
      fontWeight: 600,
      fontSize: 12,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    btnGhost: {
      cursor: "pointer",
      background: "transparent",
      color: "#d6e1ee",
      border: "1px solid #1e2a38",
      borderRadius: 6,
      padding: "8px 14px",
      fontSize: 12,
    },
    out: {
      background: "#06090d",
      border: "1px solid #1e2a38",
      borderRadius: 6,
      padding: 12,
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 11,
      color: "#b9c7d9",
      maxHeight: 280,
      overflow: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      marginTop: 12,
    },
    log: {
      padding: "10px 12px",
      background: "#0d131b",
      border: "1px solid #1e2a38",
      borderRadius: 6,
      marginBottom: 8,
      fontSize: 11,
    },
    pill: (t) => ({
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 9,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      border: `1px solid ${TYPE_COLORS[t] || "#1e2a38"}33`,
      color: TYPE_COLORS[t] || "#7e8ea3",
    }),
  };

  return (
    <div style={styles.wrap} data-testid="purvis-panel">
      <div style={styles.header}>
        <h2 style={styles.title}>
          PURVIS<span style={styles.dot}>.</span>EXEC
        </h2>
        <span style={styles.sub}>core expansion · execution panel</span>
        <div style={styles.stats}>
          <span data-testid="purvis-stat-count">
            tasks <b style={{ color: "#d6e1ee" }}>{stats.count}</b>
          </span>
          <span data-testid="purvis-stat-value">
            value <b style={{ color: "#58e1c2" }}>{stats.totalValue}</b>
          </span>
          <span data-testid="purvis-status">{status}</span>
        </div>
      </div>

      <div style={styles.grid}>
        <div>
          <div style={styles.card}>
            <span style={styles.label}>Run Task</span>
            <select
              data-testid="purvis-type-select"
              style={{ ...styles.input, marginBottom: 8 }}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
            >
              <option value="">(auto-detect)</option>
              <option value="legal">legal (200)</option>
              <option value="content">content (50)</option>
              <option value="automation">automation (150)</option>
              <option value="code">code (75)</option>
              <option value="connector">connector (25)</option>
              <option value="default">default (10)</option>
            </select>
            <textarea
              data-testid="purvis-input-textarea"
              style={styles.textarea}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Plain text or JSON object…"
            />
            <div style={styles.row}>
              <button
                data-testid="purvis-run-button"
                style={styles.btn}
                onClick={runTask}
              >
                Run Task
              </button>
              <button
                data-testid="purvis-run-test-button"
                style={styles.btnGhost}
                onClick={runTest}
              >
                Run Self-Test
              </button>
              <div style={{ flex: 1 }} />
              <button
                data-testid="purvis-clear-button"
                style={styles.btnGhost}
                onClick={clearLogs}
              >
                Clear
              </button>
            </div>
            <pre style={styles.out} data-testid="purvis-output">
              {output}
            </pre>
          </div>
        </div>

        <div>
          <div
            style={{
              ...styles.card,
              maxHeight: 540,
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span style={styles.label}>Recent Tasks</span>
              <div style={{ flex: 1 }} />
              <button
                data-testid="purvis-refresh-button"
                style={styles.btnGhost}
                onClick={refresh}
              >
                Refresh
              </button>
            </div>
            <div data-testid="purvis-log-list">
              {logs.length === 0 ? (
                <div
                  style={{
                    color: "#7e8ea3",
                    textAlign: "center",
                    padding: 24,
                    border: "1px dashed #1e2a38",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  No tasks yet. Run something on the left.
                </div>
              ) : (
                logs.map((e) => (
                  <div
                    key={e.id}
                    style={styles.log}
                    data-testid="purvis-log-item"
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span style={styles.pill(e.type)}>{e.type}</span>
                      {e.error && (
                        <span style={{ ...styles.pill("default"), color: "#ff6b6b" }}>
                          error
                        </span>
                      )}
                      <span
                        style={{
                          color: "#7e8ea3",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 10,
                        }}
                      >
                        {new Date(e.created_at).toLocaleTimeString()}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span
                        style={{
                          color: "#58e1c2",
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        +{e.value}
                      </span>
                    </div>
                    <div
                      style={{
                        color: "#7e8ea3",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 10,
                        wordBreak: "break-word",
                      }}
                    >
                      {(typeof e.input === "string"
                        ? e.input
                        : JSON.stringify(e.input)
                      ).slice(0, 140)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
