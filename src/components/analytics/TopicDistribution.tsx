import { useMemo } from 'react';
import { Tags } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeTopicDistribution } from '../../lib/analytics/topics';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';

export function TopicDistribution({ reviews }: { reviews: NLPAnalyzedReview[] }) {
  const topics = useMemo(() => computeTopicDistribution(reviews), [reviews]);

  return (
    <SectionCard icon={Tags} title="Topic Distribution">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {topics.map(topic => {
          const posPct = Math.round(topic.sentiment.positive * 100);
          const neuPct = Math.round(topic.sentiment.neutral * 100);
          const negPct = Math.max(0, 100 - posPct - neuPct);
          return (
            <div key={topic.category} className="border border-slate-200 rounded p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Pill variant="category" value={topic.category} dot />
                <span className="text-[9px] font-bold text-slate-400">{topic.reviewCount} reviews</span>
              </div>

              <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-emerald-500" style={{ width: `${posPct}%` }} />
                <div className="bg-slate-300" style={{ width: `${neuPct}%` }} />
                <div className="bg-rose-500" style={{ width: `${negPct}%` }} />
              </div>

              {topic.topKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {topic.topKeywords.slice(0, 6).map(kw => (
                    <span key={kw} className="bg-slate-100 text-[8px] text-slate-500 px-1 py-0.5 rounded font-mono border border-slate-200">#{kw}</span>
                  ))}
                </div>
              )}

              {topic.representativeQuote && (
                <p className="text-[10px] text-slate-600 italic border-l-2 border-slate-200 pl-2 line-clamp-3">
                  "{topic.representativeQuote}" <span className="not-italic text-slate-400">— {topic.representativeAuthor}</span>
                </p>
              )}

              <div className="bg-indigo-50/60 border border-indigo-100 rounded p-1.5 text-[9px] text-indigo-900 leading-relaxed">
                {topic.designImplication}
              </div>
            </div>
          );
        })}
        {topics.length === 0 && (
          <p className="text-slate-400 text-xs font-semibold col-span-full text-center py-4">No categorized reviews yet.</p>
        )}
      </div>
    </SectionCard>
  );
}
