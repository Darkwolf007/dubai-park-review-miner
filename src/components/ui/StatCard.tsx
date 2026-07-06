import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TrendDirection } from '../../lib/analytics/shared';
import { Sparkline } from './Sparkline';

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendPct,
  sparkline,
  tooltip,
  positiveIsGood = true
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trend: TrendDirection;
  trendPct: number;
  sparkline: number[];
  tooltip: string;
  positiveIsGood?: boolean;
}) {
  const isGoodDirection = trend === 'flat' ? null : (trend === 'up') === positiveIsGood;
  const trendColor = trend === 'flat' ? 'text-slate-400' : isGoodDirection ? 'text-emerald-600' : 'text-rose-600';
  const sparkColor = trend === 'flat' ? '#94a3b8' : isGoodDirection ? '#10b981' : '#f43f5e';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="group relative bg-white p-2.5 rounded border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[92px]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <Icon className="w-3 h-3 text-indigo-600" />
          <span>{label}</span>
        </div>
        <Info className="w-2.5 h-2.5 text-slate-300" />
      </div>

      <div className="flex items-end justify-between gap-2 mt-1.5">
        <span className="text-xl font-extrabold text-slate-800 leading-none">{value}</span>
        <div className="w-16 shrink-0">
          <Sparkline values={sparkline} stroke={sparkColor} />
        </div>
      </div>

      <div className={`flex items-center gap-0.5 mt-1 text-[9px] font-bold ${trendColor}`}>
        <TrendIcon className="w-2.5 h-2.5" />
        <span>{trend === 'flat' ? 'stable' : `${trendPct > 0 ? '+' : ''}${trendPct}%`}</span>
      </div>

      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 w-48 rounded border border-slate-200 bg-slate-900 text-white text-[9px] leading-relaxed p-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
}
