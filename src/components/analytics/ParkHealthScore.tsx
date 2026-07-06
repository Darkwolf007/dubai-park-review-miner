import { useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { computeHealthScore } from '../../lib/analytics/healthScore';
import { SectionCard } from '../ui/SectionCard';
import { RadialGauge } from '../ui/RadialGauge';

const ALL_PARKS_ID = '__all__';

export function ParkHealthScore({
  reviewsByPark,
  selectedParks,
  allReviews
}: {
  reviewsByPark: Record<string, NLPAnalyzedReview[]>;
  selectedParks: ParkDetails[];
  allReviews: NLPAnalyzedReview[];
}) {
  const [activeParkId, setActiveParkId] = useState<string>(ALL_PARKS_ID);

  const activeReviews = activeParkId === ALL_PARKS_ID ? allReviews : (reviewsByPark[activeParkId] || []);
  const result = useMemo(() => computeHealthScore(activeReviews), [activeReviews]);
  const radarData = useMemo(() => result.subscores.map(s => ({ subject: s.label, score: s.score })), [result]);

  return (
    <SectionCard
      icon={HeartPulse}
      title="Park Health Score"
      action={
        <select
          value={activeParkId}
          onChange={e => setActiveParkId(e.target.value)}
          className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white"
        >
          <option value={ALL_PARKS_ID}>All Selected Parks Combined</option>
          {selectedParks.map(p => (
            <option key={p.placeId} value={p.placeId}>{p.name}</option>
          ))}
        </select>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 flex flex-col items-center justify-center gap-2">
          <RadialGauge score={result.overall} />
          <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold text-center">
            Equal-weighted mean of 11 dimensions
          </span>
        </div>

        <div className="lg:col-span-4 space-y-1.5 self-center">
          {result.subscores.map(s => (
            <div key={s.key}>
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                <span className="flex items-center gap-1">
                  {s.label}
                  {s.lowSample && <span className="text-amber-500 normal-case font-semibold">(low sample)</span>}
                </span>
                <span className="text-slate-700">{s.score}</span>
              </div>
              <div className="bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s.score >= 75 ? 'bg-emerald-500' : s.score >= 50 ? 'bg-indigo-500' : s.score >= 25 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${s.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-5 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: '#64748b' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} axisLine={false} />
              <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  );
}
