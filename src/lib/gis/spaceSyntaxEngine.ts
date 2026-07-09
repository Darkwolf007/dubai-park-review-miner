import type { SpaceSyntaxFeature, SpaceSyntaxStats } from './types';

export interface SpaceSyntaxRankedNode {
  nodeId: string;
  value: number;
  lat: number;
  lng: number;
}

export interface SpaceSyntaxAnalysisResult {
  nodeCount: number;
  edgeCount: number;
  betweennessSampleK: number;
  avgIntegration: number;
  avgChoice: number;
  topIntegration: SpaceSyntaxRankedNode[];
  topChoice: SpaceSyntaxRankedNode[];
  methodology: string;
}

/**
 * Integration (closeness centrality) and Choice (betweenness centrality) are
 * precomputed with networkx in scripts/convert_gis_data.py (real Brandes'
 * algorithm on the drivable circulation network, not a client-side estimate)
 * -- this just ranks and summarizes the already-computed per-junction scores.
 */
export function computeSpaceSyntaxAnalysis(nodes: SpaceSyntaxFeature[], stats: SpaceSyntaxStats | null): SpaceSyntaxAnalysisResult {
  const toRanked = (field: 'integration' | 'choice'): SpaceSyntaxRankedNode[] =>
    [...nodes]
      .sort((a, b) => b.properties[field] - a.properties[field])
      .slice(0, 5)
      .map(n => ({
        nodeId: n.properties.node_id,
        value: n.properties[field],
        lat: n.geometry.coordinates[1],
        lng: n.geometry.coordinates[0]
      }));

  const avg = (field: 'integration' | 'choice') =>
    nodes.length === 0 ? 0 : nodes.reduce((s, n) => s + n.properties[field], 0) / nodes.length;

  return {
    nodeCount: stats?.nodeCount ?? nodes.length,
    edgeCount: stats?.edgeCount ?? 0,
    betweennessSampleK: stats?.betweennessSampleK ?? 0,
    avgIntegration: Math.round(avg('integration') * 10) / 10,
    avgChoice: Math.round(avg('choice') * 10) / 10,
    topIntegration: toRanked('integration'),
    topChoice: toRanked('choice'),
    methodology: stats?.methodology || ''
  };
}
