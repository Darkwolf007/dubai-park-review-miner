import { useEffect, useState } from 'react';
import { supabase } from './client';

/**
 * Reads the single-row app_settings.public_access_enabled flag (Step 16). This is what decides
 * whether AuthGate shows a login screen at all.
 */
export function usePublicAccessEnabled(): { publicAccessEnabled: boolean | null; loading: boolean } {
  const [publicAccessEnabled, setPublicAccessEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('public_access_enabled')
        .eq('id', true)
        .single();

      if (cancelled) return;
      if (error) {
        console.error('Failed to load app_settings -- failing closed (requiring auth):', error);
        // Fail closed: if we can't confirm public access is actually on, don't assume it is.
        setPublicAccessEnabled(false);
      } else {
        setPublicAccessEnabled(data.public_access_enabled);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { publicAccessEnabled, loading };
}
