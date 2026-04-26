"""
Purvis Core Expansion — Connector Bridge
Routes tool/connector requests to APIs, internal functions, or mock connectors.
Hosts can register additional connectors at runtime via register_connector().
"""
from __future__ import annotations
from typing import Callable, Any, Dict, List, Awaitable, Union
import asyncio
import urllib.request
import urllib.error
import json
import datetime as _dt

from .config import config
from .types import ConnectorRequest, ConnectorResponse


ConnectorHandler = Callable[[Dict[str, Any]], Union[Any, Awaitable[Any]]]

_registry: Dict[str, ConnectorHandler] = {}


def register_connector(type_: str, handler: ConnectorHandler) -> None:
    _registry[type_.lower()] = handler


def list_connectors() -> List[str]:
    return list(_registry.keys())


# ---------- Built-in connectors ----------

def _echo(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"echoed": payload}


def _math(payload: Dict[str, Any]) -> Dict[str, Any]:
    op = str(payload.get("op", "add"))
    a = float(payload.get("a", 0))
    b = float(payload.get("b", 0))
    if op == "add":
        return {"result": a + b}
    if op == "sub":
        return {"result": a - b}
    if op == "mul":
        return {"result": a * b}
    if op == "div":
        return {"result": None if b == 0 else a / b}
    raise ValueError(f"Unknown math op: {op}")


def _mock(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "message": "mock connector ok",
        "payload": payload,
        "at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
    }


def _http(payload: Dict[str, Any]) -> Dict[str, Any]:
    url = str(payload.get("url", ""))
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("connector.http: url must start with http:// or https://")
    method = str(payload.get("method", "GET")).upper()
    headers = payload.get("headers") or {}
    body = payload.get("body")
    if body is not None and not isinstance(body, (bytes, str)):
        body = json.dumps(body).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    elif isinstance(body, str):
        body = body.encode("utf-8")
    timeout = float(payload.get("timeoutMs", 5000)) / 1000.0
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ct = resp.headers.get("content-type", "")
            data: Any
            if "application/json" in ct:
                try:
                    data = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    data = raw.decode("utf-8", errors="replace")
            else:
                data = raw.decode("utf-8", errors="replace")
            return {"status": resp.status, "ok": 200 <= resp.status < 400, "data": data}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "ok": False, "data": e.reason}


register_connector("echo", _echo)
register_connector("math", _math)
register_connector("mock", _mock)
register_connector("web", _http)
register_connector("http", _http)


# ---------- Public entry ----------

async def execute_connector(req: ConnectorRequest) -> ConnectorResponse:
    if not config.enable_connectors:
        return ConnectorResponse(ok=False, type=req.type, error="connectors disabled")
    handler = _registry.get(req.type.lower())
    if not handler:
        return ConnectorResponse(
            ok=False, type=req.type, error=f"unknown connector: {req.type}"
        )
    try:
        result = handler(req.payload or {})
        if asyncio.iscoroutine(result):
            result = await result
        return ConnectorResponse(ok=True, type=req.type, data=result)
    except Exception as e:  # noqa: BLE001 — surface any handler error
        return ConnectorResponse(ok=False, type=req.type, error=str(e))
