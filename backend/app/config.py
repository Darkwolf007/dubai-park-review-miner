"""Loads backend settings from the repo-root .env -- the same file the frontend reads,
so there is exactly one place to manage Supabase credentials for this project."""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY -- set both in the repo-root .env "
        "(see .env.example). The service_role key is required here: it bypasses Row Level "
        "Security, which is what lets this backend read/write data on behalf of every project "
        "regardless of owner_id."
    )
