import { useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeMouseHandler, type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { forceSimulation, forceLink, forceManyBody, forceCollide, type SimulationNodeDatum } from 'd3-force';
import { Route, ChevronDown, ChevronRight, Clock, Sun } from 'lucide-react';
import type { SpaceGraphNode, PersonaJourneyGroup, Journey } from '../../lib/gis/resultsSynthesisEngine';
import { SectionCard } from '../ui/SectionCard';

// Same fixed, dataviz-skill-validated categorical order as
// src/components/playground/OpportunityProgramNetwork.tsx -- kept identical so a space reads as
// the same category color everywhere in the app.
const CATEGORY_COLOR: Record<string, string> = {
  'Arrival / Access': '#2a78d6',
  Movement: '#008300',
  Play: '#e87ba4',
  'Sports / Wellness': '#eda100',
  'Community / Social': '#1baf7a',
  'Landscape / Environment': '#eb6834',
  'Comfort / Amenities': '#4a3aa7',
  'Smart / Operations': '#e34948'
};
const CATEGORY_LIST = Object.keys(CATEGORY_COLOR);
const JOURNEY_HIGHLIGHT_COLOR = '#dc2626';
const ADJACENCY_EDGE_COLOR = '#94a3b8';

interface SimNode extends SimulationNodeDatum {
  id: string;
}
interface RawEdge {
  source: string;
  target: string;
}

function radiusFor(node: SpaceGraphNode): number {
  return 8 + (node.journeyPriorityScore / 10) * 14; // 8-22px, driven by how many journeys cross it
}

function buildAdjacencyEdges(nodes: SpaceGraphNode[]): RawEdge[] {
  const known = new Set(nodes.map(n => n.id));
  const seen = new Set<string>();
  const edges: RawEdge[] = [];
  const add = (source: string, target: string) => {
    if (!known.has(target) || source === target) return;
    const key = [source, target].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target });
  };
  nodes.forEach(n => {
    n.adjacency.preferred.forEach(t => add(n.id, t));
    n.adjacency.movement.forEach(t => add(n.id, t));
    n.adjacency.service.forEach(t => add(n.id, t));
  });
  return edges;
}

const CLUSTER_RADIUS = 220;
const CANVAS_CENTER = { x: 340, y: 290 };
const CATEGORY_ANCHOR: Record<string, { x: number; y: number }> = CATEGORY_LIST.reduce((acc, cat, i) => {
  const angle = (2 * Math.PI * i) / CATEGORY_LIST.length - Math.PI / 2;
  acc[cat] = { x: CANVAS_CENTER.x + CLUSTER_RADIUS * Math.cos(angle), y: CANVAS_CENTER.y + CLUSTER_RADIUS * Math.sin(angle) };
  return acc;
}, {} as Record<string, { x: number; y: number }>);

function forceCluster(byId: Map<string, SpaceGraphNode>, strength: number) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    nodes.forEach(n => {
      const anchor = CATEGORY_ANCHOR[byId.get(n.id)?.category || ''];
      if (!anchor) return;
      n.vx = (n.vx ?? 0) + (anchor.x - (n.x ?? 0)) * strength * alpha;
      n.vy = (n.vy ?? 0) + (anchor.y - (n.y ?? 0)) * strength * alpha;
    });
  };
  force.initialize = (_nodes: SimNode[]) => { nodes = _nodes; };
  return force;
}

function SpaceNode({ data }: NodeProps) {
  const { label, color, radius, isOnPath, isDimmed, priorityScore } = data as {
    label: string; color: string; radius: number; isOnPath: boolean; isDimmed: boolean; priorityScore: number;
  };
  const handleStyle = { opacity: 0, width: 1, height: 1, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' as const };
  return (
    <div style={{ opacity: isDimmed ? 0.18 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 92, cursor: 'pointer' }}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: 9999,
          background: color,
          border: isOnPath ? `3px solid ${JOURNEY_HIGHLIGHT_COLOR}` : '2px solid #fff',
          boxShadow: isOnPath ? `0 0 0 3px rgba(220,38,38,0.2)` : '0 1px 3px rgba(15,23,42,0.35)'
        }}
        title={`Journey priority ${priorityScore}/10`}
      />
      <div
        style={{
          marginTop: 4, fontSize: 9, fontWeight: 700, textAlign: 'center', color: '#1e293b',
          background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(148,163,184,0.4)',
          borderRadius: 4, padding: '1px 4px', lineHeight: 1.25, maxWidth: 92
        }}
      >
        {label}
      </div>
    </div>
  );
}

const NODE_TYPES = { space: SpaceNode };

function JourneyRow({ journey, active, onSelect }: { journey: Journey; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 rounded border text-[9px] leading-snug ${active ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
    >
      <div className="font-bold text-slate-700">{journey.label}</div>
      <div className="flex items-center gap-2 text-slate-400 mt-0.5">
        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{journey.timeOfDay}</span>
        <span className="flex items-center gap-0.5"><Sun className="w-2.5 h-2.5" />{journey.season}</span>
        <span>{journey.steps.length} stops</span>
      </div>
    </button>
  );
}

export function SpaceJourneyGraph({ spaceGraph, personaJourneys }: { spaceGraph: SpaceGraphNode[]; personaJourneys: PersonaJourneyGroup[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedArchetype, setExpandedArchetype] = useState<string | null>(personaJourneys[0]?.archetypeKey ?? null);
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const [hoverNode, setHoverNode] = useState<SpaceGraphNode | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const byId = useMemo(() => new Map(spaceGraph.map(n => [n.id, n])), [spaceGraph]);
  const rawEdges = useMemo(() => buildAdjacencyEdges(spaceGraph), [spaceGraph]);

  const positions = useMemo(() => {
    const simNodes: SimNode[] = spaceGraph.map(n => ({ id: n.id }));
    const simLinks = rawEdges.map(e => ({ ...e }));
    const simulation = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d: any) => d.id).distance(60).strength(0.15))
      .force('charge', forceManyBody().strength(-90))
      .force('cluster', forceCluster(byId, 0.25))
      .force('collide', forceCollide().radius((d: any) => radiusFor(byId.get(d.id)!) + 26))
      .stop();
    for (let i = 0; i < 400; i++) simulation.tick();
    return new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceGraph, rawEdges, byId]);

  const pathNodeIds = useMemo(() => new Set(selectedJourney?.steps.map(s => s.spaceId) ?? []), [selectedJourney]);
  const pathEdgeKeys = useMemo(() => {
    if (!selectedJourney) return new Set<string>();
    const keys = new Set<string>();
    const steps = selectedJourney.steps;
    for (let i = 0; i < steps.length - 1; i++) {
      keys.add([steps[i].spaceId, steps[i + 1].spaceId].sort().join('|'));
    }
    return keys;
  }, [selectedJourney]);

  const nodes: Node[] = useMemo(() => spaceGraph.map(n => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    const isOnPath = pathNodeIds.has(n.id);
    const isDimmed = selectedJourney ? !isOnPath : false;
    return {
      id: n.id,
      type: 'space',
      position: { x: pos.x, y: pos.y },
      data: { label: n.name, color: CATEGORY_COLOR[n.category] || '#94a3b8', radius: radiusFor(n), isOnPath, isDimmed, priorityScore: n.journeyPriorityScore },
      draggable: false
    };
  }), [spaceGraph, positions, pathNodeIds, selectedJourney]);

  const edges: Edge[] = useMemo(() => {
    const adjacencyEdges: Edge[] = rawEdges.map((e, i) => {
      const isOnPath = pathEdgeKeys.has([e.source, e.target].sort().join('|'));
      return {
        id: `adj-${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        type: 'straight',
        style: { stroke: ADJACENCY_EDGE_COLOR, strokeWidth: 1, opacity: selectedJourney ? (isOnPath ? 0 : 0.05) : 0.35 }
      };
    });
    if (!selectedJourney) return adjacencyEdges;
    const journeyEdges: Edge[] = [];
    const steps = selectedJourney.steps;
    for (let i = 0; i < steps.length - 1; i++) {
      journeyEdges.push({
        id: `journey-${selectedJourney.journeyId}-${i}`,
        source: steps[i].spaceId,
        target: steps[i + 1].spaceId,
        type: 'straight',
        animated: true,
        style: { stroke: JOURNEY_HIGHLIGHT_COLOR, strokeWidth: 3, opacity: 0.85 }
      });
    }
    return [...adjacencyEdges, ...journeyEdges];
  }, [rawEdges, pathEdgeKeys, selectedJourney]);

  const handleNodeEnter: NodeMouseHandler = (e, node) => {
    const n = byId.get(node.id);
    if (n) setHoverNode(n);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const totalJourneys = personaJourneys.reduce((s, g) => s + g.journeys.length, 0);

  return (
    <SectionCard icon={Route} title={`Space Graph & Persona Journeys (${spaceGraph.length} spaces, ${totalJourneys} journeys)`}>
      <p className="text-[9px] text-slate-500 mb-2">
        Every Opportunity Lab space (color = category, dot size + red ring priority = how many persona journeys cross it) and
        every archetype's real journeys through them (Entry &rarr; circulation &rarr; destination &rarr; amenity). Select a journey
        below to trace its actual path -- highlighted in red -- over the real adjacency network.
      </p>
      <div className="flex gap-3">
        <div ref={containerRef} className="relative flex-1 h-[600px] border border-slate-200 rounded overflow-hidden bg-slate-50/40">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeMouseEnter={handleNodeEnter}
            onNodeMouseLeave={() => setHoverNode(null)}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={24} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n: any) => n.data?.color ?? '#94a3b8'} maskColor="rgba(241,245,249,0.7)" style={{ width: 100, height: 80 }} />
          </ReactFlow>

          {hoverNode && (
            <div
              className="absolute z-[500] bg-slate-900 text-white text-[9px] rounded shadow-lg px-2.5 py-2 pointer-events-none max-w-[220px] space-y-0.5"
              style={{ left: Math.min(cursor.x + 12, 420), top: Math.max(cursor.y - 8, 4) }}
            >
              <p className="font-bold">{hoverNode.name}</p>
              <p className="text-slate-300">{hoverNode.category} &middot; {hoverNode.priority}</p>
              <p className="text-slate-300">Opportunity: <strong className="text-white">{hoverNode.scores.opportunityScore}</strong>/100 &middot; Suitability: {hoverNode.scores.suitabilityScore}/100</p>
              <p className="text-slate-300">Active/Passive shade: {hoverNode.activeShadeScore}/{hoverNode.passiveShadeScore} &middot; Biodiversity: {hoverNode.biodiversityScore}/10</p>
              <p className="text-slate-300">Cost: AED {hoverNode.cost.costRateAedPerM2}/m&sup2; ({hoverNode.cost.aestheticMateriality})</p>
              <p className="text-slate-300">Crossed by {hoverNode.journeyTraversalCount} journey step(s) &middot; priority {hoverNode.journeyPriorityScore}/10</p>
            </div>
          )}
        </div>

        <div className="w-72 shrink-0 h-[600px] overflow-y-auto space-y-2 pr-1">
          {personaJourneys.map(group => (
            <div key={group.archetypeKey} className="border border-slate-200 rounded">
              <button
                onClick={() => setExpandedArchetype(prev => prev === group.archetypeKey ? null : group.archetypeKey)}
                className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-700"
              >
                <span>{group.archetype} <span className="text-slate-400 font-normal">({group.ageGroup})</span></span>
                <span className="flex items-center gap-1 text-slate-400">
                  {group.journeys.length}
                  {expandedArchetype === group.archetypeKey ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </span>
              </button>
              {expandedArchetype === group.archetypeKey && (
                <div className="p-1.5 space-y-1">
                  {group.journeys.map(j => (
                    <JourneyRow key={j.journeyId} journey={j} active={selectedJourney?.journeyId === j.journeyId} onSelect={() => setSelectedJourney(prev => prev?.journeyId === j.journeyId ? null : j)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedJourney && (
        <div className="mt-2 p-2.5 rounded border border-rose-200 bg-rose-50/60 text-[10px] text-slate-600 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap font-bold text-slate-700">
            {selectedJourney.steps.map((s, i) => (
              <span key={`${s.spaceId}-${i}`} className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">{s.spaceName} <span className="text-slate-400 font-normal">({s.role.replace('_', ' ')})</span></span>
                {i < selectedJourney.steps.length - 1 && <span className="text-rose-400">&rarr;</span>}
              </span>
            ))}
          </div>
          <p className="leading-relaxed">{selectedJourney.story}</p>
          <p className="text-slate-400">{selectedJourney.seasonContext}</p>
        </div>
      )}

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
