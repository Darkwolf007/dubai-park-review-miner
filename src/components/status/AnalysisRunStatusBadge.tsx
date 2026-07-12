import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useAnalysisRun } from '../../lib/supabase/analysisRuns';
import type { AnalysisRunStatus } from '../../lib/supabase/types';

const STYLE_BY_STATUS: Record<AnalysisRunStatus, string> = {
  queued: 'bg-slate-100 border-slate-200 text-slate-600',
  running: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  completed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  failed: 'bg-rose-50 border-rose-200 text-rose-700'
};

const ICON_BY_STATUS: Record<AnalysisRunStatus, typeof Clock> = {
  queued: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle
};

/** Live badge for one analysis_runs row -- re-renders on every Realtime UPDATE (Step 17e/21), no polling. */
export function AnalysisRunStatusBadge({ runId }: { runId: string }) {
  const { run, loading } = useAnalysisRun(runId);

  if (loading || !run) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none bg-slate-100 border-slate-200 text-slate-400">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        <span>Loading</span>
      </span>
    );
  }

  const Icon = ICON_BY_STATUS[run.status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none ${STYLE_BY_STATUS[run.status]}`}
      title={run.status === 'failed' ? (run.error_message ?? undefined) : undefined}
    >
      <Icon className={`w-2.5 h-2.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
      <span>{run.status}</span>
    </span>
  );
}
