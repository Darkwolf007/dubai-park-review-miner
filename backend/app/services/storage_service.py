"""Storage read/write helpers used by every analysis service. Runs with the service_role
client, so these bypass Row Level Security entirely -- callers are trusted backend code,
not end users, so no ownership check happens here (that already happened in Storage's own
RLS policies when the frontend uploaded the raw file in the first place).
"""
from app.supabase_client import supabase


def download_file(bucket: str, path: str) -> bytes:
    """Fetches a file's raw bytes from Storage. Raises if the bucket/path doesn't exist."""
    return supabase.storage.from_(bucket).download(path)


def upload_file(bucket: str, path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
    """Uploads bytes to Storage, overwriting any existing file at the same path. Returns the path."""
    supabase.storage.from_(bucket).upload(
        path, content, {"content-type": content_type, "upsert": "true"}
    )
    return path


def build_processed_path(project_id: str, dataset_id: str, version_number: int, filename: str) -> str:
    """Mirrors the frontend's raw-datasets convention ({project_id}/raw/{dataset_id}/{filename})
    so processed-datasets stays organized the same way, even though service_role writes here
    aren't subject to the path-based RLS check that raw uploads are."""
    return f"{project_id}/processed/{dataset_id}/v{version_number}/{filename}"
