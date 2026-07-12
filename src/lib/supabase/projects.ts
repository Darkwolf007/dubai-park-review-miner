import { supabase } from './client';
import type { Project } from './types';

export interface CreateProjectInput {
  parkId: string;
  name: string;
  description?: string;
  studyRadiusM?: number;
  h3Resolution?: number;
}

/**
 * Creates a project owned by the current session, or with owner_id = null if nobody's signed in
 * (valid while app_settings.public_access_enabled = true -- see Step 16). Once public access is
 * disabled, an anonymous insert like this would be rejected by RLS, not silently accepted.
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: session?.user.id ?? null,
      park_id: input.parkId,
      name: input.name,
      description: input.description ?? null,
      study_radius_m: input.studyRadiusM ?? 5000,
      h3_resolution: input.h3Resolution ?? 9
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Lists every project the current request is allowed to see (RLS decides -- everyone's during demo mode, only your own once restricted). */
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
