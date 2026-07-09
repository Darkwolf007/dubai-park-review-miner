import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import type { H3Feature } from '../../lib/gis/types';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeIssueImpact, sortIssueImpact } from '../../lib/analytics/issueMatrix';
import { SectionCard } from '../ui/SectionCard';
import { RadialGauge } from '../ui/RadialGauge';

const AMENITY_AXES: { key: keyof H3Feature['properties']; label: string }[] = [
  { key: 'school_count', label: 'Schools' },
  { key: 'hospital_count', label: 'Hospitals' },
  { key: 'mosque_count', label: 'Mosques' },
  { key: 'clinic_count', label: 'Clinics' },
  { key: 'playground_count', label: 'Playgrounds' },
  { key: 'sports_count', label: 'Sports' },
  { key: 'bus_stop_count', label: 'Bus Stops' },
  { key: 'shop_count', label: 'Shops' }
];

function bucketHistogram(values: number[], bucketCount: number): { bucket: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const size = (max - min) / bucketCount || 1;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${Math.round(min + i * size)}-${Math.round(min + (i + 1) * size)}`,
    count: 0
  }));
  values.forEach(v => {
    const idx = Math.min(bucketCount - 1, Math.floor((v - min) / size));
    buckets[idx].count++;
  });
  return buckets;
}

export function PlaygroundCharts({
  hexes,
  reviews,
  walkabilityScore
}: {
  hexes: H3Feature[];
  reviews: NLPAnalyzedReview[];
  walkabilityScore: number | null;
}) {
  const populationHistogram = useMemo(() => bucketHistogram(hexes.map(h => h.properties.population), 8), [hexes]);

  const amenityRadarData = useMemo(() => AMENITY_AXES.map(a => ({
    subject: a.label,
    value: hexes.reduce((s, h) => s + (Number(h.properties[a.key]) || 0), 0)
  })), [hexes]);

  const buildingDensityData = useMemo(
    () => [...hexes].sort((a, b) => b.properties.building_coverage_pct - a.properties.building_coverage_pct).slice(0, 10)
      .map(h => ({ id: h.properties.h3_id.slice(-6), coverage: Math.round(h.properties.building_coverage_pct * 10) / 10 })),
    [hexes]
  );

  const greenCoverageHistogram = useMemo(() => bucketHistogram(hexes.map(h => h.properties.green_coverage_pct), 6), [hexes]);

  const parkDemandRanking = useMemo(() => {
    const withDemand = hexes.map(h => ({
      id: h.properties.h3_id.slice(-6),
      demand: Math.round((h.properties.pop_density_km2 / 100) * (1 - h.properties.green_coverage_pct / 100) * 10) / 10
    }));
    return withDemand.sort((a, b) => b.demand - a.demand).slice(0, 10);
  }, [hexes]);

  const reviewCategoryData = useMemo(() => sortIssueImpact(computeIssueImpact(reviews), 'frequency').slice(0, 10)
    .map(r => ({ category: r.category, mentions: r.mentions })), [reviews]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <SectionCard icon={BarChart3} title="Population Histogram">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={populationHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 8, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#4a3aa7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Amenity Radar">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={amenityRadarData} outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: '#64748b' }} />
              <PolarRadiusAxis tick={{ fontSize: 7 }} axisLine={false} />
              <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Building Density (Top 10 Hexes)">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buildingDensityData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="id" tick={{ fontSize: 8, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} unit="%" />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="coverage" fill="#eb6834" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Green Coverage Distribution">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={greenCoverageHistogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 8, fill: '#64748b' }} unit="%" />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" fill="#008300" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Walkability Score">
        <div className="h-56 flex items-center justify-center">
          {walkabilityScore !== null ? (
            <RadialGauge score={walkabilityScore} />
          ) : (
            <p className="text-slate-400 text-xs font-semibold">Run Accessibility Analysis first.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Park Demand Ranking (Heuristic)">
        <p className="text-[8px] text-slate-400 mb-1">High population density + low green coverage = high demand. A heuristic composite, not a validated demand model.</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={parkDemandRanking} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis type="category" dataKey="id" width={50} tick={{ fontSize: 8, fill: '#334155' }} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="demand" fill="#e87ba4" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart3} title="Review Category Distribution" className="lg:col-span-2">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reviewCategoryData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 8, fill: '#64748b' }} angle={-30} textAnchor="end" interval={0} height={60} />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} width={24} />
              <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="mentions" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
