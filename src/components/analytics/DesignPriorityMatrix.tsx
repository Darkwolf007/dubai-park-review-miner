import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { costToNumber, type OpportunityResult } from '../../lib/analytics/interventions';

export function DesignPriorityMatrix({ results }: { results: OpportunityResult[] }) {
  const data = results.map(r => ({
    x: costToNumber(r.cost),
    y: r.score,
    label: r.label,
    insufficientData: r.insufficientData
  }));

  return (
    <div className="relative">
      <div className="absolute top-1 left-10 text-[8px] font-bold uppercase tracking-wider text-emerald-600 z-10">Quick Wins</div>
      <div className="absolute top-1 right-2 text-[8px] font-bold uppercase tracking-wider text-indigo-600 z-10">Strategic Investments</div>
      <div className="absolute bottom-10 left-10 text-[8px] font-bold uppercase tracking-wider text-slate-400 z-10">Low Priority</div>
      <div className="absolute bottom-10 right-2 text-[8px] font-bold uppercase tracking-wider text-amber-600 z-10">Future Vision</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis
              type="number" dataKey="x" name="Implementation Cost" domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#64748b' }}
              label={{ value: 'Implementation Cost →', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#64748b' }}
            />
            <YAxis
              type="number" dataKey="y" name="Impact" domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#64748b' }}
              label={{ value: 'Impact →', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#64748b' }}
            />
            <ZAxis range={[80, 80]} />
            <ReferenceLine x={50} stroke="#cbd5e1" strokeDasharray="4 4" />
            <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" />
            <RechartsTooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as { label: string; y: number; x: number };
                return (
                  <div className="bg-white border border-slate-200 rounded p-1.5 text-[9px] shadow">
                    <p className="font-bold text-slate-700">{point.label}</p>
                    <p className="text-slate-500">Impact: {point.y} · Cost score: {point.x}</p>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill="#6366f1">
              {data.map((d, i) => (
                <Cell key={i} fill={d.insufficientData ? '#cbd5e1' : '#6366f1'} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
