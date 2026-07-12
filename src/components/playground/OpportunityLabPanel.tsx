import { useMemo, useState } from 'react';
import {
  Sparkles, TreeDeciduous, Baby, Coffee, Droplets, Dumbbell, Flower2, Users, DoorOpen, Footprints,
  Armchair, ChevronRight, AlertTriangle, CheckCircle2, Boxes
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { computeAllOpportunities, type OpportunityResult, type OpportunityType, type OpportunityPriority } from '../../lib/gis/opportunityEngine';
import type { H3Feature, RoadStats } from '../../lib/gis/types';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';

const ICON_BY_TYPE: Record<OpportunityType, LucideIcon> = {
  treePlanting: TreeDeciduous,
  inclusivePlayground: Baby,
  cafeKiosk: Coffee,
  drinkingWater: Droplets,
  sportsFitness: Dumbbell,
  quietGarden: Flower2,
  plazaEventLawn: Users,
  entrances: DoorOpen,
  joggingLoop: Footprints,
  shadedSeating: Armchair
};

const PRIORITY_STYLE: Record<OpportunityPriority, string> = {
  Critical: 'bg-mux-secondary text-white',
  High: 'bg-mux-primary text-white',
  Medium: 'border border-mux-tertiary text-mux-secondary',
  Low: 'bg-mux-neutral-95 text-mux-tertiary'
};

function ScoreBar({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-mux-tertiary">{label}</span>
        <span className="font-mono text-[10px] font-medium text-mux-secondary">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-mux-neutral-95 overflow-hidden">
        <div
          className={`h-full rounded-full ${accent ? 'bg-mux-primary' : 'bg-mux-secondary'}`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
    </div>
  );
}

function OpportunityCard({ result, active, onClick }: { result: OpportunityResult; active: boolean; onClick: () => void }) {
  const Icon = ICON_BY_TYPE[result.type];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-[12px] border px-3 py-2.5 transition-colors ${
        active ? 'border-mux-primary bg-mux-primary-20/25' : 'border-mux-tertiary/25 bg-mux-surface hover:bg-mux-neutral-95'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-mux-primary text-white' : 'bg-mux-neutral-95 text-mux-secondary'}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-mux-secondary truncate" style={{ fontFamily: 'var(--font-sans)' }}>{result.name}</p>
          <p className="font-mono text-[8px] uppercase tracking-wider text-mux-tertiary">Opportunity {result.opportunityScore}/100</p>
        </div>
        <span className={`font-mono text-[8px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_STYLE[result.priority]}`}>
          {result.priority}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-mux-primary' : 'text-mux-tertiary'}`} />
      </div>
    </button>
  );
}

export function OpportunityLabPanel({
  hexes,
  reviews,
  roadStats
}: {
  hexes: H3Feature[];
  reviews: NLPAnalyzedReview[];
  roadStats: RoadStats | null;
}) {
  const results = useMemo(() => computeAllOpportunities(hexes, reviews, roadStats), [hexes, reviews, roadStats]);
  const [selectedType, setSelectedType] = useState<OpportunityType | null>(null);
  const selected = results.find(r => r.type === selectedType) ?? results[0] ?? null;

  return (
    <div className="rounded-[16px] border border-mux-tertiary/30 bg-mux-neutral p-4" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-mux-primary" />
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-wider text-mux-secondary">Opportunity Lab</h2>
      </div>
      <p className="text-[10px] text-mux-tertiary mb-4 leading-relaxed max-w-2xl">
        Unified opportunity analysis for Al Safa 2 Park -- combines Population, Urban, Accessibility, Environmental, Community,
        and NLP Spatial engine outputs into ranked design-decision candidates. Demand and site suitability are computed
        separately and combined with feasibility (available land) into one opportunity score per intervention type.
      </p>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-4 space-y-1.5 max-h-[720px] overflow-y-auto pr-1">
          {results.map(r => (
            <OpportunityCard key={r.type} result={r} active={selected?.type === r.type} onClick={() => setSelectedType(r.type)} />
          ))}
        </div>

        {selected && (
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-mux-secondary">{selected.name}</h3>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-mux-tertiary mt-0.5">
                    {selected.primaryUsers.join(' · ')}
                  </p>
                </div>
                <span className={`font-mono text-[9px] font-medium uppercase tracking-wider px-2 py-1 rounded-full ${PRIORITY_STYLE[selected.priority]}`}>
                  {selected.priority} Priority
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
                <ScoreBar label="Demand" value={selected.demandScore} accent />
                <ScoreBar label="Suitability" value={selected.suitabilityScore} />
                <ScoreBar label="Feasibility" value={selected.feasibilityScore} />
                <ScoreBar label="Confidence" value={selected.confidenceScore} />
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-mux-tertiary/15">
                <span className="font-mono text-[9px] uppercase tracking-wider text-mux-tertiary">Opportunity Score</span>
                <span className="font-mono text-sm font-medium text-mux-primary">{selected.opportunityScore}/100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
                <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-1.5">Recommended Area</p>
                {selected.recommendedAreaM2 ? (
                  <div className="text-[11px] text-mux-secondary space-y-0.5">
                    <div>Target: <strong>{selected.recommendedAreaM2.target.toLocaleString()} m²</strong></div>
                    <div className="text-mux-tertiary text-[10px]">Range: {selected.recommendedAreaM2.minimum.toLocaleString()} - {selected.recommendedAreaM2.maximum.toLocaleString()} m²</div>
                  </div>
                ) : (
                  <p className="text-[10px] text-mux-tertiary">Not applicable -- linear/point feature, not an area program.</p>
                )}
              </div>
              <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
                <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-1.5">Adjacency Needs</p>
                {selected.adjacencyNeeds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.adjacencyNeeds.map(a => (
                      <span key={a} className="font-mono text-[8px] px-1.5 py-0.5 rounded-full bg-mux-neutral-95 text-mux-secondary">{a}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-mux-tertiary">No specific adjacency requirement modeled.</p>
                )}
              </div>
            </div>

            <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
              <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Evidence
              </p>
              <ul className="space-y-1">
                {selected.evidence.map((e, i) => (
                  <li key={i} className="text-[10px] text-mux-secondary leading-relaxed pl-2.5 border-l-2 border-mux-neutral-20">{e}</li>
                ))}
              </ul>
            </div>

            <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
              <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Avoid Conditions
              </p>
              <ul className="space-y-1">
                {selected.avoidConditions.map((a, i) => (
                  <li key={i} className="text-[10px] text-mux-secondary leading-relaxed">{a}</li>
                ))}
              </ul>
            </div>

            <div className="bg-mux-surface rounded-[14px] border border-mux-tertiary/25 p-3.5">
              <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-2">Top H3 Cells for {selected.name}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left font-mono text-[8px] uppercase tracking-wider text-mux-tertiary">
                      <th className="pb-1 pr-2">H3 Cell</th>
                      <th className="pb-1 pr-2">Opportunity</th>
                      <th className="pb-1 pr-2">Demand</th>
                      <th className="pb-1 pr-2">Suitability</th>
                      <th className="pb-1">Feasibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.topCells.slice(0, 10).map(c => (
                      <tr key={c.h3Id} className="border-t border-mux-tertiary/10">
                        <td className="py-1 pr-2 font-mono text-[9px] text-mux-tertiary truncate max-w-[110px]">{c.h3Id}</td>
                        <td className="py-1 pr-2 font-medium text-mux-secondary">{c.opportunityScore}</td>
                        <td className="py-1 pr-2 text-mux-tertiary">{c.demandScore}</td>
                        <td className="py-1 pr-2 text-mux-tertiary">{c.suitabilityScore}</td>
                        <td className="py-1 text-mux-tertiary">{c.feasibilityScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-mux-secondary text-white rounded-[14px] p-3.5">
              <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-primary-60 mb-2 flex items-center gap-1">
                <Boxes className="w-3 h-3" /> Grasshopper Readiness
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Suitability Field</p>
                  <p className="font-mono text-[10px]">{selected.grasshopperInputs.suitabilityField}</p>
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Recommended Area</p>
                  <p>{selected.grasshopperInputs.recommendedAreaM2 ? `${selected.grasshopperInputs.recommendedAreaM2.target.toLocaleString()} m² target` : 'N/A'}</p>
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Attractors</p>
                  <p className="leading-relaxed">{selected.grasshopperInputs.attractors.join(', ') || 'None'}</p>
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Repellers</p>
                  <p className="leading-relaxed">{selected.grasshopperInputs.repellers.join(', ') || 'None'}</p>
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Constraints</p>
                  <p className="leading-relaxed">{selected.grasshopperInputs.constraints.join('; ') || 'None triggered'}</p>
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-white/50 mb-0.5">Adjacency Rules</p>
                  <p className="leading-relaxed">
                    Prefer: {selected.grasshopperInputs.adjacencyRules.preferred.join(', ') || 'none'}<br />
                    Avoid: {selected.grasshopperInputs.adjacencyRules.avoid.join(', ') || 'none'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
