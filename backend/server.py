from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Any, Optional, Dict
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Load the Purvis Core Expansion module from /app/modules/purvis-core-expansion
# (folder name has a hyphen, so we load it explicitly via importlib.util)
import importlib.util
_PURVIS_DIR = ROOT_DIR.parent / "modules" / "purvis-core-expansion"
_PURVIS_INIT = _PURVIS_DIR / "__init__.py"
_spec = importlib.util.spec_from_file_location(
    "purvis_core_expansion",
    _PURVIS_INIT,
    submodule_search_locations=[str(_PURVIS_DIR)],
)
purvis = importlib.util.module_from_spec(_spec)
sys.modules["purvis_core_expansion"] = purvis
_spec.loader.exec_module(purvis)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Include the router in the main app
app.include_router(api_router)


# ---------- Purvis Core Expansion routes (extension only; no rewrite) ----------

purvis_router = APIRouter(prefix="/api/purvis")


class PurvisRunBody(BaseModel):
    type: Optional[str] = None
    input: Any = None
    id: Optional[str] = None


class PurvisCodeBody(BaseModel):
    language: str = "python"
    code: str
    context: Optional[Dict[str, Any]] = None
    timeoutMs: Optional[int] = None  # camelCase from FE


class PurvisConnectorBody(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)


@purvis_router.get("/health")
async def purvis_health():
    return {
        "ok": True,
        "name": "purvis-core-expansion",
        "config": {
            "enableLogging": purvis.config.enable_logging,
            "enableCodeRunner": purvis.config.enable_code_runner,
            "enableConnectors": purvis.config.enable_connectors,
            "logFile": purvis.config.log_file,
        },
        "connectors": purvis.list_connectors(),
    }


@purvis_router.post("/run")
async def purvis_run(body: PurvisRunBody):
    envelope = await purvis.run_purvis_expansion(
        purvis.TaskInput(id=body.id, type=body.type, input=body.input)
    )
    return envelope.model_dump()


@purvis_router.post("/run-test")
async def purvis_run_test():
    """Built-in self-test: input → execution → logging → output (8 cases)."""
    return await purvis.self_test()


@purvis_router.post("/code")
async def purvis_code(body: PurvisCodeBody):
    r = purvis.run_code(
        purvis.CodeRunRequest(
            language=body.language,
            code=body.code,
            context=body.context,
            timeout_ms=body.timeoutMs,
        )
    )
    return r.model_dump()


@purvis_router.post("/connector")
async def purvis_connector(body: PurvisConnectorBody):
    r = await purvis.execute_connector(
        purvis.ConnectorRequest(type=body.type, payload=body.payload)
    )
    return r.model_dump()


@purvis_router.get("/logs")
async def purvis_logs(limit: int = 50):
    return {"entries": purvis.get_logs(limit)}


@purvis_router.get("/logs/stats")
async def purvis_logs_stats():
    return purvis.log_stats()


@purvis_router.post("/logs/clear")
async def purvis_logs_clear():
    return {"cleared": purvis.clear_logs()}


app.include_router(purvis_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()