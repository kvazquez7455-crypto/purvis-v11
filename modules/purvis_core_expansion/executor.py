"""
Purvis Core Expansion — Execution Controller

Pipeline position:
  router → decision → task → toolExecutor → [executor.py] → memory(logger)
"""
from __future__ import annotations
import ast
import re
import time
import uuid
from typing import Any, Dict, Optional

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
    "calculation": 30,
    "default": 10,
}


def estimate_value(type_: str | None) -> int:
    return VALUE_TABLE.get((type_ or "default").lower(), VALUE_TABLE["default"])


# ---------- Type inference ----------

_LEGAL_RE = re.compile(r"\b(contract|nda|legal|clause|liability)\b", re.IGNORECASE)
_AUTO_RE = re.compile(r"\b(automate|workflow|schedule|cron|pipeline)\b", re.IGNORECASE)
_CONTENT_RE = re.compile(r"\b(write|article|blog|post|caption|copy|draft|create|compose|generate)\b", re.IGNORECASE)
_CALC_KW_RE = re.compile(r"\b(calculate|compute|evaluate|sum|product|how much is|what is)\b", re.IGNORECASE)
_NUM_EXPR_RE = re.compile(
    r"[-+]?\d+(?:\.\d+)?(?:\s*[+\-*/^]\s*[-+]?\d+(?:\.\d+)?)+"
)


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
        # calculation must be checked before content so that
        # "calculate the sum 2+3" is not classified as content
        if _CALC_KW_RE.search(payload) or _NUM_EXPR_RE.search(payload):
            return "calculation"
        if _CONTENT_RE.search(payload):
            return "content"
    return "default"


# ---------- Real task classifier + handler ----------
#
# Replaces the previous "default_handle" stub with a small classifier:
#
#   1. write / draft / create  → simulated structured AI text response
#   2. calculate / arithmetic  → real computed result via safe AST eval
#   3. otherwise               → structured fallback
#
# The classifier runs over the *input* text; the *type* is set upstream by
# infer_type() and drives the value engine.

_WRITE_RE = re.compile(r"\b(write|draft|create|compose|generate)\b", re.IGNORECASE)


def _safe_eval_arithmetic(expr: str) -> Optional[float]:
    """Evaluate a numeric arithmetic expression safely via ast (no names, no calls)."""
    expr = expr.replace("^", "**")  # accept "2^3" as power
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return None
    allowed = (
        ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow,
        ast.FloorDiv, ast.USub, ast.UAdd,
    )
    for node in ast.walk(tree):
        if not isinstance(node, allowed):
            return None
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            return None
    try:
        result = eval(  # noqa: S307 — restricted by AST allow-list above
            compile(tree, "<purvis-calc>", "eval"),
            {"__builtins__": {}},
            {},
        )
    except (ZeroDivisionError, OverflowError, ValueError):
        return None
    return result if isinstance(result, (int, float)) else None


def _strip_lead(text: str) -> str:
    """Drop a leading verb + article so 'Write an article on X' → 'X'."""
    t = _WRITE_RE.sub("", text, count=1).strip()
    t = re.sub(r"^(a|an|the|about|on|some)\s+", "", t, flags=re.IGNORECASE).strip()
    return t.rstrip(".!? ")


def _handle_write(type_: str, text: str) -> Dict[str, Any]:
    topic = _strip_lead(text) or "the requested topic"
    title = topic[:80].strip().title() or "Untitled Draft"
    body = (
        f"Draft on '{topic}'.\n\n"
        f"Opening — frame why {topic} matters now.\n"
        f"Point 1 — the core insight, with a concrete example.\n"
        f"Point 2 — the most common misconception, addressed directly.\n"
        f"Point 3 — what the reader should do next.\n\n"
        f"Closing — a clear call-to-action that ties back to the opening."
    )
    return {
        "intent": "write",
        "type": type_,
        "topic": topic,
        "title": title,
        "body": body,
        "wordCount": len(body.split()),
        "stub": True,
        "note": "Deterministic structured stub. Host can swap with a real LLM call.",
    }


def _handle_calculate(type_: str, text: str) -> Dict[str, Any]:
    expr_match = _NUM_EXPR_RE.search(text)
    expr = expr_match.group(0).strip() if expr_match else None

    if expr:
        value = _safe_eval_arithmetic(expr)
        return {
            "intent": "calculate",
            "type": type_,
            "expression": expr,
            "result": value,
            "ok": value is not None,
        }

    # No clean expression — extract bare numbers and report back
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", text)]
    return {
        "intent": "calculate",
        "type": type_,
        "expression": None,
        "result": sum(nums) if nums else None,
        "numbers": nums,
        "ok": bool(nums),
        "note": "no arithmetic expression found; returning sum of detected numbers"
                if nums else "no numbers detected in input",
    }


def _handle_fallback(type_: str, payload: Any) -> Dict[str, Any]:
    if isinstance(payload, str):
        return {
            "intent": "fallback",
            "type": type_,
            "summary": f"received text task ({len(payload)} chars)",
            "echo": payload[:200],
            "note": "no specific intent matched; structured fallback returned.",
        }
    return {
        "intent": "fallback",
        "type": type_,
        "summary": "received structured task",
        "data": payload,
        "note": "non-text payload; structured fallback returned.",
    }


def default_handle(type_: str, input_: Any) -> Dict[str, Any]:
    text = str(input_).lower()

    # --- CONTENT ---
    if any(word in text for word in ["write", "draft", "create"]):
        return {
            "handled": True,
            "type": "content",
            "summary": "generated content",
            "result": f"Generated content for: {input_}"
        }

    # --- SIMPLE CALCULATION ---
    numbers = re.findall(r'\d+', text)
    if "calculate" in text and len(numbers) >= 2:
        total = sum(map(int, numbers))
        return {
            "handled": True,
            "type": "calculation",
            "summary": "calculation complete",
            "result": f"Total = {total}"
        }

    # --- FALLBACK ---
    return {
        "handled": True,
        "type": "default",
        "summary": f"received task ({len(str(input_))} chars)",
        "result": f"Processed: {input_}"
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
