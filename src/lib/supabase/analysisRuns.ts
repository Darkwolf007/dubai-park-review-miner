import { useEffect, useState } from 'react';
import { supabase } from './client';
import type { AnalysisRun, AnalysisType } from './types';

export async function createAnalysisRun(projectId: string, analysisType: AnalysisType, inputDatasetIds: string[] = []): Promise<AnalysisRun> {
  const { data, error } = await supabase
    .from('analysis_runs')
    .insert({ project_id: projectId, analysis_type: analysisType, input_dataset_ids: inputDatasetIds })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAnalysisRun(runId: string): Promise<AnalysisRun | null> {
  const { data, error } = await supabase.from('analysis_runs').select('*').eq('id', runId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchAnalysisRuns(projectId: string): Promise<AnalysisRun[]> {
  const { data, error } = await supabase
    .from('analysis_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Subscribes to live UPDATE events for a single analysis run (status/started_at/completed_at/
 * error_message/result_summary changes -- exactly what the FastAPI worker writes as it processes).
 * Returns an unsubscribe function.
 */
export function subscribeToAnalysisRun(runId: string, onUpdate: (run: AnalysisRun) => void): () => void {
  const channel = supabase
    .channel(`analysis_run:${runId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'analysis_runs', filter: `id=eq.${runId}` },
      (payload) => onUpdate(payload.new as AnalysisRun)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Live hook: fetches the current row once, then stays in sync via subscribeToAnalysisRun. */
export function useAnalysisRun(runId: string | null): { run: AnalysisRun | null; loading: boolean } {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchAnalysisRun(runId).then((initial) => {
      if (!cancelled) {
        setRun(initial);
        setLoading(false);
      }
    });

    const unsubscribe = subscribeToAnalysisRun(runId, (updated) => {
      if (!cancelled) setRun(updated);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runId]);

  return { run, loading };
}
