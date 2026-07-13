import { useMemo, useState, useCallback } from 'react';
import { Network } from 'lucide-react';
import { ReactFlow, Background, Controls, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { OpportunityResult, OpportunityType } from '../../lib/gis/opportunityEngine';
import { SectionCard } from '../ui/SectionCard';

/** Maps a PROGRAM_DEFS adjacency key onto one of the Opportunity Lab program types, where one
 * exists. Adjacency keys with no match (major_road, service_yard, teenZone, ...) are shown as
 * plain site-condition nodes instead of being silently dropped. */
const OPPORTUNITY_ALIAS: Record<string, OpportunityType> = {
  inclusivePlayground: 'inclusivePlayground',
  naturePlay: 'naturePlay',
  cafe: 'cafeKiosk',
  retailKiosk: 'cafeKiosk',
  drinkingFountains: 'drinkingWater',
  drinking_water: 'drinkingWater',
  toilets: 'restrooms',
  sportsCourt: 'sportsCourt',
  outdoorFitness: 'outdoorFitness',
  quietGarden: 'quietGarden',
  sensoryGarden: 'sensoryGarden',
  communityPlaza: 'communityPlaza',
  eventLawn: 'flexibleEventLawn',
  picnicArea: 'picnicArea',
  joggingLoop: 'joggingLoop',
  walkingCircuit: 'accessibleRoutes',
  familySeating: 'socialSeating',
  family_seating: 'familySeatingPlay'
};

function readableLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

export interface AdjacencyNodeInfo {
  key: string;
  label: string;
  kind: 'selected' | 'opportunity' | 'siteCondition';
  opportunity?: OpportunityResult;
}

export function OpportunityAdjacencyGraph({
  selected,
  allResults
}: {
  selected: OpportunityResult;
  allResults: OpportunityResult[];
}) {
  const [activeNode, setActiveNode] = useState<AdjacencyNodeInfo | null>(null);

  const { preferred, avoided } = useMemo(() => {
    const resolve = (key: string): AdjacencyNodeInfo => {
      const matchType = OPPORTUNITY_ALIAS[key];
      const match = matchType ? allResults.find(r => r.type === matchType) : undefined;
      return match
        ? { key, label: match.name, kind: 'opportunity', opportunity: match }
        : { key, label: readableLabel(key), kind: 'siteCondition' };
    };
    return {
      preferred: selected.grasshopperInputs.adjacencyRules.preferred.map(resolve),
      avoided: selected.grasshopperInputs.adjacencyRules.avoid.map(resolve)
    };
  }, [selected, allResults]);

  const centerNode: AdjacencyNodeInfo = { key: selected.type, label: selected.name, kind: 'selected', opportunity: selected };
  const ring = [...preferred.map(n => ({ ...n, relation: 'preferred' as const })), ...avoided.map(n => ({ ...n, relation: 'avoid' as const }))];

  const nodes: Node[] = useMemo(() => {
    const n = ring.length;
    const radius = 170;
    const centerStyle = { width: 76, height: 76, borderRadius: 9999, background: '#4338ca', color: '#fff' };
    const items: Node[] = [{
      id: centerNode.key,
      position: { x: 280 - 38, y: 220 - 38 },
      data: { label: centerNode.label },
      style: { ...centerStyle, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4, whiteSpace: 'pre-line', border: '2px solid #1e1b4b' }
    }];
    ring.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
      const size = node.kind === 'opportunity' ? 54 : 42;
      const bg = node.kind === 'opportunity' ? (node.relation === 'avoid' ? '#fecaca' : '#c7d2fe') : '#e2e8f0';
      const color = node.kind === 'opportunity' ? '#1e1b4b' : '#64748b';
      const isActive = activeNode?.key === node.key;
      items.push({
        id: `${node.key}-${i}`,
        position: { x: 280 + radius * Math.cos(angle) - size / 2, y: 220 + radius * Math.sin(angle) - size / 2 },
        data: { label: node.label, ...node },
        style: {
          width: size, height: size, borderRadius: 9999, background: bg, color,
          fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: 3, whiteSpace: 'pre-line',
          border: isActive ? '2px solid #0b0b0b' : node.relation === 'avoid' ? '1px dashed #ef4444' : '1px solid #94a3b8'
        }
      });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring, activeNode, centerNode.key, centerNode.label]);

  const edges: Edge[] = useMemo(() => ring.map((node, i) => ({
    id: `${centerNode.key}-${node.key}-${i}`,
    source: centerNode.key,
    target: `${node.key}-${i}`,
    animated: node.relation === 'preferred',
    style: node.relation === 'avoid'
      ? { stroke: '#ef4444', strokeDasharray: '4 3', opacity: 0.6 }
      : { stroke: '#6366f1', opacity: 0.6 }
  })), [ring, centerNode.key]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.id === centerNode.key) {
      setActiveNode(centerNode);
      return;
    }
    const match = ring.find((n, i) => `${n.key}-${i}` === node.id);
    if (match) setActiveNode(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring, centerNode.key]);

  return (
    <SectionCard icon={Network} title="Adjacency Network">
      <p className="text-[9px] text-slate-500 mb-2">
        Solid indigo = preferred adjacency, dashed red = avoid. Gray nodes are site conditions (not one of the 10 opportunity types). Click a node for details.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 h-[420px] border border-slate-200 rounded overflow-hidden">
          <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} fitView proOptions={{ hideAttribution: true }}>
            <Background color="#e2e8f0" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2">
          {activeNode ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-700">{activeNode.label}</p>
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                {activeNode.kind === 'siteCondition' ? 'Site Condition' : 'Opportunity Type'}
              </p>
              {activeNode.opportunity ? (
                <div className="text-[9px] text-slate-600 space-y-1 mt-1.5">
                  <div>Opportunity score: <strong className="text-slate-800">{activeNode.opportunity.opportunityScore}/100</strong></div>
                  <div>Priority: <strong className="text-slate-800">{activeNode.opportunity.priority}</strong></div>
                  <div>Recommended area: <strong className="text-slate-800">{activeNode.opportunity.recommendedAreaM2 ? `${activeNode.opportunity.recommendedAreaM2.target.toLocaleString()} m²` : 'N/A'}</strong></div>
                  <div>Primary users: <strong className="text-slate-800">{activeNode.opportunity.primaryUsers.slice(0, 3).join(', ')}</strong></div>
                </div>
              ) : (
                <p className="text-[9px] text-slate-500 mt-1.5">Not one of the 10 modeled opportunity types -- a generic site feature referenced by the adjacency rules.</p>
              )}
            </div>
          ) : (
            <p className="text-[9px] text-slate-400">Click any node to see its name, score, and recommended area here.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
