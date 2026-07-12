# Migration history — how complete this folder actually is

Every table, function, trigger, and RLS policy in this project was created by pasting SQL
directly into the Supabase SQL Editor across a long guided session — nothing was run through
`supabase migration` tooling, so no local file ever captured Steps 1–16 (extensions, `parks`,
`projects`, `datasets`, `dataset_versions`, `analysis_runs`, `h3_cells`, `analysis_metrics`,
`reviews`, `review_topics`, `design_requirements`, `network_assets`, `profiles`, `app_settings`,
and the full Step 16 RLS pass).

**The files in this folder only cover Steps 20 onward** (`generated_outputs`, three rounds of
Storage RLS fixes, Realtime publication grants, `analysis_run_inputs` lineage, Grasshopper export
policies, and the cascading-hard-delete fix) — the exact SQL that was actually run, copied
verbatim from the session that ran it. They are accurate, not reconstructed.

## To fill the gap: pull the real, authoritative schema

Don't hand-reconstruct Steps 1–16 from memory — pull the actual live schema instead, so what's
on disk is guaranteed to match what's really in the database:

```bash
npx supabase login
npx supabase link --project-ref cobxcwopsxvtgampqwym
npx supabase db pull
```

`db pull` writes one migration file containing your database's real, current schema (tables,
functions, triggers, RLS policies, everything) and reconciles it with the migrations already in
this folder. Run it once to backfill history, then treat the SQL Editor as retired — from that
point on, write new schema changes as migration files and run `supabase db push` (or apply via
CI) instead of pasting into the Editor, so this folder never falls behind the real database again.

`supabase login` opens a browser for interactive auth — it can't be scripted, so this has to be
run by a human, not an agent.
