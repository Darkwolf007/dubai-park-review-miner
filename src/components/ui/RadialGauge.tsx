import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';

function gaugeColor(score: number): string {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#6366f1';
  if (score >= 25) return '#f59e0b';
  return '#f43f5e';
}

export function RadialGauge({ score, size = 140 }: { score: number; size?: number }) {
  const data = [{ name: 'score', value: score, fill: gaugeColor(score) }];
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size}
        height={size}
        cx="50%"
        cy="50%"
        innerRadius="70%"
        outerRadius="100%"
        barSize={10}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: '#f1f5f9' }} dataKey="value" cornerRadius={6} />
      </RadialBarChart>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-extrabold text-slate-800 leading-none">{Math.round(score)}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}
