import { Wallet } from 'lucide-react';
import type { ProjectMetadata } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';
import { MetricTile } from '../playground/MetricTile';
import { AL_SAFA_2_COMPETITION_BRIEF } from '../../lib/results/competitionBrief';

const AED_FORMATTER = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });

export function BudgetStatusCard({ projectMetadata }: { projectMetadata: ProjectMetadata }) {
  const withinBudget = projectMetadata.budget_status === 'WITHIN_BUDGET';
  const withinArea = projectMetadata.total_site_area_m2 <= AL_SAFA_2_COMPETITION_BRIEF.totalSiteAreaM2Cap;

  return (
    <SectionCard
      icon={Wallet}
      title="Budget & Footprint Status"
      action={
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${withinBudget ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {projectMetadata.budget_status.replace('_', ' ')}
        </span>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricTile
          label="Site Area Used"
          value={projectMetadata.total_site_area_m2.toLocaleString()}
          unit={`/ ${AL_SAFA_2_COMPETITION_BRIEF.totalSiteAreaM2Cap.toLocaleString()} m2`}
          note={withinArea ? 'Within footprint cap.' : 'Exceeds footprint cap.'}
        />
        <MetricTile
          label="Calculated Cost"
          value={`AED ${AED_FORMATTER.format(projectMetadata.calculated_total_cost_aed)}`}
        />
        <MetricTile
          label="Budget Cap"
          value={`AED ${AED_FORMATTER.format(projectMetadata.total_budget_cap_aed)}`}
        />
        <MetricTile
          label="CRS / Projection"
          value={projectMetadata.crs_projection}
        />
      </div>
    </SectionCard>
  );
}
