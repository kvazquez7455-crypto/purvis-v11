"""
FastAPI shim for Emergent runtime.

The real PURVIS SOVEREIGN CORE backend is the Node.js + Express app under
/app/purvis-sovereign. That folder is the GitHub-portable deliverable.

In this Emergent container, supervisor only knows how to launch uvicorn,
so this Python module:
  1) spawns the Node Express server as a child process on PURVIS_NODE_PORT (8002)
  2) reverse-proxies every /api/* request to it

Production / free-platform deploys do NOT need this file — they run
`node backend/server.js` directly.
"""

import asyncio
import os
import signal
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

PURVIS_DIR = Path("/app/purvis-sovereign")
NODE_PORT = int(os.environ.get("PURVIS_NODE_PORT", "8002"))
NODE_TARGET = f"http://127.0.0.1:{NODE_PORT}"

_node_process: subprocess.Popen | None = None
_http: httpx.AsyncClient | None = None


async def _wait_for_node(timeout_s: float = 15.0) -> bool:
    """Poll the Node /api/health endpoint until it answers or we give up."""
    deadline = asyncio.get_event_loop().time() + timeout_s
    async with httpx.AsyncClient(timeout=1.5) as probe:
        while asyncio.get_event_loop().time() < deadline:
            try:
                r = await probe.get(f"{NODE_TARGET}/api/health")
                if r.status_code == 200:
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.3)
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _node_process, _http
    env = os.environ.copy()
    env["PORT"] = str(NODE_PORT)
    _node_process = subprocess.Popen(
        ["node", "backend/server.js"],
        cwd=str(PURVIS_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        preexec_fn=os.setsid,
    )
    await _wait_for_node()
    _http = httpx.AsyncClient(base_url=NODE_TARGET, timeout=60.0)
    try:
        yield
    finally:
        if _http is not None:
            await _http.aclose()
        if _node_process is not None and _node_process.poll() is None:
            try:
                os.killpg(os.getpgid(_node_process.pid), signal.SIGTERM)
            except ProcessLookupError:
                pass


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# Guaranteed entrypoint for the deployment system to detect the app.
# Note: in this Emergent container the public URL routes "/" → frontend (port 3000),
# so this root route is only directly reachable on the internal port 8001.
# The deployment system probes it before traffic-routing kicks in.
@app.get("/")
def root():
    return {"status": "running"}


@app.get("/healthz")
async def healthz():
    return {"ok": True, "proxy": "fastapi", "target": NODE_TARGET}


# Reverse-proxy every /api/* request to the Node Express server.
@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy(path: str, request: Request):
    assert _http is not None
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }
    try:
        upstream = await _http.request(
            request.method,
            f"/api/{path}",
            content=body,
            headers=headers,
            params=request.query_params,
        )
    except httpx.ConnectError:
        return Response(
            content=b'{"ok":false,"error":"PURVIS Node backend not reachable"}',
            status_code=502,
            media_type="application/json",
        )

    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in ("content-encoding", "transfer-encoding", "content-length", "connection")
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
