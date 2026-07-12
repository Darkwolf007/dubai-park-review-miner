import { supabase } from './client';
import type { GeneratedOutput } from './types';

export async function fetchGeneratedOutputs(analysisRunId: string): Promise<GeneratedOutput[]> {
  const { data, error } = await supabase
    .from('generated_outputs')
    .select('*')
    .eq('analysis_run_id', analysisRunId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function downloadGeneratedOutput(output: GeneratedOutput): Promise<Blob> {
  const { data, error } = await supabase.storage.from(output.storage_bucket).download(output.storage_path);
  if (error) throw error;
  return data;
}
