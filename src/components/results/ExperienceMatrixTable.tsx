import { useMemo } from 'react';
import { Table2 } from 'lucide-react';
import type { ArchetypeExperienceRow, AgeGroupTier } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';

const AGE_TIER_ORDER: AgeGroupTier[] = ['Kids', 'Teens', 'Adults', 'Old'];

// Kept in sync with ExperienceSankeyFlow.AGE_TIER_COLOR (validated for CVD-safety) -- Teens uses
// teal rather than Tailwind's violet-500, which sat at CVD ΔE 0.8 against Adults' indigo-500.
const AGE_TIER_COLORS: Record<AgeGroupTier, string> = {
  Kids: 'bg-pink-50 border-pink-200 text-pink-700',
  Teens: 'bg-teal-50 border-teal-200 text-teal-700',
  Adults: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  Old: 'bg-amber-50 border-amber-200 text-amber-700'
};

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1" title={`${label}: ${value}/10`}>
      <span className="text-[8px] text-slate-400 w-4">{label}</span>
      <div className="w-10 h-1.5 bg-slate-100 rounded overflow-hidden">
        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, value * 10))}%` }} />
      </div>
    </div>
  );
}

export function ExperienceMatrixTable({ rows }: { rows: ArchetypeExperienceRow[] }) {
  const grouped = useMemo(() => {
    const map = new Map<AgeGroupTier, ArchetypeExperienceRow[]>();
    AGE_TIER_ORDER.forEach(tier => map.set(tier, []));
    rows.forEach(r => {
      const list = map.get(r.tier_1_age_group) || [];
      list.push(r);
      map.set(r.tier_1_age_group, list);
    });
    return map;
  }, [rows]);

  return (
    <SectionCard icon={Table2} title="Archetype -> Experience -> Usable Space & Amenities Matrix">
      <div className="space-y-4">
        {AGE_TIER_ORDER.filter(tier => (grouped.get(tier) || []).length > 0).map(tier => (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${AGE_TIER_COLORS[tier]}`}>{tier}</span>
              <span className="text-[9px] text-slate-400">{(grouped.get(tier) || []).length} archetype(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wider text-[8px] border-b border-slate-200">
                    <th className="py-1.5 pr-2 font-bold">Archetype</th>
                    <th className="py-1.5 pr-2 font-bold">Core Activities</th>
                    <th className="py-1.5 pr-2 font-bold">Desired Experience</th>
                    <th className="py-1.5 pr-2 font-bold">Usable Space & Amenities</th>
                    <th className="py-1.5 pr-2 font-bold text-right">Area m&sup2;</th>
                    <th className="py-1.5 pr-2 font-bold">Zone / Window</th>
                    <th className="py-1.5 pr-2 font-bold">Scores</th>
                    <th className="py-1.5 pr-2 font-bold text-right">Cost / m&sup2;</th>
                  </tr>
                </thead>
                <tbody>
                  {(grouped.get(tier) || []).map((row, i) => (
                    <tr key={`${row.tier_5_assigned_space.space_id || 'space'}-${row.tier_2_archetype}-${i}`} className="border-b border-slate-100 align-top">
                      <td className="py-1.5 pr-2 font-bold text-slate-700">{row.tier_2_archetype}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{row.tier_3_activities.join(', ')}</td>
                      <td className="py-1.5 pr-2 text-slate-500 max-w-xs">
                        <div className="text-[8px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5">{row.tier_4_experience_tag}</div>
                        {row.tier_4_desired_experience}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-700 font-semibold">
                        {row.tier_5_assigned_space.space_name}
                        <div className="text-[8px] text-slate-400 font-normal">
                          {row.tier_6_spatial_properties_and_scores.aesthetic_materiality}
                          {row.tier_5_assigned_space.opportunity_type && ` · Opportunity Lab: ${row.tier_5_assigned_space.opportunity_type}`}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right font-bold text-slate-700">{row.tier_5_assigned_space.target_area_m2.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-slate-500">
                        <div>{row.tier_6_spatial_properties_and_scores.preferred_location_zone.replace('_', ' ')}</div>
                        <div className="text-[8px] text-slate-400">{row.tier_6_spatial_properties_and_scores.peak_usage_window}</div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="space-y-0.5">
                          <ScoreBar value={row.tier_6_spatial_properties_and_scores.active_shade_score} label="AS" />
                          <ScoreBar value={row.tier_6_spatial_properties_and_scores.passive_shade_score} label="PS" />
                          <ScoreBar value={row.tier_6_spatial_properties_and_scores.biodiversity_score} label="BD" />
                          <ScoreBar value={row.tier_6_spatial_properties_and_scores.overlap_priority_score} label="OV" />
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 mt-0.5">
                          {row.tier_6_spatial_properties_and_scores.spatial_score_band} spatial priority ({row.tier_6_spatial_properties_and_scores.composite_spatial_score}/10)
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-slate-500">
                        AED {row.tier_6_spatial_properties_and_scores.cost_rate_aed_per_m2.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
