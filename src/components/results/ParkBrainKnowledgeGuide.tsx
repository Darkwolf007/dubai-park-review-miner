import { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, FileText, Loader2, Search, ShieldCheck } from 'lucide-react';
import {
  isCompilableApprovedNumericRule,
  queryParkBrain,
  type ParkBrainQueryResponse
} from '../../lib/results/parkBrain';
import { SectionCard } from '../ui/SectionCard';

const STARTER_QUESTIONS = [
  'What approved requirements apply to accessible pedestrian paths in Dubai public parks?',
  'What cited rules require visibility between caregiver seating and children\'s playgrounds?',
  'What approved distance requirements apply between playgrounds, toilets, and drinking water?',
  'What requirements apply to shade over public park pedestrian routes and play areas?'
];

function statusClass(response: ParkBrainQueryResponse): string {
  if (response.answer_status === 'insufficient_evidence') return 'bg-amber-50 border-amber-200 text-amber-700';
  if (response.approved_rules.length > 0) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return 'bg-slate-50 border-slate-200 text-slate-600';
}

function displayStatus(response: ParkBrainQueryResponse): string {
  if (response.answer_status === 'insufficient_evidence') return 'Insufficient evidence';
  if (response.approved_rules.length > 0) return 'Approved rules available';
  if (response.citations.length > 0) return 'Retrieved guidance -- verify';
  return 'No usable evidence';
}

export function ParkBrainKnowledgeGuide() {
  const [question, setQuestion] = useState(STARTER_QUESTIONS[0]);
  const [response, setResponse] = useState<ParkBrainQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      setResponse(await queryParkBrain({ question: trimmed }));
    } catch (e: any) {
      setError(e?.message || 'Park Brain query failed');
    } finally {
      setLoading(false);
    }
  }

  const compilableNumericRules = response?.approved_rules.filter(isCompilableApprovedNumericRule) ?? [];

  return (
    <SectionCard icon={BookOpen} title="Park Brain -- Standards Knowledge Guide">
      <div className="rounded border border-indigo-100 bg-indigo-50 p-2.5 mb-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold text-indigo-800">Knowledge only; no automatic graph mutation</p>
            <p className="text-[9px] text-indigo-600 mt-0.5 leading-relaxed">
              Citations and candidate rules guide the designer. Only active approved rules with complete numeric provenance
              can become eligible for the future deterministic graph compiler.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 space-y-2">
          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Ask the standards library</label>
          <textarea
            value={question}
            onChange={event => setQuestion(event.target.value)}
            rows={5}
            className="w-full rounded border border-slate-200 px-2.5 py-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Ask Park Brain
          </button>
          <div className="space-y-1">
            {STARTER_QUESTIONS.map(starter => (
              <button
                type="button"
                key={starter}
                onClick={() => setQuestion(starter)}
                className="w-full text-left px-2 py-1.5 rounded border border-slate-100 text-[9px] text-slate-500 hover:bg-slate-50"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!response && !error && (
            <div className="h-full min-h-40 flex items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400">
              Ask a focused question to retrieve cited standards and rule status.
            </div>
          )}

          {response && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-1 rounded border text-[8px] font-bold uppercase tracking-wider ${statusClass(response)}`}>
                  {displayStatus(response)}
                </span>
                <span className="text-[8px] text-slate-400">
                  {response.query_metadata.documents_searched ?? 0} documents · {response.query_metadata.chunks_retrieved ?? 0} passages · {response.query_metadata.answer_model ?? 'unknown'} model
                </span>
                <span className="text-[8px] text-slate-400">Park Brain status: {response.answer_status.replaceAll('_', ' ')}</span>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-[10px] text-slate-700 whitespace-pre-line leading-relaxed">{response.answer}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded border border-slate-200 p-2">
                  <p className="text-[8px] uppercase font-bold text-slate-400">Citations</p>
                  <p className="text-base font-extrabold text-slate-700">{response.citations.length}</p>
                </div>
                <div className="rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[8px] uppercase font-bold text-amber-600">Candidates only</p>
                  <p className="text-base font-extrabold text-amber-700">{response.candidate_rules.length}</p>
                </div>
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-[8px] uppercase font-bold text-emerald-600">Approved rules</p>
                  <p className="text-base font-extrabold text-emerald-700">{response.approved_rules.length}</p>
                </div>
                <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
                  <p className="text-[8px] uppercase font-bold text-indigo-600">Numeric compile-ready</p>
                  <p className="text-base font-extrabold text-indigo-700">{compilableNumericRules.length}</p>
                </div>
              </div>

              {response.citations.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Cited passages</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {response.citations.map((citation, index) => (
                      <div key={`${citation.document_id}-${citation.page}-${index}`} className="rounded border border-slate-200 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <p className="text-[9px] font-bold text-slate-700 truncate">[{index + 1}] {citation.title}</p>
                          </div>
                          <span className="text-[8px] text-slate-400 shrink-0">p.{citation.page} · {citation.collection}</span>
                        </div>
                        <p className="text-[8px] font-semibold text-indigo-600 mt-1">{citation.section}</p>
                        <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">{citation.source_excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {response.approved_rules.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Active approved rules</p>
                  <div className="space-y-1.5">
                    {response.approved_rules.map(rule => (
                      <div key={rule.rule_id} className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[9px]">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          {rule.rule_id} · {rule.source_entity} {rule.relationship} {rule.target_entity}
                        </div>
                        <p className="text-emerald-700 mt-1">
                          {rule.numeric_constraint?.value !== null && rule.numeric_constraint
                            ? `${rule.numeric_constraint.value} ${rule.numeric_constraint.unit ?? ''}`
                            : 'Qualitative rule'} · approved by {rule.approved_by}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(response.candidate_rules.length > 0 || response.unresolved.length > 0 || response.conflicts.length > 0) && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[9px] text-amber-800 space-y-1">
                      {response.candidate_rules.length > 0 && <p>{response.candidate_rules.length} extracted candidate rule(s) require human review and are excluded from compilation.</p>}
                      {response.conflicts.length > 0 && <p>{response.conflicts.length} unresolved rule conflict(s) block affected constraints.</p>}
                      {response.unresolved.map((item, index) => <p key={index}>{item}</p>)}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
