from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.dataset_processing_service import DatasetValidationError, process_dataset

router = APIRouter(prefix="/datasets", tags=["datasets"])


class ProcessDatasetResponse(BaseModel):
    dataset_id: str
    version_id: str
    version_number: int
    feature_count: int
    bbox: list[float] | None


@router.post("/{dataset_id}/process", response_model=ProcessDatasetResponse)
def process(dataset_id: str):
    try:
        result = process_dataset(dataset_id)
    except DatasetValidationError as exc:
        # The dataset row itself already recorded processing_status='failed' + the error in
        # metadata -- this is just what the HTTP caller sees.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ProcessDatasetResponse(**result)
