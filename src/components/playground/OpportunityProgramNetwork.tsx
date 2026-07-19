import { useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeMouseHandler, type EdgeMouseHandler, type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { forceSimulation, forceLink, forceManyBody, forceCollide, type SimulationNodeDatum } from 'd3-force';
import { Network } from 'lucide-react';
import type { OpportunityResult, OpportunityType, OpportunityCategory } from '../../lib/gis/opportunityEngine';
import { SectionCard } from '../ui/SectionCard';

/** Categorical palette (dataviz skill reference order, 8 fixed hues) -- one slot per Opportunity Lab
 * category. Past 4 series the skill requires secondary encoding, not color alone: every node also
 * carries its category as text in the legend, tooltip, and detail panel below. */
const CATEGORY_COLOR: Record<OpportunityCategory, string> = {
  'Arrival / Access': '#2a78d6',
  Movement: '#008300',
  Play: '#e87ba4',
  'Sports / Wellness': '#eda100',
  'Community / Social': '#1baf7a',
  'Landscape / Environment': '#eb6834',
  'Comfort / Amenities': '#4a3aa7',
  'Smart / Operations': '#e34948'
};
const CATEGORY_LIST = Object.keys(CATEGORY_COLOR) as OpportunityCategory[];

type AdjacencyRelation = 'preferred' | 'avoid' | 'service' | 'movement';
const ALL_RELATIONS: AdjacencyRelation[] = ['preferred', 'avoid', 'movement', 'service'];

const RELATION_STYLE: Record<AdjacencyRelation, { stroke: string; dash?: string; width: number; opacity: number }> = {
  preferred: { stroke: '#4338ca', width: 1.5, opacity: 0.7 },
  avoid: { stroke: '#e34948', dash: '4 3', width: 1.5, opacity: 0.65 },
  service: { stroke: '#94a3b8', width: 1, opacity: 0.45 },
  movement: { stroke: '#1baf7a', width: 1.5, opacity: 0.7 }
};

const RELATION_LABEL: Record<AdjacencyRelation, string> = {
  preferred: 'Preferred adjacency',
  avoid: 'Avoid adjacency',
  service: 'Service adjacency',
  movement: 'Movement connection'
};

function relationReason(relation: AdjacencyRelation, source: OpportunityResult, target: OpportunityResult): string {
  switch (relation) {
    case 'preferred':
      return `Co-locating ${source.name} and ${target.name} supports shared users/activity and reduces walking distance between related functions.`;
    case 'avoid':
      return `${source.name} and ${target.name} have conflicting activity, noise, or comfort requirements -- kept apart to protect both experiences.`;
    case 'service':
      return `${source.name} needs operational/maintenance access from ${target.name} without cutting through main social or quiet areas.`;
    case 'movement':
      return `${source.name} and ${target.name} form part of the same circulation network and are expected to connect directly.`;
  }
}

interface SimNode extends SimulationNodeDatum {
  id: OpportunityType;
}
interface RawEdge {
  source: OpportunityType;
  target: OpportunityType;
  relation: AdjacencyRelation;
}

function radiusFor(result: OpportunityResult): number {
  return 10 + (result.opportunityScore / 100) * 10; // 10-20px -- smaller now that labels sit outside the dot
}

/** Builds the deduplicated edge list from each program's own adjacency arrays (opportunityEngine.ts)
 * -- an edge is declared by either endpoint, so A-preferred-B and B-preferred-A collapse to one. */
function buildEdges(results: OpportunityResult[]): RawEdge[] {
  const known = new Set(results.map(r => r.type));
  const seen = new Set<string>();
  const edges: RawEdge[] = [];
  const add = (source: OpportunityType, target: OpportunityType, relation: AdjacencyRelation) => {
    if (!known.has(target) || source === target) return;
    const key = [source, target].sort().join('|') + `|${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, relation });
  };
  results.forEach(r => {
    r.grasshopperInputs.adjacencyRules.preferred.forEach(t => add(r.type, t as OpportunityType, 'preferred'));
    r.grasshopperInputs.adjacencyRules.avoid.forEach(t => add(r.type, t as OpportunityType, 'avoid'));
    r.grasshopperInputs.adjacencyRules.service.forEach(t => add(r.type, t as OpportunityType, 'service'));
    r.grasshopperInputs.adjacencyRules.movement.forEach(t => add(r.type, t as OpportunityType, 'movement'));
  });
  return edges;
}

/** Fixed anchor point per category, arranged evenly on a ring -- fed to a custom clustering force
 * below so same-category programs visually group together instead of scattering randomly. This is
 * what turns the graph from a tangled blob into a readable "flower" organized by category. */
const CLUSTER_RADIUS = 210;
const CANVAS_CENTER = { x: 340, y: 280 };
const CATEGORY_ANCHOR: Record<OpportunityCategory, { x: number; y: number }> = CATEGORY_LIST.reduce((acc, cat, i) => {
  const angle = (2 * Math.PI * i) / CATEGORY_LIST.length - Math.PI / 2;
  acc[cat] = { x: CANVAS_CENTER.x + CLUSTER_RADIUS * Math.cos(angle), y: CANVAS_CENTER.y + CLUSTER_RADIUS * Math.sin(angle) };
  return acc;
}, {} as Record<OpportunityCategory, { x: number; y: number }>);

function forceCluster(byType: Map<OpportunityType, OpportunityResult>, strength: number) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    nodes.forEach(n => {
      const category = byType.get(n.id)?.category;
      if (!category) return;
      const anchor = CATEGORY_ANCHOR[category];
      n.vx = (n.vx ?? 0) + (anchor.x - (n.x ?? 0)) * strength * alpha;
      n.vy = (n.vy ?? 0) + (anchor.y - (n.y ?? 0)) * strength * alpha;
    });
  };
  force.initialize = (_nodes: SimNode[]) => { nodes = _nodes; };
  return force;
}

/** Custom node: a colored dot (category color, sized by opportunity score) with the program name as
 * a real, readable label rendered OUTSIDE the dot -- the previous version crammed full names into
 * 7px text inside a 16-32px circle, which is what made the graph unreadable. Center-positioned,
 * invisible handles (both source and target) give clean straight edges that radiate from each node's
 * true center and disappear behind its opaque circle, without needing directional top/bottom ports. */
function ProgramNode({ data }: NodeProps) {
  const { label, color, radius, isSelected, isDimmed } = data as {
    label: string; color: string; radius: number; isSelected: boolean; isDimmed: boolean;
  };
  const handleStyle = { opacity: 0, width: 1, height: 1, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' as const };
  return (
    <div style={{ opacity: isDimmed ? 0.22 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 92, cursor: 'pointer' }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: 9999,
          background: color,
          border: isSelected ? '3px solid #0f172a' : '2px solid #fff',
          boxShadow: isSelected ? '0 0 0 3px rgba(15,23,42,0.15)' : '0 1px 3px rgba(15,23,42,0.35)'
        }}
      />
      <div
        style={{
          marginTop: 4,
          fontSize: 9,
          fontWeight: 700,
          textAlign: 'center',
          color: '#1e293b',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(148,163,184,0.4)',
          borderRadius: 4,
          padding: '1px 4px',
          lineHeight: 1.25,
          maxWidth: 92
        }}
      >
        {label}
      </div>
    </div>
  );
}

const NODE_TYPES = { program: ProgramNode };

export function OpportunityProgramNetwork({
  allResults,
  selectedType,
  onSelectProgram
}: {
  allResults: OpportunityResult[];
  selectedType: OpportunityType | null;
  onSelectProgram: (type: OpportunityType) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ kind: 'node'; result: OpportunityResult } | { kind: 'edge'; edge: RawEdge } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeRelations, setActiveRelations] = useState<Set<AdjacencyRelation>>(new Set(ALL_RELATIONS));

  const byType = useMemo(() => new Map(allResults.map(r => [r.type, r])), [allResults]);
  const rawEdges = useMemo(() => buildEdges(allResults), [allResults]);
  const visibleEdges = useMemo(() => rawEdges.filter(e => activeRelations.has(e.relation)), [rawEdges, activeRelations]);

  // Static force-directed layout: run the simulation to convergence once (manual ticks), not a live
  // animation loop, so the graph reads as a stable diagram rather than a bouncing physics toy. A
  // clustering force pulls same-category nodes toward a shared anchor so the result reads as 8
  // organized groups, not a random tangle -- edges between groups still show real cross-category
  // adjacency.
  const positions = useMemo(() => {
    const simNodes: SimNode[] = allResults.map(r => ({ id: r.type }));
    // forceLink mutates each link's source/target in place (string id -> resolved node object) --
    // clone the links here so the original rawEdges (reused below to build React Flow's edges, which
    // need plain string source/target) are never touched by the simulation.
    const simLinks = rawEdges.map(e => ({ ...e }));
    const simulation = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d: any) => d.id).distance(60).strength(0.15))
      .force('charge', forceManyBody().strength(-90))
      .force('cluster', forceCluster(byType, 0.25))
      .force('collide', forceCollide().radius((d: any) => radiusFor(byType.get(d.id)!) + 26))
      .stop();
    for (let i = 0; i < 400; i++) simulation.tick();
    return new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, rawEdges, byType]);

  const hoveredType = hover?.kind === 'node' ? hover.result.type : null;
  const highlightFrom = hoveredType ?? selectedType;

  const connectedTypes = useMemo(() => {
    if (!highlightFrom) return null;
    const set = new Set<OpportunityType>([highlightFrom]);
    rawEdges.forEach(e => {
      if (e.source === highlightFrom) set.add(e.target);
      if (e.target === highlightFrom) set.add(e.source);
    });
    return set;
  }, [highlightFrom, rawEdges]);

  const nodes: Node[] = useMemo(() => allResults.map(r => {
    const pos = positions.get(r.type) ?? { x: 0, y: 0 };
    const isSelected = r.type === selectedType;
    const isDimmed = connectedTypes ? !connectedTypes.has(r.type) : false;
    return {
      id: r.type,
      type: 'program',
      position: { x: pos.x, y: pos.y },
      data: { label: r.name, color: CATEGORY_COLOR[r.category], radius: radiusFor(r), isSelected, isDimmed },
      draggable: false
    };
  }), [allResults, positions, selectedType, connectedTypes]);

  const edges: Edge[] = useMemo(() => visibleEdges.map((e, i) => {
    const style = RELATION_STYLE[e.relation];
    const isDimmed = connectedTypes ? !(connectedTypes.has(e.source) && connectedTypes.has(e.target)) : false;
    return {
      id: `${e.source}-${e.target}-${e.relation}-${i}`,
      source: e.source,
      target: e.target,
      type: 'straight',
      animated: e.relation === 'preferred' && !isDimmed,
      style: { stroke: style.stroke, strokeWidth: style.width, strokeDasharray: style.dash, opacity: isDimmed ? 0.06 : style.opacity }
    };
  }), [visibleEdges, connectedTypes]);

  const handleNodeClick: NodeMouseHandler = (_e, node) => onSelectProgram(node.id as OpportunityType);
  const handleNodeEnter: NodeMouseHandler = (e, node) => {
    const result = byType.get(node.id as OpportunityType);
    if (result) setHover({ kind: 'node', result });
    updateCursor(e);
  };
  const handleEdgeEnter: EdgeMouseHandler = (e, edge) => {
    const raw = visibleEdges.find((_, i) => `${_.source}-${_.target}-${_.relation}-${i}` === edge.id);
    if (raw) setHover({ kind: 'edge', edge: raw });
    updateCursor(e);
  };
  const clearHover = () => setHover(null);
  function updateCursor(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
  function toggleRelation(rel: AdjacencyRelation) {
    setActiveRelations(prev => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel); else next.add(rel);
      return next.size === 0 ? new Set(ALL_RELATIONS) : next;
    });
  }

  return (
    <SectionCard icon={Network} title="Full Program Adjacency Network">
      <p className="text-[9px] text-slate-500 mb-2">
        All {allResults.length} program elements, clustered by category (color = category, dot size = opportunity score).
        Hover a node to preview its connections; click to select that program below. Toggle relation types below to reduce
        clutter.
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {ALL_RELATIONS.map(rel => {
          const style = RELATION_STYLE[rel];
          const active = activeRelations.has(rel);
          return (
            <button
              key={rel}
              onClick={() => toggleRelation(rel)}
              className={`flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold rounded border transition-colors ${
                active ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50'
              }`}
            >
              <span className="w-4 h-0 border-t-2" style={{ borderColor: style.stroke, borderStyle: style.dash ? 'dashed' : 'solid' }} />
              {RELATION_LABEL[rel]}
            </button>
          );
        })}
      </div>

      <div ref={containerRef} className="relative h-[600px] border border-slate-200 rounded overflow-hidden bg-slate-50/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeEnter}
          onNodeMouseLeave={clearHover}
          onEdgeMouseEnter={handleEdgeEnter}
          onEdgeMouseLeave={clearHover}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={24} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n: any) => n.data?.color ?? '#94a3b8'}
            maskColor="rgba(241,245,249,0.7)"
            style={{ width: 110, height: 90 }}
          />
        </ReactFlow>

        {hover && (
          <div
            className="absolute z-[500] bg-slate-900 text-white text-[9px] rounded shadow-lg px-2.5 py-2 pointer-events-none max-w-[220px]"
            style={{ left: Math.min(cursor.x + 12, 470), top: Math.max(cursor.y - 8, 4) }}
          >
            {hover.kind === 'node' ? (
              <div className="space-y-0.5">
                <p className="font-bold">{hover.result.name}</p>
                <p className="text-slate-300">{hover.result.category}</p>
                <p className="text-slate-300">Opportunity: <strong className="text-white">{hover.result.opportunityScore}</strong>/100</p>
                <p className="text-slate-300">Users: {hover.result.primaryUsers.slice(0, 2).join(', ')}</p>
                <p className="text-slate-300">Area: {hover.result.recommendedAreaM2 ? `${hover.result.recommendedAreaM2.target.toLocaleString()} m²` : 'N/A'}</p>
                <p className="text-slate-400">Source: {hover.result.source.slice(0, 2).join(', ')}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="font-bold">{RELATION_LABEL[hover.edge.relation]}</p>
                <p className="text-slate-300">{byType.get(hover.edge.source)?.name} &harr; {byType.get(hover.edge.target)?.name}</p>
                <p className="text-slate-300 leading-snug">{relationReason(hover.edge.relation, byType.get(hover.edge.source)!, byType.get(hover.edge.target)!)}</p>
                <p className="text-slate-400">Source: design rule (program adjacency logic), not measured site data.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[9px] text-slate-500">
        {CATEGORY_LIST.map(cat => (
          <span key={cat} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 inline-block rounded-full" style={{ backgroundColor: CATEGORY_COLOR[cat] }} /> {cat}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}
