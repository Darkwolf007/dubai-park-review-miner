const CATEGORY_COLORS: Record<string, string> = {
  'shade / heat comfort': 'bg-orange-50 border-orange-200 text-orange-700',
  'toilets': 'bg-rose-50 border-rose-200 text-rose-700',
  'cleanliness': 'bg-amber-50 border-amber-200 text-amber-700',
  'parking': 'bg-blue-50 border-blue-200 text-blue-700',
  'safety': 'bg-purple-50 border-purple-200 text-purple-700',
  'playground': 'bg-pink-50 border-pink-200 text-pink-700',
  'accessibility': 'bg-teal-50 border-teal-200 text-teal-700',
  'lighting': 'bg-yellow-50 border-yellow-200 text-yellow-700',
  'crowding': 'bg-indigo-50 border-indigo-200 text-indigo-700',
  'maintenance': 'bg-red-50 border-red-200 text-red-700',
  'seating': 'bg-stone-50 border-stone-200 text-stone-700',
  'sports facilities': 'bg-emerald-50 border-emerald-200 text-emerald-700',
  'pets': 'bg-amber-50 border-amber-100 text-amber-800',
  'food / cafe': 'bg-orange-50 border-orange-100 text-orange-800',
  'water features': 'bg-cyan-50 border-cyan-200 text-cyan-700',
  'landscape / greenery': 'bg-lime-50 border-lime-200 text-lime-700',
  'pests / mosquitoes': 'bg-green-50 border-green-200 text-green-700',
  'wayfinding / signage': 'bg-violet-50 border-violet-200 text-violet-700',
  'noise': 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
  'opening hours / operations': 'bg-sky-50 border-sky-200 text-sky-700'
};
const DEFAULT_CATEGORY_COLOR = 'bg-indigo-50 border-indigo-200 text-indigo-700';

const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  NEGATIVE: 'bg-rose-50 border-rose-200 text-rose-800',
  NEUTRAL: 'bg-slate-100 border-slate-200 text-slate-800'
};

const PRIORITY_COLORS: Record<string, string> = {
  'Very High': 'bg-red-50 border-red-200 text-red-700',
  'High': 'bg-orange-50 border-orange-200 text-orange-700',
  'Medium': 'bg-amber-50 border-amber-200 text-amber-700',
  'Low': 'bg-slate-100 border-slate-200 text-slate-600'
};

export type PillVariant = 'category' | 'sentiment' | 'priority';

export function Pill({ variant, value, dot = false }: { variant: PillVariant; value: string; dot?: boolean }) {
  const colorMap = variant === 'category' ? CATEGORY_COLORS : variant === 'sentiment' ? SENTIMENT_COLORS : PRIORITY_COLORS;
  const colorClass = colorMap[value] || DEFAULT_CATEGORY_COLOR;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border capitalize leading-none ${colorClass}`}>
      {dot && <span className="w-1 h-1 rounded-full bg-current"></span>}
      <span>{value}</span>
    </span>
  );
}
