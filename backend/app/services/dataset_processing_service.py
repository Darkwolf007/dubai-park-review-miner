"""Validates and processes a freshly uploaded raw dataset: parses/validates the file,
computes real metadata (feature count, bbox), and publishes the result as a new current
dataset_versions row. Runs entirely off datasets.processing_status as its state machine --
no analysis_runs row involved, since this is ingestion, not one of the 8 analysis engines
(population/urban/accessibility/environmental/community/nlp_spatial/space_syntax/ai_design).
"""
import json
from typing import Any

from app.services.storage_service import build_processed_path, download_file, upload_file
from app.supabase_client import supabase


class DatasetValidationError(Exception):
    pass


def _extract_coordinates(geom: dict[str, Any], out: list[tuple[float, float]]) -> None:
    coords = geom.get("coordinates")
    if coords is None:
        return
    stack = [coords]
    while stack:
        item = stack.pop()
        if not isinstance(item, list) or not item:
            continue
        if all(isinstance(v, (int, float)) for v in item[:2]) and len(item) in (2, 3):
            out.append((item[0], item[1]))
        else:
            stack.extend(item)


def _bbox_to_polygon(bbox: list[float]) -> dict[str, Any]:
    """bbox column is a PostGIS geometry, not a plain array -- must send a GeoJSON geometry."""
    min_lng, min_lat, max_lng, max_lat = bbox
    return {
        "type": "Polygon",
        "coordinates": [[
            [min_lng, min_lat], [max_lng, min_lat], [max_lng, max_lat], [min_lng, max_lat], [min_lng, min_lat],
        ]],
    }


def _validate_and_summarize_geojson(raw: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise DatasetValidationError(f"Not valid JSON: {exc}") from exc

    geojson_type = parsed.get("type") if isinstance(parsed, dict) else None
    if geojson_type == "FeatureCollection":
        features = parsed.get("features")
        if not isinstance(features, list):
            raise DatasetValidationError("FeatureCollection missing a 'features' array")
    elif geojson_type == "Feature":
        features = [parsed]
    else:
        raise DatasetValidationError(f"Unsupported GeoJSON type: {geojson_type!r} (expected Feature or FeatureCollection)")

    coords: list[tuple[float, float]] = []
    for feature in features:
        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        if geometry:
            _extract_coordinates(geometry, coords)

    bbox = None
    if coords:
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        bbox = [min(lngs), min(lats), max(lngs), max(lats)]

    return {"feature_count": len(features), "bbox": bbox, "parsed": parsed}


def process_dataset(dataset_id: str) -> dict[str, Any]:
    """Runs the full validate -> process -> publish-new-version pipeline for one dataset.
    Always re-processes the original raw upload (dataset_versions version_number=1, which
    always lives in raw-datasets), never dataset.storage_path -- after the first processing
    run, that column points at the latest *processed* output (possibly in a different bucket),
    not the raw source. This is what lets process_dataset() be safely called more than once,
    e.g. after improving the processing logic, without re-uploading anything.
    Raises DatasetValidationError on bad input (caller decides the HTTP status for that)."""
    dataset_rows = supabase.table("datasets").select("*").eq("id", dataset_id).execute().data
    if not dataset_rows:
        raise DatasetValidationError("Dataset not found")
    dataset = dataset_rows[0]

    raw_version_rows = (
        supabase.table("dataset_versions")
        .select("storage_path")
        .eq("dataset_id", dataset_id)
        .eq("version_number", 1)
        .execute()
        .data
    )
    if not raw_version_rows:
        raise DatasetValidationError("Dataset has no uploaded file yet")
    raw_storage_path = raw_version_rows[0]["storage_path"]

    supabase.table("datasets").update({"processing_status": "validating"}).eq("id", dataset_id).execute()

    try:
        raw = download_file("raw-datasets", raw_storage_path)
        summary = _validate_and_summarize_geojson(raw)
    except DatasetValidationError as exc:
        existing_metadata = dataset.get("metadata") or {}
        supabase.table("datasets").update({
            "processing_status": "failed",
            "metadata": {**existing_metadata, "processing_error": str(exc)},
        }).eq("id", dataset_id).execute()
        raise

    supabase.table("datasets").update({"processing_status": "processing"}).eq("id", dataset_id).execute()

    processed_bytes = json.dumps(summary["parsed"]).encode("utf-8")
    version_rows = (
        supabase.table("dataset_versions")
        .select("id, version_number")
        .eq("dataset_id", dataset_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
        .data
    )
    previous_version = version_rows[0] if version_rows else None
    next_version = (previous_version["version_number"] + 1) if previous_version else 1

    processed_path = build_processed_path(dataset["project_id"], dataset_id, next_version, "validated.geojson")
    upload_file("processed-datasets", processed_path, processed_bytes, "application/geo+json")

    version = supabase.table("dataset_versions").insert({
        "dataset_id": dataset_id,
        "version_number": next_version,
        "parent_version_id": previous_version["id"] if previous_version else None,
        "storage_path": processed_path,
        "processing_method": "geojson_validate_and_summarize",
        "file_size_bytes": len(processed_bytes),
        "is_current": True,
    }).execute().data[0]

    # The is_current trigger (Step 6) already flipped processing_status -> 'processed' and
    # synced storage_path onto the dataset row -- this call only adds the real computed
    # feature_count/bbox, which nothing else sets.
    existing_metadata = dataset.get("metadata") or {}
    existing_metadata.pop("processing_error", None)
    update_payload: dict[str, Any] = {
        "metadata": {**existing_metadata, "feature_count": summary["feature_count"]},
    }
    if summary["bbox"]:
        update_payload["bbox"] = _bbox_to_polygon(summary["bbox"])
    supabase.table("datasets").update(update_payload).eq("id", dataset_id).execute()

    return {
        "dataset_id": dataset_id,
        "version_id": version["id"],
        "version_number": next_version,
        "feature_count": summary["feature_count"],
        "bbox": summary["bbox"],
    }
