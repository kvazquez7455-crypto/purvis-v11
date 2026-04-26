"""
Purvis Core Expansion — Runtime Configuration
Toggle-driven so the host can disable subsystems without code changes.
"""
from __future__ import annotations
import os
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Dict, Any


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _num(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass
class PurvisConfig:
    enable_logging: bool = _flag("PURVIS_ENABLE_LOGGING", True)
    enable_code_runner: bool = _flag("PURVIS_ENABLE_CODE_RUNNER", True)
    enable_connectors: bool = _flag("PURVIS_ENABLE_CONNECTORS", True)
    log_file: str = os.environ.get(
        "PURVIS_LOG_FILE", str(Path("/app/memory/task_logs.json"))
    )
    log_limit: int = _num("PURVIS_LOG_LIMIT", 1000)
    default_code_timeout_ms: int = _num("PURVIS_CODE_TIMEOUT_MS", 1000)


config = PurvisConfig()


def update_config(**patch: Any) -> Dict[str, Any]:
    for k, v in patch.items():
        if hasattr(config, k):
            setattr(config, k, v)
    return asdict(config)
