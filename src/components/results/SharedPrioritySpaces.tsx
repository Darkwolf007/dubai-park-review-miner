import { Users } from 'lucide-react';
import type { SharedPrioritySpace } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';

export function SharedPrioritySpaces({ spaces }: { spaces: SharedPrioritySpace[] }) {
  if (spaces.length === 0) return null;

  return (
    <SectionCard icon={Users} title="Overlapping Priority Spaces -- Where Multiple Archetypes Converge">
      <p className="text-[9px] text-slate-400 mb-3">
        These spaces were independently assigned to more than one archetype -- treat each as a single consolidated
        high-priority zone rather than duplicating area. combined_priority_score reflects how many archetypes converge here.
      </p>
      <div className="space-y-2">
        {spaces.map(sp => (
          <div key={sp.opportunity_type || sp.space_name} className="flex items-center justify-between gap-3 p-2 rounded border border-indigo-100 bg-indigo-50/50">
            <div>
              <div className="text-[11px] font-bold text-slate-700">{sp.space_name}</div>
              <div className="text-[9px] text-slate-500">{sp.overlap_note}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                {sp.archetypes.map(a => (
                  <span key={a} className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white border border-indigo-200 text-indigo-700">{a}</span>
                ))}
              </div>
              <span className="px-2 py-1 rounded text-[10px] font-extrabold bg-indigo-600 text-white shrink-0">
                {sp.combined_priority_score}/10
              </span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
