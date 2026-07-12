from app.supabase_client import supabase

park = supabase.table("parks").select("id").eq("slug", "al-safa-2-park").single().execute().data
project = supabase.table("projects").insert({"park_id": park["id"], "name": "status-probe"}).execute().data[0]
dataset = supabase.table("datasets").insert({"project_id": project["id"], "name": "x", "dataset_type": "vector"}).execute().data[0]

for candidate in ["uploaded", "processing", "processed", "failed", "validating", "error", "queued", "ready"]:
    try:
        supabase.table("datasets").update({"processing_status": candidate}).eq("id", dataset["id"]).execute()
        print(candidate, "-> OK")
    except Exception as e:
        print(candidate, "->", str(e)[:120])

supabase.table("datasets").delete().eq("id", dataset["id"]).execute()
supabase.table("projects").delete().eq("id", project["id"]).execute()
print("cleanup done")
