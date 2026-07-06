import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { computeParkBenchmark } from '../../lib/analytics/benchmark';
import { getParkColor } from '../../lib/analytics/parkColors';
import { SectionCard } from '../ui/SectionCard';

export function BenchmarkDashboard({
  reviewsByPark,
  selectedParks,
  allParks
}: {
  reviewsByPark: Record<string, NLPAnalyzedReview[]>;
  selectedParks: ParkDetails[];
  allParks: ParkDetails[];
}) {
  const benchmark = useMemo(() => computeParkBenchmark(reviewsByPark), [reviewsByPark]);

  const radarData = useMemo(() => benchmark.subscoreRows.map(row => {
    const point: Record<string, string | number> = { subject: row.label };
    selectedParks.forEach(p => { point[p.placeId] = row.scoresByPark[p.placeId] ?? 0; });
    return point;
  }), [benchmark, selectedParks]);

  if (selectedParks.length < 2) {
    return (
      <SectionCard icon={Scale} title="Benchmark Dashboard">
        <p className="text-slate-400 text-xs font-semibold text-center py-10">Select at least 2 parks to benchmark them against each other.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-3">
      <SectionCard icon={Scale} title="Benchmark Radar">
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: '#64748b' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} axisLine={false} />
              {selectedParks.map(p => (
                <Radar
                  key={p.placeId}
                  name={p.name}
                  dataKey={p.placeId}
                  stroke={getParkColor(p.placeId, allParks)}
                  fill={getParkColor(p.placeId, allParks)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={Scale} title="Benchmark Comparison">
        <div className="h-72 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={radarData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="subject" tick={{ fontSize: 8, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} width={28} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }} />
              {selectedParks.map(p => (
                <Bar key={p.placeId} dataKey={p.placeId} name={p.name} fill={getParkColor(p.placeId, allParks)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9px]">
                <th className="py-1.5 pr-3 font-bold">Dimension</th>
                {selectedParks.map(p => (
                  <th key={p.placeId} className="py-1.5 px-3 font-bold text-right" style={{ color: getParkColor(p.placeId, allParks) }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benchmark.subscoreRows.map(row => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{row.label}</td>
                  {selectedParks.map(p => (
                    <td key={p.placeId} className="py-2 px-3 text-right font-mono text-slate-600">{row.scoresByPark[p.placeId] ?? 0}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 font-bold">
                <td className="py-2 pr-3 text-slate-800">Overall</td>
                {selectedParks.map(p => (
                  <td key={p.placeId} className="py-2 px-3 text-right font-mono text-slate-800">{benchmark.overallByPark[p.placeId] ?? 0}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
