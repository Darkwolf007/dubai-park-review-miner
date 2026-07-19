import { useState } from 'react';
import { Info } from 'lucide-react';
import { getMethodology } from '../../lib/metrics/metricMethodology';

/**
 * Compact, reusable methodology tooltip: hover/focus shows the short explanation + nature/scale
 * badges, click pins open the full methodology (sources, calculation, confidence caveat). Reads
 * from the shared metricMethodology registry so the same metric explains itself identically
 * everywhere it appears (Opportunity Lab, suitability map, program network, existing report tiles).
 */
export function InfoTooltip({ methodologyKey, className = '' }: { methodologyKey: string; className?: string }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const meta = getMethodology(methodologyKey);
  if (!meta) return null;
  const visible = hovering || pinned;

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        onClick={() => setPinned(v => !v)}
        className="text-slate-300 hover:text-indigo-600 focus:text-indigo-600 inline-flex align-middle"
        aria-label={`Methodology for ${meta.label}`}
      >
        <Info className="w-2.5 h-2.5" />
      </button>
      {visible && (
        <span className="absolute z-[600] left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 bg-slate-900 text-white text-[9px] rounded shadow-lg p-2 leading-snug">
          <span className="block font-bold mb-0.5">{meta.label}</span>
          <span className="block text-slate-200">{meta.shortTooltip}</span>
          <span className="flex items-center gap-1 mt-1.5">
            <span className="px-1 py-0.5 rounded border border-slate-600 text-[7px] uppercase tracking-wider text-slate-300">{meta.nature}</span>
            <span className="px-1 py-0.5 rounded border border-slate-600 text-[7px] uppercase tracking-wider text-slate-300">{meta.spatialScale}</span>
          </span>
          {pinned && (
            <span className="block mt-1.5 pt-1.5 border-t border-slate-700 space-y-1">
              <span className="block text-slate-300">{meta.detailedMethodology}</span>
              <span className="block text-slate-400">Sources: {meta.inputSources.join(', ')}</span>
              <span className="block text-amber-300">{meta.confidenceCaveat}</span>
            </span>
          )}
          <span className="block mt-1 text-[8px] text-indigo-300">{pinned ? 'Click to collapse' : 'Click for full methodology'}</span>
        </span>
      )}
    </span>
  );
}
