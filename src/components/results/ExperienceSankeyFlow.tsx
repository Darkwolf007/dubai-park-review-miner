import { useMemo } from 'react';
import { ResponsiveContainer, Sankey, Tooltip, Rectangle, Layer } from 'recharts';
import { Waypoints } from 'lucide-react';
import type { ArchetypeExperienceRow, AgeGroupTier } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';

// Validated against dataviz-skill's validate_palette.js (light mode, white surface): all checks
// pass (worst adjacent CVD ΔE 6.9, normal-vision floor 23.3) -- the app's original Teens color
// (violet #8b5cf6) was swapped for teal because it sat at CVD ΔE 0.8 against Adults' indigo.
export const AGE_TIER_COLOR: Record<AgeGroupTier, string> = {
  Kids: '#ec4899',
  Teens: '#0d9488',
  Adults: '#6366f1',
  Old: '#f59e0b'
};
const NEUTRAL_NODE_COLOR = '#94a3b8';

type ColKey = 'age' | 'archetype' | 'activity' | 'experience' | 'space' | 'score' | 'cost';

interface FlowNode {
  name: string;
  colKey: ColKey;
}

interface FlowLink {
  source: number;
  target: number;
  value: number;
  dominantTier: AgeGroupTier;
}

/**
 * One node per unique value within each of the 6 downstream tiers (age group is the persona;
 * archetype/activity/experience/space/score/cost each collapse to their own node so convergence --
 * multiple archetypes sharing one space, one score band, one cost rate -- shows as several links
 * merging into a single wider node, which is the whole point of this diagram).
 *
 * Link color is "dominant-tier attribution": when a link aggregates flow from more than one age
 * group (e.g. two different archetypes both leading to the same Activity node), it's colored by
 * whichever age group contributes the most area to it -- an approximation, disclosed in the caption,
 * not a claim that the link belongs to one tier exclusively.
 */
function buildSankeyData(rows: ArchetypeExperienceRow[]) {
  const nodeIndex = new Map<string, number>();
  const nodes: FlowNode[] = [];
  function ensureNode(colKey: ColKey, name: string): number {
    const key = `${colKey}::${name}`;
    if (!nodeIndex.has(key)) {
      nodeIndex.set(key, nodes.length);
      nodes.push({ name, colKey });
    }
    return nodeIndex.get(key)!;
  }

  const linkAgg = new Map<string, { value: number; byTier: Record<AgeGroupTier, number> }>();
  function addLink(sourceIdx: number, targetIdx: number, value: number, tier: AgeGroupTier) {
    const key = `${sourceIdx}->${targetIdx}`;
    const entry = linkAgg.get(key) || { value: 0, byTier: { Kids: 0, Teens: 0, Adults: 0, Old: 0 } };
    entry.value += value;
    entry.byTier[tier] += value;
    linkAgg.set(key, entry);
  }

  rows.forEach(r => {
    const tier = r.tier_1_age_group;
    const value = Math.max(1, r.tier_5_assigned_space.target_area_m2 || 1);
    const t6 = r.tier_6_spatial_properties_and_scores;

    const ageIdx = ensureNode('age', tier);
    const archIdx = ensureNode('archetype', r.tier_2_archetype);
    const activityIdx = ensureNode('activity', r.tier_3_activities[0] || 'General Activity');
    const expIdx = ensureNode('experience', r.tier_4_experience_tag);
    const spaceIdx = ensureNode('space', r.tier_5_assigned_space.space_name);
    const scoreIdx = ensureNode('score', `${t6.spatial_score_band} Priority`);
    const costIdx = ensureNode('cost', `AED ${t6.cost_rate_aed_per_m2}/m2`);

    addLink(ageIdx, archIdx, value, tier);
    addLink(archIdx, activityIdx, value, tier);
    addLink(activityIdx, expIdx, value, tier);
    addLink(expIdx, spaceIdx, value, tier);
    addLink(spaceIdx, scoreIdx, value, tier);
    addLink(scoreIdx, costIdx, value, tier);
  });

  const links: FlowLink[] = [...linkAgg.entries()].map(([key, entry]) => {
    const [source, target] = key.split('->').map(Number);
    const dominantTier = (Object.entries(entry.byTier) as [AgeGroupTier, number][]).sort((a, b) => b[1] - a[1])[0][0];
    return { source, target, value: entry.value, dominantTier };
  });

  return { nodes, links };
}

function FlowNodeShape(props: any) {
  const { x, y, width, height, payload, containerWidth } = props;
  const node: FlowNode = payload;
  const fill = node.colKey === 'age' ? AGE_TIER_COLOR[node.name as AgeGroupTier] || NEUTRAL_NODE_COLOR : NEUTRAL_NODE_COLOR;
  const isRightHalf = x + width / 2 > (containerWidth || 0) / 2;
  const label = node.name.length > 26 ? `${node.name.slice(0, 24)}...` : node.name;
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.9} />
      {height > 10 && (
        <text
          x={isRightHalf ? x - 6 : x + width + 6}
          y={y + height / 2}
          textAnchor={isRightHalf ? 'end' : 'start'}
          dominantBaseline="middle"
          fontSize={9}
          fontWeight={700}
          fill="#334155"
        >
          {label}
        </text>
      )}
    </Layer>
  );
}

function FlowLinkShape(props: any) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload } = props;
  const link: FlowLink = payload;
  const color = AGE_TIER_COLOR[link.dominantTier] || NEUTRAL_NODE_COLOR;
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.35}
    />
  );
}

const COLUMN_LABELS: { key: ColKey; label: string }[] = [
  { key: 'age', label: 'Age Group (Persona)' },
  { key: 'archetype', label: 'User Archetype' },
  { key: 'activity', label: 'Core Activity' },
  { key: 'experience', label: 'Desired Experience' },
  { key: 'space', label: 'Usable Space & Amenities' },
  { key: 'score', label: 'Spatial Score' },
  { key: 'cost', label: 'Cost / m2' }
];

export function ExperienceSankeyFlow({ rows }: { rows: ArchetypeExperienceRow[] }) {
  const data = useMemo(() => buildSankeyData(rows), [rows]);

  return (
    <SectionCard icon={Waypoints} title="Experience Flow: Age Group -> Archetype -> Activity -> Experience -> Usable Space & Amenities -> Spatial Score -> Cost">
      <p className="text-[9px] text-slate-400 mb-2">
        One flow diagram, six hops. Link width is each row's target_area_m2; link color follows the age group contributing the most
        area to that flow (an approximation once multiple age groups converge on the same downstream node -- convergence itself is
        the point: several streams merging into one wide node is where archetypes share a space, score band, or cost tier).
      </p>
      <div className="flex justify-between px-1 mb-1">
        {COLUMN_LABELS.map(c => (
          <span key={c.key} className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{c.label}</span>
        ))}
      </div>
      <div className="h-[560px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            node={FlowNodeShape as any}
            link={FlowLinkShape as any}
            nodePadding={14}
            nodeWidth={10}
            margin={{ top: 8, right: 140, bottom: 8, left: 90 }}
          >
            <Tooltip
              formatter={(value: number) => [`${value.toLocaleString()} m2`, 'Area']}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {(Object.keys(AGE_TIER_COLOR) as AgeGroupTier[]).map(tier => (
          <div key={tier} className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: AGE_TIER_COLOR[tier] }} />
            {tier}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
