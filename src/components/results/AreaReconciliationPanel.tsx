import { AlertTriangle, Calculator, CheckCircle2 } from 'lucide-react';
import type { AreaReconciliation } from '../../lib/designPackage/areaReconciliation';
import { SectionCard } from '../ui/SectionCard';

interface Props {
  reconciliation: AreaReconciliation;
}

function area(value: number | null): string {
  return value === null ? 'Unresolved' : `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

function AreaRow({ label, value, tone = 'normal' }: { label: string; value: number | null; tone?: 'normal' | 'muted' | 'strong' }) {
  const toneClass = tone === 'strong' ? 'font-bold text-slate-800' : tone === 'muted' ? 'text-slate-500' : 'text-slate-700';
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-slate-100 py-1.5 last:border-0 ${toneClass}`}>
      <span>{label}</span>
      <span className="tabular-nums">{area(value)}</span>
    </div>
  );
}

export function AreaReconciliationPanel({ reconciliation }: Props) {
  const measured = reconciliation.measured_boundary_area_m2;
  const committedRatio = measured && measured > 0 ? Math.max(0, reconciliation.exclusive_committed_area_m2 / measured) : 0;
  const width = `${Math.min(100, committedRatio * 100)}%`;
  const isComplete = reconciliation.status === 'complete';
  const isOver = reconciliation.status === 'overallocated';

  return (
    <SectionCard icon={Calculator} title="Area Reconciliation">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-[10px] leading-relaxed text-slate-500">
          The measured boundary governs geometric fit. The 15,000 m² competition-brief statement remains visible as the project authority. Shared spaces and landscape coverage may overlap and are not double-counted as exclusive land.
        </p>
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${isComplete ? 'bg-emerald-50 text-emerald-700' : isOver ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
          {isComplete ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {reconciliation.status}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-slate-200 p-3 text-[10px]">
          <AreaRow label="Brief gross area" value={reconciliation.brief_gross_area_m2} tone="strong" />
          <AreaRow label="Measured GIS boundary" value={measured} />
          <AreaRow label="Boundary variance" value={reconciliation.measured_to_brief_variance_m2} tone="muted" />
          <AreaRow label="Maximum leasable area" value={reconciliation.maximum_leasable_area_m2} tone="muted" />
        </div>
        <div className="rounded border border-slate-200 p-3 text-[10px]">
          <AreaRow label="Program targets (excluding operations/drop-off)" value={reconciliation.exclusive_program_area_m2} />
          <AreaRow label="Operations" value={reconciliation.operations_area_m2} />
          <AreaRow label="Drop-off" value={reconciliation.drop_off_area_m2} />
          <AreaRow label="Circulation" value={reconciliation.circulation_area_m2} />
          <AreaRow label="Exclusive committed" value={reconciliation.exclusive_committed_area_m2} tone="strong" />
          <AreaRow label="Remaining measured area" value={reconciliation.remaining_area_m2} tone="strong" />
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[9px] font-semibold text-slate-500">
          <span>Exclusive land commitment</span>
          <span>{(committedRatio * 100).toFixed(1)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${isOver ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width }} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded border border-indigo-100 bg-indigo-50/40 p-3 text-[10px] text-slate-700">
          <AreaRow label="Shared-space nominal demand" value={reconciliation.shared_demand_area_m2} />
          <p className="mt-2 text-[9px] leading-relaxed text-indigo-700">Shared demand is reported for solver sizing but is not added to exclusive committed land.</p>
        </div>
        <div className="rounded border border-emerald-100 bg-emerald-50/40 p-3 text-[10px]">
          {reconciliation.coverage_targets.map(target => (
            <div key={target.program_id} className="flex items-center justify-between gap-3 border-b border-emerald-100 py-1.5 last:border-0">
              <span className="text-slate-700">{target.label}</span>
              <span className="text-right tabular-nums text-emerald-800">
                {target.percent === null ? 'Unresolved' : `${target.percent}% · ${area(target.equivalent_area_m2)}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(reconciliation.unresolved_exclusive_program_ids.length > 0 || reconciliation.unresolved_coverage_program_ids.length > 0) && (
        <div className="mt-3 rounded border border-amber-100 bg-amber-50 p-2 text-[9px] leading-relaxed text-amber-800">
          {reconciliation.unresolved_exclusive_program_ids.length > 0 && <div>Unresolved exclusive inputs: {reconciliation.unresolved_exclusive_program_ids.join(', ')}.</div>}
          {reconciliation.unresolved_coverage_program_ids.length > 0 && <div>Unresolved coverage targets: {reconciliation.unresolved_coverage_program_ids.join(', ')}.</div>}
          {reconciliation.circulation_area_m2 === null && <div>Circulation target is unresolved.</div>}
        </div>
      )}
    </SectionCard>
  );
}
