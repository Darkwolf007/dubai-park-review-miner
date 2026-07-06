import { useMemo, useState } from 'react';
import { Type } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeTfIdf, computeNGrams, computeKeywordTrend } from '../../lib/analytics/wordAnalytics';
import { SectionCard } from '../ui/SectionCard';

export function WordAnalytics({
  reviews,
  activeKeyword,
  onSelectKeyword
}: {
  reviews: NLPAnalyzedReview[];
  activeKeyword: string | null;
  onSelectKeyword: (keyword: string | null) => void;
}) {
  const [ngramSize, setNgramSize] = useState<2 | 3>(2);

  const tfidfTerms = useMemo(() => computeTfIdf(reviews, 60), [reviews]);
  const ngrams = useMemo(() => computeNGrams(reviews, ngramSize, 25), [reviews, ngramSize]);
  const trend = useMemo(() => (activeKeyword ? computeKeywordTrend(reviews, activeKeyword, 'month') : []), [reviews, activeKeyword]);

  const maxScore = Math.max(0.001, ...tfidfTerms.map(t => t.score));

  function toggleKeyword(word: string) {
    onSelectKeyword(activeKeyword === word ? null : word);
  }

  return (
    <div className="space-y-3">
      <SectionCard icon={Type} title="Word Cloud (TF-IDF weighted)">
        <p className="text-[9px] text-slate-500 mb-2">Sized by TF-IDF -- rare, salient words score higher than common ones. Click a word to filter the dashboard.</p>
        {tfidfTerms.length === 0 ? (
          <p className="text-slate-400 text-xs font-semibold text-center py-10">No review text yet.</p>
        ) : (
          <div className="min-h-[220px] flex flex-wrap items-center justify-center gap-2 p-4 bg-slate-50 border border-slate-100 rounded">
            {tfidfTerms.map(t => (
              <button
                key={t.term}
                onClick={() => toggleKeyword(t.term)}
                style={{ fontSize: `${Math.max(11, Math.min(38, (t.score / maxScore) * 38))}px` }}
                className={`font-bold transition-colors ${activeKeyword === t.term ? 'text-indigo-600 underline' : 'text-slate-600 hover:text-indigo-500'}`}
              >
                {t.term}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={Type}
        title="Keyword Phrases"
        action={
          <div className="flex gap-1 bg-slate-100 rounded p-0.5">
            <button
              onClick={() => setNgramSize(2)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${ngramSize === 2 ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Bi-grams
            </button>
            <button
              onClick={() => setNgramSize(3)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${ngramSize === 3 ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tri-grams
            </button>
          </div>
        }
      >
        {ngrams.length === 0 ? (
          <p className="text-slate-400 text-xs font-semibold text-center py-6">Not enough repeated phrases yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {ngrams.map(g => (
              <button
                key={g.phrase}
                onClick={() => toggleKeyword(g.phrase)}
                className={`flex items-center justify-between px-2 py-1 rounded border text-[10px] text-left ${
                  activeKeyword === g.phrase ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{g.phrase}</span>
                <span className="font-mono text-slate-400 ml-1">{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {activeKeyword && (
        <SectionCard icon={Type} title={`Keyword Trend: "${activeKeyword}"`}>
          {trend.every(t => t.count === 0) ? (
            <p className="text-slate-400 text-xs font-semibold text-center py-6">No dated mentions of this keyword yet.</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={28} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
