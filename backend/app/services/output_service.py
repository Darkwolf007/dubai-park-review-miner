"""Uploads an analysis output file and records it in generated_outputs in one call.
Every analysis engine (Step 21+) should produce its outputs through this, not by
writing to Storage and generated_outputs separately -- keeps the two impossible to
drift out of sync (a file with no DB row, or a DB row pointing at a missing file).
"""
from typing import Any

from app.services.storage_service import upload_file
from app.supabase_client import supabase

BUCKET_BY_TYPE = {
    "geojson": "analysis-outputs",
    "geopackage": "analysis-outputs",
    "csv": "analysis-outputs",
    "excel": "analysis-outputs",
    "geotiff": "analysis-outputs",
    "json": "analysis-outputs",
    "pdf": "reports",
    "png": "map-images",
}

CONTENT_TYPE_BY_TYPE = {
    "geojson": "application/geo+json",
    "geopackage": "application/geopackage+sqlite3",
    "csv": "text/csv",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "geotiff": "image/tiff",
    "json": "application/json",
    "pdf": "application/pdf",
    "png": "image/png",
}


def write_output(
    analysis_run_id: str,
    output_type: str,
    filename: str,
    content: bytes,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict:
    run_rows = supabase.table("analysis_runs").select("project_id").eq("id", analysis_run_id).execute().data
    if not run_rows:
        raise ValueError(f"analysis_run {analysis_run_id} not found")
    project_id = run_rows[0]["project_id"]

    bucket = BUCKET_BY_TYPE[output_type]
    content_type = CONTENT_TYPE_BY_TYPE[output_type]
    path = f"{project_id}/{analysis_run_id}/{output_type}/{filename}"

    upload_file(bucket, path, content, content_type)

    return supabase.table("generated_outputs").insert({
        "analysis_run_id": analysis_run_id,
        "output_type": output_type,
        "name": filename,
        "storage_bucket": bucket,
        "storage_path": path,
        "file_size_bytes": len(content),
        "metadata": metadata or {},
    }).execute().data[0]
