import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { computeParkTimeSeries, computeTopicEvolution, TREND_METRICS, type TrendGranularity, type TrendMetric } from '../../lib/analytics/trends';
import { getParkColor } from '../../lib/analytics/parkColors';
import { getCategoryColor } from '../../lib/analytics/categoryColors';
import { SectionCard } from '../ui/SectionCard';

const GRANULARITIES: { id: TrendGranularity; label: string }[] = [
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Yearly' }
];

const OTHER_COLOR = '#94a3b8';

export function TrendAnalysis({
  reviewsByPark,
  selectedParks,
  allParks,
  allReviews
}: {
  reviewsByPark: Record<string, NLPAnalyzedReview[]>;
  selectedParks: ParkDetails[];
  allParks: ParkDetails[];
  allReviews: NLPAnalyzedReview[];
}) {
  const [granularity, setGranularity] = useState<TrendGranularity>('month');
  const [metric, setMetric] = useState<TrendMetric>('avgRating');

  const series = useMemo(() => computeParkTimeSeries(reviewsByPark, granularity, metric), [reviewsByPark, granularity, metric]);
  const chartData = useMemo(() => series.map(point => ({
    period: point.period,
    ...point.valuesByPark,
    dubaiAverage: point.dubaiAverage
  })), [series]);

  const showDirectLabels = selectedParks.length <= 4;
  const metricLabel = TREND_METRICS.find(m => m.id === metric)?.label || metric;

  const evolutionData = useMemo(() => computeTopicEvolution(allReviews, granularity), [allReviews, granularity]);
  const topCategories = useMemo(() => {
    const totals = new Map<string, number>();
    evolutionData.forEach(p => Object.entries(p.shares).forEach(([cat, share]) => totals.set(cat, (totals.get(cat) || 0) + share)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  }, [evolutionData]);
  const evolutionChartData = useMemo(() => evolutionData.map(p => {
    const row: Record<string, string | number> = { period: p.period };
    let otherShare = 0;
    Object.entries(p.shares).forEach(([cat, share]) => {
      if (topCategories.includes(cat)) row[cat] = Math.round(share * 1000) / 10;
      else otherShare += share;
    });
    row.other = Math.round(otherShare * 1000) / 10;
    return row;
  }), [evolutionData, topCategories]);

  return (
    <div className="space-y-3">
      <SectionCard
        icon={TrendingUp}
        title="Park Trends Over Time"
        action={
          <div className="flex items-center gap-2">
            <select value={metric} onChange={e => setMetric(e.target.value as TrendMetric)} className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white">
              {TREND_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="flex gap-1 bg-slate-100 rounded p-0.5">
              {GRANULARITIES.map(g => (
                <button
                  key={g.id}
                  onClick={() => setGranularity(g.id)}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all ${
                    granularity === g.id ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {chartData.length === 0 ? (
          <p className="text-slate-400 text-xs font-semibold text-center py-10">No reviews with a usable date in this selection yet.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 40, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={32} />
                <RechartsTooltip
                  cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                  contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
                {selectedParks.map(park => {
                  const color = getParkColor(park.placeId, allParks);
                  return (
                    <Line
                      key={park.placeId}
                      type="monotone"
                      dataKey={park.placeId}
                      name={park.name}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                      label={showDirectLabels ? (props: any) => {
                        if (props.index !== chartData.length - 1 || props.value == null) return null;
                        return (
                          <text x={props.x + 4} y={props.y} dy={3} fontSize={9} fontWeight={700} fill={color}>
                            {park.name}
                          </text>
                        );
                      } : undefined}
                    />
                  );
                })}
                <Line
                  type="monotone"
                  dataKey="dubaiAverage"
                  name="Dubai Average"
                  stroke="#0b0b0b"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[9px] text-slate-400 font-semibold mt-1">
          {metricLabel} by park, {granularity}. "Dubai Average" is computed across all reviews from all selected parks combined for each period, not an average of averages.
        </p>
      </SectionCard>

      <SectionCard icon={TrendingUp} title="Topic Evolution Over Time">
        {evolutionChartData.length === 0 ? (
          <p className="text-slate-400 text-xs font-semibold text-center py-10">No reviews with a usable date in this selection yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolutionChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={32} unit="%" />
                <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
                {topCategories.map(cat => (
                  <Area key={cat} type="monotone" dataKey={cat} name={cat} stackId="1" stroke={getCategoryColor(cat)} fill={getCategoryColor(cat)} fillOpacity={0.75} />
                ))}
                <Area type="monotone" dataKey="other" name="Other" stackId="1" stroke={OTHER_COLOR} fill={OTHER_COLOR} fillOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[9px] text-slate-400 font-semibold mt-1">Share of reviews mentioning each issue category per period, combined across selected parks (top 6 categories shown).</p>
      </SectionCard>
    </div>
  );
}
