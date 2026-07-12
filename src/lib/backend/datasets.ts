import { uploadDataset, type UploadDatasetInput, type UploadDatasetResult } from '../supabase/datasets';
import { backendFetch } from './client';

export interface ProcessDatasetResult {
  dataset_id: string;
  version_id: string;
  version_number: number;
  feature_count: number;
  bbox: [number, number, number, number] | null;
}

/** Asks the FastAPI backend to validate the dataset's current raw file and publish a processed version. */
export function processDataset(datasetId: string): Promise<ProcessDatasetResult> {
  return backendFetch<ProcessDatasetResult>(`/datasets/${datasetId}/process`, { method: 'POST' });
}

export interface UploadAndProcessResult extends UploadDatasetResult {
  processing: ProcessDatasetResult;
}

/**
 * The full Step 19 workflow: upload the raw file to Supabase Storage (Step 17d), then hand it
 * to the backend for validation/processing (this step). Kept as two calls, not one transaction --
 * if processing fails, the raw upload still exists and can be retried via processDataset() alone.
 */
export async function uploadAndProcessDataset(input: UploadDatasetInput): Promise<UploadAndProcessResult> {
  const uploadResult = await uploadDataset(input);
  const processing = await processDataset(uploadResult.dataset.id);
  return { ...uploadResult, processing };
}
