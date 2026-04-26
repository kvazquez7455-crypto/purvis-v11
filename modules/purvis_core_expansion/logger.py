"""
Purvis Core Expansion — Task Logger
Captures every execution and persists to a JSON file on disk.
Storage shape: {"entries": [LogEntry, ...]}
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from threading import Lock

from .config import config
from .types import LogEntry, TaskResult


_lock = Lock()


def _ensure_file() -> None:
    p = Path(config.log_file)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.write_text(json.dumps({"entries": []}, indent=2))


def _read_store() -> Dict[str, Any]:
    _ensure_file()
    try:
        data = json.loads(Path(config.log_file).read_text() or "{}")
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            return {"entries": []}
        return data
    except (json.JSONDecodeError, OSError):
        return {"entries": []}


def _write_store(store: Dict[str, Any]) -> None:
    _ensure_file()
    if len(store["entries"]) > config.log_limit:
        store["entries"] = store["entries"][-config.log_limit:]
    Path(config.log_file).write_text(json.dumps(store, indent=2, default=str))


def log_task(result: TaskResult) -> LogEntry:
    """Persist a task result. Returns a LogEntry with persisted flag set."""
    entry = LogEntry(**result.model_dump(), persisted=False)
    if not config.enable_logging:
        return entry
    with _lock:
        store = _read_store()
        store["entries"].append(entry.model_dump())
        _write_store(store)
    entry.persisted = True
    return entry


def get_logs(limit: int = 50) -> List[Dict[str, Any]]:
    store = _read_store()
    entries = store["entries"][-limit:]
    return list(reversed(entries))


def get_log_by_id(log_id: str) -> Optional[Dict[str, Any]]:
    for e in _read_store()["entries"]:
        if e.get("id") == log_id:
            return e
    return None


def clear_logs() -> int:
    with _lock:
        store = _read_store()
        n = len(store["entries"])
        _write_store({"entries": []})
        return n


def log_stats() -> Dict[str, Any]:
    entries = _read_store()["entries"]
    total_value = 0
    by_type: Dict[str, Dict[str, int]] = {}
    for e in entries:
        v = int(e.get("value", 0) or 0)
        total_value += v
        k = str(e.get("type", "default"))
        if k not in by_type:
            by_type[k] = {"count": 0, "value": 0}
        by_type[k]["count"] += 1
        by_type[k]["value"] += v
    return {"count": len(entries), "totalValue": total_value, "byType": by_type}
