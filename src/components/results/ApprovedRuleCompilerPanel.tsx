import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2, Network, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { OpportunityResult } from '../../lib/gis/opportunityEngine';
import { downloadJson } from '../../lib/gis/exportEngine';
import {
  compileApprovedRules,
  type CompiledRuleEdge,
  type EdgeDecision
} from '../../lib/results/approvedRuleCompiler';
import { fetchParkBrainRegistry, type ParkBrainRegistryResponse } from '../../lib/results/parkBrain';
import { SectionCard } from '../ui/SectionCard';

function decisionClass(decision: EdgeDecision): string {
  if (decision === 'accepted') return 'bg-emerald-50 border-emerald-200';
  if (decision === 'rejected') return 'bg-rose-50 border-rose-200 opacity-70';
  return 'bg-white border-slate-200';
}

function reasonLabel(reason: string): string {
  return reason.replaceAll('_', ' ');
}

interface ApprovedRuleCompilerPanelProps {
  opportunities: OpportunityResult[];
  onCompilationChange?: (acceptedEdges: CompiledRuleEdge[], unresolved: ReturnType<typeof compileApprovedRules>['unresolved']) => void;
}

export function ApprovedRuleCompilerPanel({ opportunities, onCompilationChange }: ApprovedRuleCompilerPanelProps) {
  const [registry, setRegistry] = useState<ParkBrainRegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, EdgeDecision>>({});

  async function loadRegistry() {
    setLoading(true);
    setError(null);
    try {
      setRegistry(await fetchParkBrainRegistry());
      setDecisions({});
    } catch (e: any) {
      setError(e?.message || 'Failed to load approved rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRegistry();
  }, []);

  const compilation = useMemo(() => {
    if (!registry) return null;
    return compileApprovedRules(registry.rules, registry.conflicts, opportunities);
  }, [registry, opportunities]);

  const decidedEdges = useMemo(() => {
    return (compilation?.edges || []).map(edge => ({
      ...edge,
      decision: decisions[edge.edge_id] || edge.decision
    }));
  }, [compilation, decisions]);

  const acceptedEdges = useMemo(
    () => decidedEdges.filter(edge => edge.decision === 'accepted'),
    [decidedEdges]
  );

  useEffect(() => {
    onCompilationChange?.(acceptedEdges, compilation?.unresolved || []);
  }, [acceptedEdges, compilation, onCompilationChange]);

  function setDecision(edge: CompiledRuleEdge, decision: EdgeDecision) {
    setDecisions(previous => ({ ...previous, [edge.edge_id]: decision }));
  }

  function handleExport() {
    if (!compilation || acceptedEdges.length === 0) return;
    const graphViews = Object.fromEntries(
      (['functional', 'distance', 'visibility', 'movement', 'constraints'] as const)
        .map(layer => [layer, acceptedEdges.filter(edge => edge.graph_layer === layer)])
    );

    downloadJson({
      manifest: {
        schema_version: compilation.schema_version,
        generated_at: new Date().toISOString(),
        source: 'Park Brain active approved-rule registry',
        policy: 'Only individually accepted edges are exported. Candidate rules, chatbot prose, rejected edges, and pending edges are excluded.',
        accepted_edge_count: acceptedEdges.length,
        unresolved_rule_count: compilation.unresolved.length
      },
      nodes: opportunities.map(opportunity => ({
        id: opportunity.type,
        name: opportunity.name,
        category: opportunity.category,
        geometry_type: opportunity.geometryType,
        scale: opportunity.scale
      })),
      edges: acceptedEdges,
      graphs: graphViews,
      unresolved_rules: compilation.unresolved
    }, 'al_safa_2_approved_rule_graph.json');
  }

  const opportunityName = new Map(opportunities.map(opportunity => [opportunity.type, opportunity.name]));

  return (
    <SectionCard
      icon={Network}
      title="Approved Rule Compiler"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={acceptedEdges.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            <Download className="w-3 h-3" />
            Export accepted graph
          </button>
          <button
            type="button"
            onClick={loadRegistry}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh registry
          </button>
        </div>
      }
    >
      <div className="rounded border border-emerald-100 bg-emerald-50 p-2.5 mb-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-bold text-emerald-800">Fail-closed deterministic compilation</p>
          <p className="text-[9px] text-emerald-700 mt-0.5 leading-relaxed">
            Only active human-approved Park Brain rules are considered. Ambiguous entities, active conflicts,
            and incomplete numeric provenance remain unresolved. Every compiled edge still needs project-level designer approval.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !registry && (
        <div className="py-8 flex items-center justify-center gap-2 text-[10px] text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading active approved rules...
        </div>
      )}

      {compilation && registry && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded border border-slate-200 p-2">
              <p className="text-[8px] font-bold uppercase text-slate-400">Active rules</p>
              <p className="text-base font-extrabold text-slate-700">{registry.rules.length}</p>
            </div>
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
              <p className="text-[8px] font-bold uppercase text-indigo-600">Compiled edges</p>
              <p className="text-base font-extrabold text-indigo-700">{compilation.edges.length}</p>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-[8px] font-bold uppercase text-amber-600">Unresolved</p>
              <p className="text-base font-extrabold text-amber-700">{compilation.unresolved.length}</p>
            </div>
            <div className="rounded border border-rose-200 bg-rose-50 p-2">
              <p className="text-[8px] font-bold uppercase text-rose-600">Conflicts</p>
              <p className="text-base font-extrabold text-rose-700">{registry.conflicts.filter(conflict => conflict.status === 'requires_human_resolution').length}</p>
            </div>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
              <p className="text-[8px] font-bold uppercase text-emerald-600">Accepted</p>
              <p className="text-base font-extrabold text-emerald-700">{acceptedEdges.length}</p>
            </div>
          </div>

          {registry.rules.length === 0 && (
            <div className="rounded border border-dashed border-slate-300 p-5 text-center">
              <p className="text-[10px] font-bold text-slate-600">The Park Brain approved registry is empty.</p>
              <p className="text-[9px] text-slate-400 mt-1">
                Review and approve candidate rules in Park Brain first. Chat answers and extracted candidates are intentionally unavailable to this compiler.
              </p>
            </div>
          )}

          {decidedEdges.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Project applicability review</p>
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {decidedEdges.map(edge => (
                  <div key={edge.edge_id} className={`rounded border p-2.5 ${decisionClass(edge.decision)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-bold uppercase text-slate-500">{edge.graph_layer}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[8px] font-bold uppercase text-indigo-600">{edge.requirement_level}</span>
                          <span className="text-[8px] text-slate-400">{edge.source_rule.rule_id} v{edge.source_rule.version}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-700 mt-1">
                          {opportunityName.get(edge.source_node_id)} → {edge.relationship_type} → {opportunityName.get(edge.target_node_id)}
                        </p>
                        <p className="text-[8px] text-slate-400 mt-1">
                          {edge.source_rule.document_id}, p.{edge.source_rule.page}, {edge.source_rule.section}
                          {edge.numeric_constraint?.value !== null && edge.numeric_constraint
                            ? ` · ${edge.numeric_constraint.parameter || 'value'}: ${edge.numeric_constraint.value} ${edge.numeric_constraint.unit || ''}`
                            : ' · qualitative'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDecision(edge, edge.decision === 'accepted' ? 'pending_review' : 'accepted')}
                          className={`p-1.5 rounded border ${edge.decision === 'accepted' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                          aria-label={`Accept ${edge.source_rule.rule_id}`}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecision(edge, edge.decision === 'rejected' ? 'pending_review' : 'rejected')}
                          className={`p-1.5 rounded border ${edge.decision === 'rejected' ? 'bg-rose-600 border-rose-600 text-white' : 'border-rose-200 text-rose-600 hover:bg-rose-50'}`}
                          aria-label={`Reject ${edge.source_rule.rule_id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {compilation.unresolved.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">Unresolved approved rules</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {compilation.unresolved.map(item => (
                  <div key={item.rule_id} className="rounded border border-amber-200 bg-amber-50 p-2 text-[9px]">
                    <p className="font-bold text-amber-800">{item.rule_id} · {reasonLabel(item.reason)}</p>
                    <p className="text-amber-700 mt-0.5">{item.source_entity} → {item.relationship} → {item.target_entity}</p>
                    {(item.source_candidates.length > 0 || item.target_candidates.length > 0) && (
                      <p className="text-[8px] text-amber-600 mt-1">
                        Source candidates: {item.source_candidates.join(', ') || 'none'} · Target candidates: {item.target_candidates.join(', ') || 'none'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
