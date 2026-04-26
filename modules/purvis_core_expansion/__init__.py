"""
Purvis Core Expansion — Public Entry Point

Plug into existing pipeline:
  router → decision → task → toolExecutor → run_purvis_expansion(input) → memory

The host system imports `run_purvis_expansion` and gets back an
ExecutionEnvelope ({ result, log }). The default FastAPI host wires this
through /api/purvis/* routes (see backend/server.py).
"""
from __future__ import annotations
import time
from typing import Any, Dict, List

from .types import (
    TaskInput,
    TaskResult,
    LogEntry,
    ConnectorRequest,
    ConnectorResponse,
    CodeRunRequest,
    CodeRunResult,
    ExecutionEnvelope,
)
from .executor import route_task, build_result, estimate_value, infer_type
from .logger import (
    log_task,
    get_logs,
    get_log_by_id,
    clear_logs,
    log_stats,
)
from .connector_bridge import (
    execute_connector,
    register_connector,
    list_connectors,
)
from .code_runner import run_code
from .config import config, update_config


async def run_purvis_expansion(task: TaskInput) -> ExecutionEnvelope:
    started_at = time.monotonic()
    routed = await route_task(task)
    result = build_result(task, routed, started_at)
    log = log_task(result) if config.enable_logging else None
    return ExecutionEnvelope(result=result, log=log)


# ---------- Self-test ----------

async def self_test() -> Dict[str, Any]:
    details: List[Dict[str, Any]] = []

    def expect(name: str, ok: bool, info: Any = None) -> None:
        details.append({"name": name, "ok": bool(ok), "info": info})

    # 1. Content task inferred
    a = await run_purvis_expansion(TaskInput(input="Write a blog post about AI"))
    expect("content task inferred", a.result.type == "content", a.result.type)
    expect("content value=50", a.result.value == 50, a.result.value)
    expect("logged", a.log is not None and a.log.persisted)

    # 2. Legal task explicit
    b = await run_purvis_expansion(TaskInput(type="legal", input="draft NDA"))
    expect("legal value=200", b.result.value == 200, b.result.value)

    # 3. Python sandbox
    c = await run_purvis_expansion(
        TaskInput(type="code", input={"language": "python", "code": "result = 2 + 40"})
    )
    code_out = (c.result.output or {}).get("output") if isinstance(c.result.output, dict) else None
    expect("python sandbox returns 42", code_out == 42, c.result.output)

    # 4. HTML sanitised
    d = await run_purvis_expansion(
        TaskInput(
            type="code",
            input={
                "language": "html",
                "code": "<h1 onclick='x'>hi</h1><script>alert(1)</script>",
            },
        )
    )
    html_out = (d.result.output or {}).get("output") if isinstance(d.result.output, dict) else ""
    expect("html script stripped", "<script" not in str(html_out))
    expect("html onclick stripped", "onclick" not in str(html_out))

    # 5. Math connector
    e = await run_purvis_expansion(
        TaskInput(
            type="connector",
            input={"connector": "math", "payload": {"op": "mul", "a": 6, "b": 7}},
        )
    )
    e_out = e.result.output or {}
    e_data = (e_out.get("data") or {}) if isinstance(e_out, dict) else {}
    expect("math connector 6*7=42", e_data.get("result") == 42, e.result.output)

    # 6. Sandbox isolation: imports rejected
    f = await run_purvis_expansion(
        TaskInput(type="code", input={"language": "python", "code": "import os\nresult = os.listdir('/')"})
    )
    expect("imports blocked in sandbox", bool(f.result.error), f.result.error)

    # 7. Sandbox isolation: dunder blocked
    g = await run_purvis_expansion(
        TaskInput(
            type="code",
            input={"language": "python", "code": "result = ().__class__.__bases__"},
        )
    )
    expect("dunder access blocked", bool(g.result.error), g.result.error)

    # 8. Timeout enforcement
    h = await run_purvis_expansion(
        TaskInput(
            type="code",
            input={"language": "python", "code": "while True:\n    pass", "timeoutMs": 100},
        )
    )
    expect("infinite loop is killed (timeout)", bool(h.result.error), h.result.error)

    passed = sum(1 for d in details if d["ok"])
    failed = len(details) - passed
    return {"passed": passed, "failed": failed, "details": details}


__all__ = [
    # types
    "TaskInput",
    "TaskResult",
    "LogEntry",
    "ConnectorRequest",
    "ConnectorResponse",
    "CodeRunRequest",
    "CodeRunResult",
    "ExecutionEnvelope",
    # executor
    "run_purvis_expansion",
    "route_task",
    "build_result",
    "estimate_value",
    "infer_type",
    # logger
    "log_task",
    "get_logs",
    "get_log_by_id",
    "clear_logs",
    "log_stats",
    # connectors
    "execute_connector",
    "register_connector",
    "list_connectors",
    # code runner
    "run_code",
    # config
    "config",
    "update_config",
    # self-test
    "self_test",
]
