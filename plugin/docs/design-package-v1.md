# ParkDesignPackage v1.1

The Results tab exports `al_safa_2_park_design_package.zip`. The Grasshopper plugin reads this ZIP directly. It also accepts the old compact Results JSON through a compatibility adapter so existing definitions do not break.

## ZIP contents

- `manifest.json`: schema version, project identity, CRS, units, counts, safety policy, and file index
- `site.json`: WGS84 and EPSG:32640 site boundaries
- `area_programs.json`: area-based programs with min, target, max, selection state, and area authority
- `node_programs.json`: point amenities without invented floor areas
- `route_programs.json`: linear/network programs without invented lengths or widths
- `landscape_systems.json`: overlay-region and environmental-network requirements whose coverage targets remain explicit
- `access_candidates.json`: sampled boundary candidates, role eligibility, hard edge exclusions, raw evidence and normalized metrics
- `access_pair_metrics.json`: distance, edge identity, catchment overlap, combined population, and each candidate's directional additional population for public-entrance pairs
- `movement_requirements.json`: walking, jogging, exercise-cycling and service-network topology and sharing decisions
- `terrain_requirements.json`: authoritative Rhino mesh contract, grading permission, cut/fill metrics and optional obstacle inputs
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
- Only `accepted_rule_edges` can become deterministic relationships. Advisory relationships remain explanatory evidence.
- Accepted numeric distance rules are applied only when their unit is explicitly metres and their parameter identifies a minimum or maximum. Mandatory violations reject the candidate placement.
- Accepted visibility rules produce relationship geometry but do not claim obstruction clearance without 3D obstacle data.
- Empty grids and relationship graphs are valid and produce explicit diagnostics instead of fabricated data.
- The Rhino boundary and package grid must overlap in EPSG:32640. Designers can explicitly choose the `site.json` boundary with `Use Package Boundary`; the plugin never silently shifts or reprojects mismatched geometry.
- School- and building-facing access candidates are hard-excluded. Public and service entrances are eligible only on road-facing candidate segments.
- Population pull is a modeled H3 potential-demand metric rather than measured pedestrian footfall; its catchment radius and candidate spacing are exported for reproducibility.

Program target areas carry an explicit authority status. A system or AI recommendation is not a regulatory requirement and must be approved by the designer. Candidate rules, chatbot prose, advisory links, and unresolved graph edges never enter the package as computational constraints.
