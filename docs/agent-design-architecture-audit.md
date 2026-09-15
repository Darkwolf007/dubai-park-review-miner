# Agent-driven design: audit and staged implementation

## Existing contracts and reusable code

| Boundary | Existing implementation | Reuse and constraint |
| --- | --- | --- |
| Reviewer package | `src/lib/designPackage/contract.ts`, `canonicalAdapter.ts`, `src/server/designPackageApi.ts`, `src/lib/gis/parkDesignPackage.ts` | Canonical schema 1.4 carries package ID/version, site, program, relationships, journeys, movement demands, evidence and provenance. Keep its validator and export. The server repository is currently process-local. |
| SpacePlanner import | `plugin/src/ParkDesign.SpacePlanner.Core/Serialization/DesignPackageLoader.cs`, `Models/DesignPackage.cs`, `Validation/DesignPackageValidator.cs` | Loads canonical JSON or split ZIP, including boundary, grid, access candidates, movements and climate. It validates EPSG:32640 and metres; generation must refuse incompatible coordinates. No reprojection is allowed. |
| Spatial planning | `PlanningEngine`, `BubbleDistributor`, `ProgramAreaAllocator`, `AreaRelaxationSolver`, `SpatialRelationshipCompiler`, `NodePlacer`, `RouteGenerator` | The planner's three legacy scoring modes remain available. The allocator/solver/route algorithms remain authoritative for geometry and measurement. `SolverDiagnostics.Valid` exposes hard failures; a high score does not imply validity. |
| Detailed circulation | `CirculationNetworkBuilder`, `MovementCostFieldBuilder`, `CirculationPathExtractor`, `AccessCombinationEvaluator` | Reuse for accessible and service routing; the current PlanningEngine's conceptual `RouteGenerator` does not yet invoke the detailed network builder. |
| Rhino/Grasshopper | `DistributeSpacesComponent`, `GenerateCirculationComponent`, `BakePlanningGeometryComponent`, `BakeRouteGisLayersComponent` | Grasshopper already previews and bakes planning proxies. Existing bake components have a button pulse and component-instance tagging but do not provide agent commands, approval tokens, stable scenario IDs or an explicit undo contract. Preserve user edits in these components. |
| Park Brain | `backend/app/api/rules.py`, `rules/workflow.py`, `core/numeric_safeguard.py`, `db/models.py` | `ApprovedRule` is the standards authority. Candidate review verifies source numerics before approval. The new design API consumes only active approved rules and measured facts; incomplete provenance stays unresolved. |

## Findings

The old `PlanningEngine.Generate` chooses `Balanced`, `Suitability` and `Connectivity` via an enum. That enum is a scoring switch, not a suitable strategy space. `BubbleDistributor` and `AreaRelaxationSolver` already enforce area, boundary and relationship constraints, so the first extension passes bounded strategy parameters into placement rather than replacing those algorithms. The current bubbles and route lines are planning proxies, not finished polygonal masterplans.

The Reviewer canonical package and SpacePlanner's split ZIP are related but distinct serialization surfaces. Preserve both and add a versioned design-run envelope beside them. Avoid inserting transient strategy or Rhino state into `ParkDesignPackage` 1.4. A scenario must reference the immutable package ID/version and its seed; otherwise a later package edit cannot be distinguished from a revision.

The current Rhino bake components do not check agent approval or record an undo group. A controlled Rhino bridge should be a new RhinoCommon layer around those geometry serializers. It must check metres and the registered EPSG:32640 site, marshal mutations to the UI thread, tag objects with run/scenario IDs, and separate `ParkDesign::AgentRuns` previews from `ParkDesign::Approved`. An agent command must not call the existing bake pulse as its approval mechanism.

The existing suitability grid and movement demands can shape proposals; visibility, noise, shade/UTCI, wind, biodiversity, cost and service movement may be present as package fields but are not all measured by the current core planning score. Unknown measures must remain unresolved, not assigned fabricated scores. A later evaluator should consume measured fields and explicit designer priorities. Numeric regulatory thresholds must come only from active Park Brain rules or explicit designer input.

## Smallest complete loop and staged files

1. **Deterministic candidate slice (implemented):** `Models/GeneratedStrategy.cs`, `Algorithms/StrategyGenerator.cs`, `BubbleDistributor.cs`, `PlanningEngine.cs`. Generate bounded genomes from package/site metrics, run existing solvers, reject invalid and near-duplicate placements, and retain seeds and diagnostics. Existing modes remain backward compatible. This slice is computational and does not yet claim full Pareto optimisation.
2. **Standards slice (implemented):** Park Brain `backend/app/api/design.py` and `backend/app/main.py` expose requirements, validate and explain using active approved rules and measured facts. Unknown comparison or incomplete provenance requires review. No database migration is needed for these endpoints.
3. **Measurement and ranking:** Extend SpacePlanner result serialization with measured route, access, environmental, area, cost and relationship facts. Add a Pareto front over measured objectives and diversity terms for adjacency, routes and occupied regions. Do not rank unknown measures as zero or call a planning proxy compliant.
4. **Persistent run API:** Add `DesignRun`, `DesignScenario`, `ScenarioEvaluation`, `AgentToolCall`, `DesignerDecision`, `RhinoPreview` tables and migrations in Reviewer server storage. Use append-only child revisions, package ID/version, seed, genome, settings, diagnostics, rule responses and timestamps. Approval is a separate decision record.
5. **Bounded orchestrator and Rhino bridge:** `plugin/src/ParkDesign.SpacePlanner/RhinoBridge/RhinoDesignBridge.cs` now provides an in-process RhinoCommon start: metre/CRS registration, UI-thread preview replacement, deterministic object IDs and approval-gated baking of planning curves. It is not yet a complete bridge. Add Reviewer server tool handlers for context, rules, generation, evaluation, revision, comparison, validation, preview and approval; add local transport, document measurement, capture and guarded undo commands. The host needs an explicit transport and authentication decision before connection from the web UI. LLM output is parsed as intent and bounded parameters, never coordinates or regulatory values.
6. **Agent Studio:** Add a panel alongside `ResultsTab.tsx` with request, objective weights, locks, progress, scenario comparison, evidence and unresolved items. Preview and bake actions should be disabled until a Rhino bridge reports a matching site and an explicit designer approval is recorded.

## Proposed additive run schema

`design_runs(run_id, parent_run_id, package_id, package_version, instruction, settings_json, created_at)`;
`generated_strategies(strategy_id, run_id, seed, genome_json, objective_weights_json, rationale_json)`;
`design_scenarios(scenario_id, run_id, parent_scenario_id, strategy_id, seed, geometry_ref, diagnostics_json, created_at)`;
`scenario_evaluations(scenario_id, metrics_json, rule_validation_json, pareto_rank, explanation_json)`;
`agent_tool_calls(call_id, run_id, tool_name, bounded_args_json, result_json, timestamp)`;
`designer_decisions(decision_id, scenario_id, decision, designer_id, timestamp)`;
`rhino_previews(preview_id, scenario_id, object_ids_json, layer_path, document_id, timestamp)`.

Keep package schema 1.4 unchanged in this first stage. Any later package-field change requires a new schema version and adapter plus tests for both canonical and legacy ZIP imports. Run records must reject unknown package versions and store immutable input hashes. Rhino object IDs belong to preview records, not the package. The Park Brain endpoint is a read-only view of existing approved-rule rows, so it also needs no schema migration.

## Verification plan and current limits

The SpacePlanner smoke suite covers package loading, deterministic strategy generation, finite parameter validation, generated planning, boundary/area checks and existing circulation behavior. Add property tests for multi-site strategy diversity and route topology after detailed circulation is integrated. Park Brain tests cover passed, failed, unresolved and unapproved numeric facts; run them with the backend dependencies installed. Rhino integration needs Rhino 8 UI-thread tests for stable IDs, replacement, undo and approval before bake. The end-to-end designer request → preview → approve → bake loop is **not yet connected**; the current slice provides deterministic scenarios, measured-fact rule validation and an in-process Rhino preview/bake API.
