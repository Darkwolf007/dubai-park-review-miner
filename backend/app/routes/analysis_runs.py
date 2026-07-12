from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.analysis_service import insert_metrics, run_lifecycle
from app.services.storage_service import download_file
from app.supabase_client import supabase

router = APIRouter(prefix="/analysis-runs", tags=["analysis-runs"])


class ExecuteDemoResponse(BaseModel):
    run_id: str
    status: str
    metrics_written: int


@router.post("/{run_id}/execute-demo", response_model=ExecuteDemoResponse)
def execute_demo(run_id: str):
    """Minimal real example wiring storage_service + analysis_service together end to end:
    downloads the run's current dataset file, computes a trivial metric from it, writes the
    metric, and marks the run completed. Step 19 replaces the 'trivial metric' step with real
    GIS/NLP processing -- this proves the plumbing around it works first.
    """
    # Not .maybe_single() -- this supabase-py version returns a bare None (no .data attribute)
    # instead of an empty response when zero rows match, which crashes rather than 404s.
    run_rows = supabase.table("analysis_runs").select("*").eq("id", run_id).execute().data
    run = run_rows[0] if run_rows else None
    if run is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    if not run["input_dataset_ids"]:
        raise HTTPException(status_code=400, detail="This run has no input_dataset_ids to process")

    dataset_id = run["input_dataset_ids"][0]
    dataset = supabase.table("datasets").select("*").eq("id", dataset_id).single().execute().data
    if not dataset["storage_path"]:
        raise HTTPException(status_code=400, detail="Dataset has no current version uploaded yet")

    metrics_written = 0
    try:
        with run_lifecycle(run_id):
            content = download_file("raw-datasets", dataset["storage_path"])
            rows = insert_metrics(run_id, [{
                "spatial_unit_type": "project",
                "spatial_unit_id": run["project_id"],
                "metric_name": "input_file_size_bytes",
                "metric_value": len(content),
                "unit": "bytes",
            }])
            metrics_written = len(rows)
    except Exception as exc:
        # run_lifecycle already recorded status='failed' + error_message in the DB --
        # this only decides what the HTTP caller sees instead of a raw 500.
        raise HTTPException(status_code=409, detail=f"Analysis run failed: {exc}") from exc

    final = supabase.table("analysis_runs").select("status").eq("id", run_id).single().execute().data
    return ExecuteDemoResponse(run_id=run_id, status=final["status"], metrics_written=metrics_written)
