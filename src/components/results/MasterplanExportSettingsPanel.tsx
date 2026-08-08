import { SlidersHorizontal } from 'lucide-react';
import type { MasterplanExportSettings } from '../../lib/gis/parkDesignPackage';
import { SectionCard } from '../ui/SectionCard';

interface Props {
  settings: MasterplanExportSettings;
  onChange: (settings: MasterplanExportSettings) => void;
}

function numericValue(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function MasterplanExportSettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof MasterplanExportSettings>(key: K, value: MasterplanExportSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const numberClass = 'w-full rounded border border-slate-200 px-2 py-1.5 text-[10px] text-slate-700 focus:border-indigo-400 focus:outline-none';
  const labelClass = 'space-y-1 text-[9px] font-bold uppercase tracking-wider text-slate-500';

  return (
    <SectionCard icon={SlidersHorizontal} title="Masterplan Export Settings">
      <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
        These values are exported with provenance as designer inputs or visible computational settings. Empty design dimensions remain unresolved; the exporter does not invent standards.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className={labelClass}>
          Operations target m²
          <input className={numberClass} type="number" min="0" value={settings.operationsAreaM2 ?? ''} placeholder="Unresolved" onChange={event => set('operationsAreaM2', numericValue(event.target.value))} />
        </label>
        <label className={labelClass}>
          Drop-off target m²
          <input className={numberClass} type="number" min="0" value={settings.dropOffAreaM2 ?? ''} placeholder="Unresolved" onChange={event => set('dropOffAreaM2', numericValue(event.target.value))} />
        </label>
        <label className={labelClass}>
          Candidate spacing m
          <input className={numberClass} type="number" min="1" value={settings.candidateSpacingM} onChange={event => set('candidateSpacingM', Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <label className={labelClass}>
          Access catchment m
          <input className={numberClass} type="number" min="1" value={settings.accessCatchmentRadiusM} onChange={event => set('accessCatchmentRadiusM', Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <label className={labelClass}>
          Road-edge distance m
          <input className={numberClass} type="number" min="0" value={settings.roadEdgeMaxDistanceM} onChange={event => set('roadEdgeMaxDistanceM', Math.max(0, Number(event.target.value) || 0))} />
        </label>
      </div>
      <div className="mt-3 grid gap-2 text-[10px] text-slate-600 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 p-2">
          <input type="checkbox" checked={settings.allPedestrianRoutesAccessible} onChange={event => set('allPedestrianRoutesAccessible', event.target.checked)} />
          Require all pedestrian routes to use the approved accessibility limit
        </label>
        <label className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 p-2">
          <input type="checkbox" checked={settings.allowWalkingJoggingSharing} onChange={event => set('allowWalkingJoggingSharing', event.target.checked)} />
          Allow walking and jogging to share alignments
        </label>
        <label className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 p-2">
          <input type="checkbox" checked={settings.allowServicePublicPathSharing} onChange={event => set('allowServicePublicPathSharing', event.target.checked)} />
          Allow service and public paths to share alignments
        </label>
      </div>
      <div className="mt-3 rounded border border-amber-100 bg-amber-50 p-2 text-[9px] leading-relaxed text-amber-800">
        Exercise cycling is exported as a closed loop connecting both road-facing public entrances. Pedestrian sharing remains conditional on terrain slope, curvature, approved width and conflict metrics. School- and building-facing entrances are hard exclusions.
      </div>
    </SectionCard>
  );
}
