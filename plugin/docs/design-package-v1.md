# ParkDesignPackage v1.4

The Results tab exports `al_safa_2_park_design_package.zip`. The Grasshopper plugin reads this ZIP directly. It also accepts the old compact Results JSON through a compatibility adapter so existing definitions do not break.

## ZIP contents

- `manifest.json`: schema version, project identity, CRS, units, counts, safety policy, and file index
- `park_design_package.json`: canonical versioned contract joining site, personas, program, relationships, journeys, OD movement demand, objectives, constraints, planting intent, dune vocabulary, evidence, provenance, and generation settings
- `validation.json`: deterministic errors, warnings, and package metrics produced at export time
- `site.json`: WGS84 and EPSG:32640 site boundaries
- `area_programs.json`: area-based programs with min, target, max, selection state, and area authority
- `node_programs.json`: point amenities without invented floor areas
- `route_programs.json`: linear/network programs without invented lengths or widths
- `landscape_systems.json`: overlay-region and environmental-network requirements whose coverage targets remain explicit
- `access_candidates.json`: sampled boundary candidates, role eligibility, hard edge exclusions, raw evidence and normalized metrics
- `access_pair_metrics.json`: distance, edge identity, catchment overlap, combined population, and each candidate's directional additional population for public-entrance pairs
- `movement_requirements.json`: walking, jogging, exercise-cycling and service-network topology and sharing decisions
- `terrain_requirements.json`: authoritative Rhino mesh contract, grading permission, cut/fill metrics and optional obstacle inputs
- `climate_morphology.json`: EPW/CFD lineage, the primary sikka axis, ventilation cuts, baraha rules, nearly-flat terrain limits, and the Rhino OBJ-to-UTM transform
- `lands_design_handoff.json`: stable Rhino parameters, intended Lands Design object mappings, and the ordered detail-design decisions for terrain, paths, planting, irrigation, furniture, and schedules
- `planting_strategy.json`: hydrozones, irrigation-network objectives, and the safety fields that must be verified before automated planting
- `program_ontology.json`: PATH/SPACE classification, user groups, time/season profiles, performance attributes, and D0-D10 compatibility
- `user_program_suitability.json`: canonical user definitions and explainable user-program weights
- `parametric_relationships.json`: full advisory attraction/repulsion matrix; never an approved numeric rule source
- `masterplan_settings.json`: visible designer inputs and computational sampling parameters used for this export
- `grid.json`: clipped analysis cells, UTM geometry, source data, per-program suitability scores, and constraints
- `relationships.json`: accepted rule edges and non-authoritative advisory relationships in separate arrays
- `unresolved.json`: incomplete or rejected rules and missing decisions excluded from computation
- `README.txt`: concise handoff instructions for a designer opening the archive

## Loader contract

- `manifest.json` must contain `schema_version`, `project.site_name`, `coordinate_system.crs`, and `coordinate_system.units`.
- The required CRS is `EPSG:32640`; the required units are metres.
- All area programs with a positive exported target are eligible for area placement. If their target sum exceeds the boundary and their documented minimum sum fits, every program uses its documented minimum; the engine never scales below an exported minimum.
- Area programs without an approved extent are represented as suitability-ranked `Area Intent Anchors`, not fabricated circles.
- Every node and route program is processed separately and is never converted into an area bubble. Legacy `selected` flags remain metadata rather than suppressing final-program geometry.
- `accepted_rule_edges` remain authoritative evidence constraints. Explicit `designer_relationships` are also computational, but retain separate `designer_approved` authority and provenance. Advisory relationships remain explanatory evidence.
- All competition-scope programs are mandatory. `spatial_mode`, `fragmentation_policy`, and scored `overlap_compatible` pairs allow shared or distributed territories without deleting programs or pretending all target areas are mutually exclusive.
- The primary sikka follows the site long axis; W-E and NW-SE ventilation cuts are clipped to the selected boundary. Route intersections generate scored baraha candidates rather than fixed plaza objects.
- Accepted numeric distance rules are applied only when their unit is explicitly metres and their parameter identifies a minimum or maximum. Mandatory violations reject the candidate placement.
- Accepted visibility rules produce relationship geometry but do not claim obstruction clearance without 3D obstacle data.
- Empty grids and relationship graphs are valid and produce explicit diagnostics instead of fabricated data.
- The Rhino boundary and package grid must overlap in EPSG:32640. Designers can explicitly choose the `site.json` boundary with `Use Package Boundary`; the plugin never silently shifts or reprojects mismatched geometry.
- School- and building-facing access candidates are hard-excluded. Public and service entrances are eligible only on road-facing candidate segments.
- Population pull is a modeled H3 potential-demand metric rather than measured pedestrian footfall; its catchment radius and candidate spacing are exported for reproducibility.

Program target areas carry an explicit authority status. A system or AI recommendation is not a regulatory requirement and must be approved by the designer. Candidate rules, chatbot prose, advisory links, and unresolved graph edges never enter the package as computational constraints. Plant records likewise remain candidate-generation inputs until their horticultural safety and procurement fields are verified.

The role-specific JSON files remain compatibility views for the current Grasshopper loader. New consumers should treat `park_design_package.json` as authoritative and use `schema_version` to select an adapter.
