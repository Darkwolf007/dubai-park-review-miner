import type { GeoJsonFeatureCollection, GisManifest } from './types';

// Buildings/roads are bbox-gated server-side (too large to ship whole);
// everything else is small enough to fetch in full once.
export const BBOX_GATED_LAYERS = new Set(['buildings', 'roads']);

export async function fetchGisManifest(): Promise<GisManifest | null> {
  try {
    const res = await fetch('/api/gis/manifest');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGisLayer<P = Record<string, any>>(
  layerName: string,
  bbox?: [number, number, number, number]
): Promise<GeoJsonFeatureCollection<P> | null> {
  try {
    const url = bbox && BBOX_GATED_LAYERS.has(layerName)
      ? `/api/gis/layer/${layerName}?bbox=${bbox.join(',')}`
      : `/api/gis/layer/${layerName}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function downloadGeoJson(fc: GeoJsonFeatureCollection, filename: string) {
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
