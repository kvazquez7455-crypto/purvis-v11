"""
Purvis Core Expansion — Type Definitions
Pydantic models shared across the module surface.
"""
from __future__ import annotations
from typing import Any, Optional, Dict, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid


TaskType = Literal["legal", "content", "automation", "code", "connector", "default"]


class TaskInput(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    input: Any = None
    meta: Optional[Dict[str, Any]] = None


class TaskResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "default"
    input: Any = None
    output: Any = None
    value: int = 10
    duration_ms: int = 0
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    error: Optional[str] = None


class LogEntry(TaskResult):
    persisted: bool = False


class ConnectorRequest(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class ConnectorResponse(BaseModel):
    ok: bool
    type: str
    data: Any = None
    error: Optional[str] = None


class CodeRunRequest(BaseModel):
    language: str = "python"
    code: str
    context: Optional[Dict[str, Any]] = None
    timeout_ms: Optional[int] = None


class CodeRunResult(BaseModel):
    ok: bool
    language: str
    output: Any = None
    logs: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    duration_ms: int = 0


class ExecutionEnvelope(BaseModel):
    result: TaskResult
    log: Optional[LogEntry] = None
