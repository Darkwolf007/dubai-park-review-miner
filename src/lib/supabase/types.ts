/**
 * Hand-written types matching the Supabase schema (Steps 4-12). Field names are snake_case,
 * matching exactly what supabase-js returns from Postgres -- no transform layer in between.
 * (Optional future improvement: `npx supabase gen types typescript` can generate these
 * automatically from the live schema instead of hand-maintaining them.)
 */

export interface Project {
  id: string;
  owner_id: string | null;
  park_id: string;
  name: string;
  description: string | null;
  study_radius_m: number;
  h3_resolution: number;
  analysis_crs: string;
  status: 'active' | 'archived' | 'deleted';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Park {
  id: string;
  name: string;
  slug: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  area_m2: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type DatasetType = 'vector' | 'raster' | 'tabular' | 'network' | 'other';

export interface Dataset {
  id: string;
  project_id: string;
  owner_id: string | null;
  name: string;
  category: string | null;
  dataset_type: DatasetType;
  source: string | null;
  format: string | null;
  storage_path: string | null;
  crs: string;
  bbox: unknown | null;
  resolution: string | null;
  acquisition_date: string | null;
  processing_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version_number: number;
  parent_version_id: string | null;
  storage_path: string;
  processing_method: string | null;
  processing_parameters: Record<string, unknown>;
  checksum: string | null;
  file_size_bytes: number | null;
  created_at: string;
  is_current: boolean;
}

export type AnalysisType =
  | 'population'
  | 'urban'
  | 'accessibility'
  | 'environmental'
  | 'community'
  | 'nlp_spatial'
  | 'space_syntax'
  | 'ai_design';

export type AnalysisRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AnalysisRun {
  id: string;
  project_id: string;
  owner_id: string | null;
  analysis_type: AnalysisType;
  status: AnalysisRunStatus;
  input_dataset_ids: string[];
  parameters: Record<string, unknown>;
  algorithm_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
}

export type OutputType = 'geojson' | 'geopackage' | 'csv' | 'excel' | 'geotiff' | 'json' | 'pdf' | 'png';

export interface GeneratedOutput {
  id: string;
  analysis_run_id: string;
  project_id: string;
  owner_id: string | null;
  output_type: OutputType;
  name: string;
  storage_bucket: string;
  storage_path: string;
  file_size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
