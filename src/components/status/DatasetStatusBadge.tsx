import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useDataset } from '../../lib/supabase/datasets';

const STYLE_BY_STATUS: Record<string, string> = {
  uploaded: 'bg-slate-100 border-slate-200 text-slate-600',
  validating: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  processing: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  processed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  failed: 'bg-rose-50 border-rose-200 text-rose-700'
};

const ICON_BY_STATUS: Record<string, typeof Upload> = {
  uploaded: Upload,
  validating: Loader2,
  processing: Loader2,
  processed: CheckCircle2,
  failed: AlertCircle
};

/** Live badge for one datasets row -- tracks processing_status through
 * uploaded -> validating -> processing -> processed/failed via Realtime (Step 19/21), no polling. */
export function DatasetStatusBadge({ datasetId }: { datasetId: string }) {
  const { dataset, loading } = useDataset(datasetId);

  if (loading || !dataset) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none bg-slate-100 border-slate-200 text-slate-400">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        <span>Loading</span>
      </span>
    );
  }

  const status = dataset.processing_status;
  const Icon = ICON_BY_STATUS[status] ?? Upload;
  const errorMessage = typeof dataset.metadata.processing_error === 'string' ? dataset.metadata.processing_error : undefined;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none ${STYLE_BY_STATUS[status] ?? STYLE_BY_STATUS.uploaded}`}
      title={status === 'failed' ? errorMessage : undefined}
    >
      <Icon className={`w-2.5 h-2.5 ${status === 'validating' || status === 'processing' ? 'animate-spin' : ''}`} />
      <span>{status}</span>
    </span>
  );
}
