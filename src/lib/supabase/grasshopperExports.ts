import type { CommunityGrasshopperExport, GrasshopperExport, NlpGrasshopperExport } from '../gis/grasshopperExportEngine';
import { supabase } from './client';
import type { GeneratedOutput } from './types';

export type GrasshopperExportKind = 'environmental' | 'community' | 'nlp_spatial';
export type GrasshopperExportData = GrasshopperExport | CommunityGrasshopperExport | NlpGrasshopperExport;

export interface SaveGrasshopperExportResult {
  runId: string;
  output: GeneratedOutput;
}

/**
 * Persists an already-computed Grasshopper export (grasshopperExportEngine.ts runs entirely
 * client-side from already-loaded Playground state -- there's no backend job to track). Still
 * creates a real analysis_runs row and walks it through queued -> running -> completed so it
 * gets real trigger-populated timestamps and shows up in run history the same as a
 * backend-computed analysis, rather than a special-cased row that looks anomalous next to them.
 */
export async function saveGrasshopperExport(
  projectId: string,
  kind: GrasshopperExportKind,
  filename: string,
  exportData: GrasshopperExportData
): Promise<SaveGrasshopperExportResult> {
  const { data: run, error: runError } = await supabase
    .from('analysis_runs')
    .insert({ project_id: projectId, analysis_type: kind })
    .select()
    .single();
  if (runError) throw runError;

  await supabase.from('analysis_runs').update({ status: 'running' }).eq('id', run.id);

  try {
    const storagePath = `${projectId}/${run.id}/${filename}`;
    const content = JSON.stringify(exportData);
    const { error: uploadError } = await supabase.storage
      .from('grasshopper-exports')
      .upload(storagePath, new Blob([content], { type: 'application/json' }), { upsert: false });
    if (uploadError) throw uploadError;

    const { data: output, error: outputError } = await supabase
      .from('generated_outputs')
      .insert({
        analysis_run_id: run.id,
        output_type: 'json',
        name: filename,
        storage_bucket: 'grasshopper-exports',
        storage_path: storagePath,
        file_size_bytes: content.length,
        metadata: { export_kind: kind }
      })
      .select()
      .single();
    if (outputError) throw outputError;

    await supabase.from('analysis_runs').update({ status: 'completed' }).eq('id', run.id);
    return { runId: run.id, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('analysis_runs').update({ status: 'failed', error_message: message }).eq('id', run.id);
    throw err;
  }
}
