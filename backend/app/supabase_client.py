"""Single service_role Supabase client shared by every backend service module.

Never send this client's credentials to the frontend -- it bypasses Row Level Security
entirely, which is exactly why the backend (not the browser) owns it.
"""
from supabase import Client, create_client

from app.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
