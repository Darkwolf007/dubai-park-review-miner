import { useState } from 'react';
import { History, RotateCcw, Download, Trash2 } from 'lucide-react';
import type { HistoryEntry } from './AnalysisEnginePanel';
import { SectionCard } from '../ui/SectionCard';

function downloadEntry(entry: HistoryEntry) {
  const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entry.name.replace(/\s+/g, '_')}_${entry.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AnalysisHistoryPanel({ history, onClearAll }: { history: HistoryEntry[]; onClearAll: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <SectionCard
      icon={History}
      title="Analysis History"
      action={
        history.length > 0 ? (
          <button onClick={onClearAll} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        ) : undefined
      }
    >
      {history.length === 0 ? (
        <p className="text-slate-400 text-xs font-semibold text-center py-8">No analyses run yet. Every "Run Analysis" click is logged here.</p>
      ) : (
        <div className="space-y-2">
          {history.map(entry => (
            <div key={entry.id} className="border border-slate-200 rounded p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">{entry.name}</span>
                <span className="text-[9px] text-slate-400 font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">{entry.summary}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.layers.map(l => <span key={l} className="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded font-mono">{l}</span>)}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800">
                  <RotateCcw className="w-3 h-3" /> Restore
                </button>
                <button onClick={() => downloadEntry(entry)} className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-slate-700">
                  <Download className="w-3 h-3" /> Export
                </button>
              </div>
              {expandedId === entry.id && (
                <div className="mt-1.5 text-[9px] text-slate-500 bg-slate-50 border border-slate-100 rounded p-1.5">
                  {entry.summary} -- re-run the analysis card for updated numbers.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
