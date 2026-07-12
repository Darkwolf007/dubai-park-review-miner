import { useEffect, useState } from 'react';
import { supabase } from './client';
import type { Dataset, DatasetType, DatasetVersion } from './types';

export interface UploadDatasetInput {
  projectId: string;
  file: File;
  datasetType: DatasetType;
  name?: string;
  category?: string;
  source?: string;
}

export interface UploadDatasetResult {
  dataset: Dataset;
  version: DatasetVersion;
}

/**
 * Creates a dataset row, uploads the raw file under it, then records version 1 as current.
 * Rolls back the rows/file it already created if a later step fails, so a failed upload
 * never leaves an orphaned dataset with no file behind it.
 */
export async function uploadDataset(input: UploadDatasetInput): Promise<UploadDatasetResult> {
  const datasetName = input.name ?? input.file.name;
  const format = input.file.name.split('.').pop()?.toLowerCase() ?? null;

  const { data: dataset, error: datasetError } = await supabase
    .from('datasets')
    .insert({
      project_id: input.projectId,
      name: datasetName,
      dataset_type: input.datasetType,
      category: input.category ?? null,
      source: input.source ?? null,
      format
    })
    .select()
    .single();
  if (datasetError) throw datasetError;

  // {project_id}/raw/{dataset_id}/{filename} -- the leading project_id segment is what
  // the Storage RLS policy checks via user_owns_project((storage.foldername(name))[1]::uuid).
  const storagePath = `${input.projectId}/raw/${dataset.id}/${input.file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('raw-datasets')
    .upload(storagePath, input.file, { upsert: false });
  if (uploadError) {
    await supabase.from('datasets').delete().eq('id', dataset.id);
    throw uploadError;
  }

  const { data: version, error: versionError } = await supabase
    .from('dataset_versions')
    .insert({
      dataset_id: dataset.id,
      version_number: 1,
      storage_path: storagePath,
      file_size_bytes: input.file.size,
      is_current: true
    })
    .select()
    .single();
  if (versionError) {
    await supabase.storage.from('raw-datasets').remove([storagePath]);
    await supabase.from('datasets').delete().eq('id', dataset.id);
    throw versionError;
  }

  // Re-fetch: the is_current trigger just synced storage_path/processing_status onto the dataset row.
  const { data: finalDataset, error: refetchError } = await supabase
    .from('datasets')
    .select('*')
    .eq('id', dataset.id)
    .single();
  if (refetchError) throw refetchError;

  return { dataset: finalDataset, version };
}

export async function fetchDatasets(projectId: string): Promise<Dataset[]> {
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
  const { data, error } = await supabase
    .from('dataset_versions')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data;
}

export async function downloadDatasetVersion(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('raw-datasets').download(storagePath);
  if (error) throw error;
  return data;
}

async function fetchDataset(datasetId: string): Promise<Dataset | null> {
  const { data, error } = await supabase.from('datasets').select('*').eq('id', datasetId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Live hook: shows processing_status transition uploaded -> validating -> processing -> processed
 * (or failed) in real time as the backend (Step 19) works through it, with no polling. */
export function useDataset(datasetId: string | null): { dataset: Dataset | null; loading: boolean } {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasetId) {
      setDataset(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchDataset(datasetId).then((initial) => {
      if (!cancelled) {
        setDataset(initial);
        setLoading(false);
      }
    });

    const channel = supabase
      .channel(`dataset:${datasetId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'datasets', filter: `id=eq.${datasetId}` },
        (payload) => {
          if (!cancelled) setDataset(payload.new as Dataset);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [datasetId]);

  return { dataset, loading };
}
