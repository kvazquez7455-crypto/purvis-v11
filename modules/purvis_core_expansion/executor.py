"""
Purvis Core Expansion — Execution Controller

Pipeline position:
  router → decision → task → toolExecutor → [executor.py] → memory(logger)
"""
from __future__ import annotations
import re
import time
import uuid
from typing import Any, Dict

from .types import (
    TaskInput,
    TaskResult,
    CodeRunRequest,
    ConnectorRequest,
)
from .code_runner import run_code
from .connector_bridge import execute_connector


# ---------- Value Engine (no AI, low cost, deterministic) ----------

VALUE_TABLE: Dict[str, int] = {
    "legal": 200,
    "content": 50,
    "automation": 150,
    "code": 75,
    "connector": 25,
    "default": 10,
}


def estimate_value(type_: str | None) -> int:
    return VALUE_TABLE.get((type_ or "default").lower(), VALUE_TABLE["default"])


# ---------- Type inference ----------

_LEGAL_RE = re.compile(r"\b(contract|nda|legal|clause|liability)\b", re.IGNORECASE)
_AUTO_RE = re.compile(r"\b(automate|workflow|schedule|cron|pipeline)\b", re.IGNORECASE)
_CONTENT_RE = re.compile(r"\b(write|article|blog|post|caption|copy)\b", re.IGNORECASE)


def infer_type(task: TaskInput) -> str:
    if task.type:
        return task.type
    payload = task.input
    if isinstance(payload, dict):
        if isinstance(payload.get("code"), str) and isinstance(payload.get("language"), str):
            return "code"
        if isinstance(payload.get("connector"), str) or isinstance(payload.get("tool"), str):
            return "connector"
    if isinstance(payload, str):
        if _LEGAL_RE.search(payload):
            return "legal"
        if _AUTO_RE.search(payload):
            return "automation"
        if _CONTENT_RE.search(payload):
            return "content"
    return "default"


# ---------- Default handler ----------

def default_handle(type_: str, input_: Any) -> Dict[str, Any]:
    return {
        "handled": True,
        "type": type_,
        "summary": (
            f"received text task ({len(input_)} chars)"
            if isinstance(input_, str)
            else "received structured task"
        ),
        "note": "Default handler — host can override with a richer router.",
    }


# ---------- Router ----------

async def route_task(task: TaskInput) -> Dict[str, Any]:
    type_ = infer_type(task).lower()
    payload = task.input
    try:
        if type_ == "code" and isinstance(payload, dict):
            r = run_code(
                CodeRunRequest(
                    language=str(payload.get("language", "python")),
                    code=str(payload.get("code", "")),
                    context=payload.get("context") if isinstance(payload.get("context"), dict) else None,
                    timeout_ms=int(payload["timeoutMs"]) if payload.get("timeoutMs") else None,
                )
            )
            return {
                "output": r.model_dump(),
                "type": type_,
                "error": None if r.ok else r.error,
            }

        if type_ == "connector" and isinstance(payload, dict):
            conn_type = str(payload.get("connector") or payload.get("tool") or "mock")
            conn_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
            r = await execute_connector(
                ConnectorRequest(type=conn_type, payload=conn_payload or {})
            )
            return {
                "output": r.model_dump(),
                "type": type_,
                "error": None if r.ok else r.error,
            }

        return {"output": default_handle(type_, payload), "type": type_, "error": None}
    except Exception as e:  # noqa: BLE001
        return {"output": None, "type": type_, "error": str(e)}


def build_result(task: TaskInput, routed: Dict[str, Any], started_at: float) -> TaskResult:
    err = routed.get("error")
    return TaskResult(
        id=task.id or str(uuid.uuid4()),
        type=routed["type"],
        input=task.input,
        output=None if err else routed["output"],
        value=estimate_value(routed["type"]),
        duration_ms=int((time.monotonic() - started_at) * 1000),
        error=err,
    )


# ---------- Public sync entry: run_task(input_str) ----------
#
# This is the canonical hook the host system imports:
#     from modules.purvis_core_expansion.executor import run_task
#
# It accepts a plain string (or a dict for advanced callers), runs it through
# the full pipeline (route → execute → log), and returns a JSON-safe dict.

def run_task(user_input: Any) -> Dict[str, Any]:
    """Synchronous task executor — input → execution → logging → output."""
    from .logger import log_task  # local import to avoid cycle at module load
    started_at = time.monotonic()

    if isinstance(user_input, dict):
        task = TaskInput(**{k: v for k, v in user_input.items() if k in {"id", "type", "input", "meta"}})
        if task.input is None and "input" not in user_input:
            task = TaskInput(input=user_input)
    else:
        task = TaskInput(input=user_input)

    type_ = infer_type(task).lower()
    output = default_handle(type_, task.input)

    result = TaskResult(
        id=task.id or str(uuid.uuid4()),
        type=type_,
        input=task.input,
        output=output,
        value=estimate_value(type_),
        duration_ms=int((time.monotonic() - started_at) * 1000),
    )
    log_task(result)
    return result.model_dump()
