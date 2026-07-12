"""Analysis run lifecycle + metrics writing. Every analysis engine (population, urban,
accessibility, ...) should go through update_run_status()/run_lifecycle() and
insert_metrics() -- never touch analysis_runs/analysis_metrics directly, so status
transitions and error handling stay consistent across every engine.
"""
from contextlib import contextmanager
from typing import Any, Iterable, Literal

from app.supabase_client import supabase

SpatialUnitType = Literal["h3_cell", "project", "park"]


def update_run_status(
    run_id: str,
    status: Literal["running", "completed", "failed"],
    *,
    error_message: str | None = None,
    result_summary: dict[str, Any] | None = None,
) -> dict:
    """started_at/completed_at are stamped automatically by an existing DB trigger when
    status transitions to 'running'/'completed' -- this function only ever needs to send status."""
    payload: dict[str, Any] = {"status": status}
    if error_message is not None:
        payload["error_message"] = error_message
    if result_summary is not None:
        payload["result_summary"] = result_summary
    return supabase.table("analysis_runs").update(payload).eq("id", run_id).execute().data[0]


def insert_metrics(analysis_run_id: str, metrics: Iterable[dict[str, Any]]) -> list[dict]:
    """Each metric dict looks like:
    {"spatial_unit_type": "h3_cell", "spatial_unit_id": <uuid>, "metric_name": "population",
     "metric_value": 123, "unit": "people", "metadata": {...}}
    project_id is filled automatically by an existing trigger from analysis_run_id -- do not set it here.
    """
    rows = [{**m, "analysis_run_id": analysis_run_id} for m in metrics]
    if not rows:
        return []
    return supabase.table("analysis_metrics").insert(rows).execute().data


@contextmanager
def run_lifecycle(run_id: str):
    """Marks the run 'running' on entry, 'completed' on success, 'failed' with the
    exception message on any error, then re-raises. Use as:

        with run_lifecycle(run["id"]):
            metrics = compute_population_metrics(...)
            insert_metrics(run["id"], metrics)
    """
    update_run_status(run_id, "running")
    try:
        yield
    except Exception as exc:
        update_run_status(run_id, "failed", error_message=str(exc))
        raise
    else:
        update_run_status(run_id, "completed")
