import { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computePersonaAnalytics } from '../../lib/analytics/personas';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';

export function PersonaAnalytics({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const personas = useMemo(() => computePersonaAnalytics(reviews), [reviews]);

  return (
    <SectionCard icon={Users} title="User Persona Analytics">
      <p className="text-[9px] text-slate-500 mb-3">
        Inferred from review language (multi-label -- a review can match more than one persona). Approximate, not a survey.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {personas.map(persona => (
          <div key={persona.id} className="border border-slate-200 rounded p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">{persona.label}</span>
              <span className="text-[9px] font-bold text-slate-400">{persona.reviewCount} reviews</span>
            </div>

            {persona.primaryNeeds.length > 0 && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Primary Needs</p>
                <div className="flex flex-wrap gap-1">
                  {persona.primaryNeeds.map(cat => <Pill key={cat} variant="category" value={cat} />)}
                </div>
              </div>
            )}

            {persona.topComplaints.length > 0 && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Top Complaints</p>
                <div className="flex flex-col gap-0.5">
                  {persona.topComplaints.map(c => (
                    <div key={c.category} className="flex items-center justify-between text-[9px] text-slate-600">
                      <span className="capitalize">{c.category}</span>
                      <span className="font-mono text-rose-600 font-bold">{Math.round(c.negativeShare * 100)}% negative</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {persona.positiveQuote && (
              <p className="text-[10px] text-slate-600 italic border-l-2 border-emerald-200 pl-2 line-clamp-3">
                "{persona.positiveQuote}" <span className="not-italic text-slate-400">— {persona.positiveQuoteAuthor}</span>
              </p>
            )}

            {persona.suggestedIntervention && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded p-1.5 text-[9px] text-indigo-900 leading-relaxed">
                {persona.suggestedIntervention}
              </div>
            )}
          </div>
        ))}
        {personas.length === 0 && (
          <p className="text-slate-400 text-xs font-semibold col-span-full text-center py-4">No persona signals detected in this dataset yet.</p>
        )}
      </div>
    </SectionCard>
  );
}
