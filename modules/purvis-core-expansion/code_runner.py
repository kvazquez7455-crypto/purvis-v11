"""
Purvis Core Expansion — Code Builder + Runner
Safe, sandboxed execution of Python and HTML snippets.

Hard isolation rules:
  - AST whitelist: rejects Import, ImportFrom, attribute access starting with "_",
    Global, Nonlocal, exec/eval/compile/__import__, file ops, dunder access.
  - exec in a restricted namespace with a minimal __builtins__ allow-list.
  - Hard wall-clock timeout in a worker thread.
  - HTML is sanitised: <script>, on*= handlers, iframe/object/embed, javascript: removed.
"""
from __future__ import annotations
import ast
import builtins
import io
import re
import time
import contextlib
import threading
from typing import Any, Dict

from .config import config
from .types import CodeRunRequest, CodeRunResult


# ---------- HTML sanitiser ----------

_RE_SCRIPT = re.compile(r"<script\b[^>]*>[\s\S]*?</script\s*>", re.IGNORECASE)
_RE_JS_URL = re.compile(r"javascript:", re.IGNORECASE)
_RE_ON_DBL = re.compile(r"""\son[a-z]+\s*=\s*"(?:[^"\\]|\\.)*\"""", re.IGNORECASE)
_RE_ON_SGL = re.compile(r"\son[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'", re.IGNORECASE)
_RE_ON_NQ = re.compile(r"\son[a-z]+\s*=\s*[^\s>]+", re.IGNORECASE)
_RE_BAD_TAGS = re.compile(r"</?(iframe|object|embed)\b[^>]*>", re.IGNORECASE)


def sanitize_html(html: str) -> str:
    out = _RE_SCRIPT.sub("", html)
    out = _RE_JS_URL.sub("blocked:", out)
    out = _RE_ON_DBL.sub("", out)
    out = _RE_ON_SGL.sub("", out)
    out = _RE_ON_NQ.sub("", out)
    out = _RE_BAD_TAGS.sub("", out)
    return out


# ---------- Python sandbox ----------

_FORBIDDEN_NAMES = {
    "exec", "eval", "compile", "__import__", "open", "input",
    "globals", "locals", "vars", "breakpoint", "help",
    "memoryview", "delattr", "setattr", "getattr", "hasattr",
}

_SAFE_BUILTINS: Dict[str, Any] = {
    name: getattr(builtins, name)
    for name in (
        "abs", "all", "any", "bin", "bool", "bytes", "chr", "dict", "divmod",
        "enumerate", "filter", "float", "format", "frozenset", "hash", "hex",
        "int", "isinstance", "issubclass", "iter", "len", "list", "map", "max",
        "min", "next", "oct", "ord", "pow", "print", "range", "repr", "reversed",
        "round", "set", "slice", "sorted", "str", "sum", "tuple", "type", "zip",
        "True", "False", "None",
    )
    if hasattr(builtins, name)
}
_SAFE_BUILTINS["True"] = True
_SAFE_BUILTINS["False"] = False
_SAFE_BUILTINS["None"] = None


class _SandboxValidator(ast.NodeVisitor):
    """Reject dangerous AST nodes before execution."""

    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        raise ValueError("imports are not allowed in sandbox")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        raise ValueError("imports are not allowed in sandbox")

    def visit_Global(self, node: ast.Global) -> None:  # noqa: N802
        raise ValueError("'global' is not allowed in sandbox")

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:  # noqa: N802
        raise ValueError("'nonlocal' is not allowed in sandbox")

    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        if node.attr.startswith("_"):
            raise ValueError(f"access to dunder/private attribute '{node.attr}' is blocked")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:  # noqa: N802
        if node.id in _FORBIDDEN_NAMES:
            raise ValueError(f"name '{node.id}' is not allowed in sandbox")
        if node.id.startswith("__") and node.id.endswith("__"):
            raise ValueError(f"dunder name '{node.id}' is not allowed in sandbox")
        self.generic_visit(node)


def _validate_python(source: str) -> ast.Module:
    tree = ast.parse(source, mode="exec")
    _SandboxValidator().visit(tree)
    return tree


def _run_python(source: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Execute pre-validated source. Returns {'output', 'logs'}."""
    tree = _validate_python(source)
    namespace: Dict[str, Any] = {
        "__builtins__": _SAFE_BUILTINS,
        "ctx": ctx or {},
        "result": None,
    }
    buf = io.StringIO()
    code = compile(tree, filename="<purvis-sandbox>", mode="exec")
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        exec(code, namespace, namespace)  # noqa: S102
    logs = [line for line in buf.getvalue().splitlines() if line]
    output = namespace.get("result")
    return {"output": output, "logs": logs}


def _run_with_timeout(target, timeout_s: float) -> Dict[str, Any]:
    """Run a callable in a worker thread with a wall-clock timeout."""
    holder: Dict[str, Any] = {}

    def runner() -> None:
        try:
            holder["result"] = target()
        except Exception as e:  # noqa: BLE001
            holder["error"] = str(e)

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    t.join(timeout=timeout_s)
    if t.is_alive():
        # Thread cannot be force-killed in pure Python; we abandon it (daemon)
        # and report timeout. The sandbox prevents any meaningful side effects.
        return {"error": f"execution timeout (>{int(timeout_s * 1000)}ms)"}
    return holder


# ---------- Public entry ----------

def run_code(req: CodeRunRequest) -> CodeRunResult:
    start = time.monotonic()
    language = (req.language or "python").lower()
    logs: list[str] = []

    if not config.enable_code_runner:
        return CodeRunResult(
            ok=False,
            language=language,
            error="code runner disabled",
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    code = (req.code or "").strip()
    if not code:
        return CodeRunResult(
            ok=False,
            language=language,
            error="empty code",
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    # HTML branch
    if language == "html":
        return CodeRunResult(
            ok=True,
            language="html",
            output=sanitize_html(req.code),
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    # Python branch
    if language in ("py", "python"):
        timeout_ms = int(req.timeout_ms or config.default_code_timeout_ms)
        timeout_s = max(0.05, timeout_ms / 1000.0)

        outcome = _run_with_timeout(
            lambda: _run_python(req.code, req.context or {}), timeout_s
        )
        elapsed = int((time.monotonic() - start) * 1000)
        if "error" in outcome:
            return CodeRunResult(
                ok=False,
                language="python",
                error=outcome["error"],
                logs=logs,
                duration_ms=elapsed,
            )
        res = outcome.get("result", {})
        return CodeRunResult(
            ok=True,
            language="python",
            output=res.get("output"),
            logs=res.get("logs", []),
            duration_ms=elapsed,
        )

    return CodeRunResult(
        ok=False,
        language=language,
        error=f"unsupported language: {language}",
        duration_ms=int((time.monotonic() - start) * 1000),
    )
