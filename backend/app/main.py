from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.routes.analysis_runs import router as analysis_runs_router
from app.routes.datasets import router as datasets_router
from app.supabase_client import supabase

app = FastAPI(title="Dubai Park Review Miner -- GIS/NLP Worker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_runs_router)
app.include_router(datasets_router)


@app.get("/health")
def health():
    """Proves the service_role Supabase connection actually works, not just that env vars parsed."""
    try:
        result = supabase.table("parks").select("id", count="exact").execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Supabase connection failed: {exc}") from exc

    return {"status": "ok", "parks_count": result.count}
