import { useMemo, useCallback } from 'react';
import { Network } from 'lucide-react';
import { ReactFlow, Background, Controls, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import { computeTopicCooccurrence } from '../../lib/analytics/cooccurrence';
import { getCategoryColor } from '../../lib/analytics/categoryColors';
import { SectionCard } from '../ui/SectionCard';

export function TopicNetwork({
  reviews,
  activeCategory,
  onSelectCategory
}: {
  reviews: NLPAnalyzedReview[];
  activeCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}) {
  const graph = useMemo(() => computeTopicCooccurrence(reviews), [reviews]);
  const maxCount = Math.max(1, ...graph.nodes.map(n => n.count));
  const maxWeight = Math.max(1, ...graph.edges.map(e => e.weight));

  const nodes: Node[] = useMemo(() => {
    const n = graph.nodes.length;
    const radius = 240;
    return graph.nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, n);
      const size = 36 + (node.count / maxCount) * 50;
      const isActive = activeCategory === node.id;
      return {
        id: node.id,
        position: { x: 320 + radius * Math.cos(angle) - size / 2, y: 240 + radius * Math.sin(angle) - size / 2 },
        data: { label: `${node.id}\n${node.count}` },
        style: {
          width: size,
          height: size,
          borderRadius: 9999,
          background: getCategoryColor(node.id),
          opacity: isActive || !activeCategory ? 1 : 0.3,
          color: '#fff',
          fontSize: 8,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center' as const,
          border: isActive ? '2px solid #0b0b0b' : 'none',
          padding: 2,
          whiteSpace: 'pre-line' as const
        }
      };
    });
  }, [graph, activeCategory, maxCount]);

  const edges: Edge[] = useMemo(() => graph.edges.map(e => ({
    id: `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    style: { strokeWidth: 1 + (e.weight / maxWeight) * 5, stroke: '#94a3b8', opacity: 0.25 + (e.weight / maxWeight) * 0.55 }
  })), [graph, maxWeight]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    onSelectCategory(activeCategory === node.id ? null : node.id);
  }, [activeCategory, onSelectCategory]);

  return (
    <SectionCard icon={Network} title="Topic Co-occurrence Network">
      <p className="text-[9px] text-slate-500 mb-2">
        Node size = how often the issue is mentioned. Edge thickness = how often two issues are mentioned in the same review.
        Click a node to filter the whole dashboard by that issue; click again to clear.
      </p>
      <div className="h-[500px] border border-slate-200 rounded overflow-hidden">
        {graph.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs font-semibold">No categorized reviews yet.</div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} fitView proOptions={{ hideAttribution: true }}>
            <Background color="#e2e8f0" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </SectionCard>
  );
}
