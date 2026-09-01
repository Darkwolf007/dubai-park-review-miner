# Evidence-to-Masterplan Implementation Map

Date: 2026-09-01

## A. Current system map

| Area | Existing architecture |
|---|---|
| Park Reviewer | React/TypeScript application with Express API; review ingestion and NLP, analytics/personas, GIS/H3 site analysis, Opportunity Lab program scoring, Results synthesis, Park Brain proxy, and ZIP/JSON/CSV/XLSX exports. |
| Park Brain | Separate FastAPI codebase in `../park_brain`; PDF ingestion, page-preserving chunks, hybrid retrieval, candidate-rule review, approved-rule registry, conflict detection, numeric safeguard, JSON/CSV-facing rule API, and tests. |
| Rhino / Grasshopper | `plugin/ParkDesign.SpacePlanner.sln`; Rhino 8 / Grasshopper .NET 7 plugin and RhinoCommon components. The core is separated from Rhino UI dependencies. |
| Geometry generation | Deterministic bubble placement, area allocation/relaxation, node placement, route generation, relationship compilation/scoring, polygon math, dune morphology axes/baraha, terrain sampling, and cut/fill metrics. |
| Program data | 44-entry Opportunity catalog, area/node/route separation, PATH/SPACE and SPACE subtype ontology, user suitability, temporal/seasonal profiles, D0-D10 dune compatibility, and unresolved-area intent handling. |
| Persona data | Review-derived personas plus Results archetype journey groups. Journeys contain ordered real program nodes, time of day, season, narrative provenance, and traversal counts. |
| Relationships | Opportunity adjacency rules, computed advisory relationships, designer-approved overlap compatibility, and Park Brain-approved edges with numeric provenance and explicit designer acceptance. |
| Exports | Existing multi-file `ParkDesignPackage` ZIP, legacy compact Results JSON, space graph/journeys JSON, Grasshopper GIS exports, CSV, GeoJSON, and XLSX. |
| APIs | Express evidence/synthesis routes and Park Brain proxy; FastAPI dataset/analysis worker; Park Brain `/api/v1` documents/search/query/rules endpoints. Before this phase there was no authoritative design-package CRUD/validation API. |

## B. Gap analysis

| Requested subsystem | Status | Finding / next boundary |
|---|---|---|
| Authoritative `ParkDesignPackage` | PARTIAL -> implemented in Phase 1 | Existing ZIP was authoritative in practice but fragmented. Phase 1 adds `park_design_package.json` without removing compatibility files. |
| Spatial program schema | PARTIAL -> extended | Ontology and parametric performance existed; canonical area, behavior, geometry-preference, dune-preference, authority, and provenance fields are now unified. Unknown geometry values remain null rather than invented. |
| Relationship model | PARTIAL -> extended | Multiple governed graph layers existed. Canonical relationships now share one shape while retaining authority and numeric provenance. |
| Persona journeys / OD matrix | PARTIAL -> extended | Ordered journeys existed. Phase 1 aggregates consecutive legs into deterministic movement demands. Frequency, dwell, mobility, and spending remain explicit null/empty inputs until evidenced. |
| Editable design objectives | MISSING -> scaffolded | Objective registry now exists with null designer-required weights; solver weights are not silently promoted into the contract. |
| Design-package API | MISSING -> implemented | Generate/register, latest, by ID/version, validation, JSON export, and optional program/relationship CSV export are implemented. Current repository is process-local and should later be replaced by the existing Supabase persistence layer. |
| Package validation | PARTIAL -> implemented in TypeScript | C# had import checks only. The canonical validator adds cross-reference, classification, area, geometry, objective, orphan, and movement checks with metrics. |
| Rhino package importer | PARTIAL | ZIP/folder/unified legacy loading exists. A Phase 2 adapter for canonical v1.4 fields and stable Rhino metadata remains. |
| Site registration / persistence | MISSING | No Rhino object registration workflow or document-user-data mapping exists. |
| Program proxies | PARTIAL | Bubbles, intent anchors, nodes, and routes exist; stable metadata and general polygon/rectangle/ellipse proxy strategies remain. |
| Spatial relationship compiler | PARTIAL | Accepted/designer/advisory graph compilation and forces exist; supervision/visibility/network semantics need extension. |
| Area solver abstraction | REFACTOR | Area relaxation is implemented but static; introduce `ILayoutSolver` before adding alternative solvers. |
| Movement and path network | PARTIAL | Routes, loops, desire lines, and MST-like networks exist; canonical OD demand must become an input and path generator should be modularized. |
| Dune kit / resolver | PARTIAL | D0-D10 parametric compatibility and morphology axes/baraha exist. Explainable per-program resolution and extensible primitive parameter definitions remain. |
| Terrain | PARTIAL | Sampling, route metrics, cut/fill, axes, and baraha exist. Low-poly deformation fields, slope/aspect grids, and resolved primitive terrain remain. |
| Hydrology | MISSING | Only bioswale/hydrozone intent exists; flow, accumulation, low points, and catchment interfaces remain. |
| Planting / Land Design | PARTIAL | Plant database, hydrozones, planting governance, and verification gates exist. Planting intent zones/points and neutral asset-provider adapters remain. |
| Park Brain validation | PARTIAL | Approved numeric rules and provenance are enforced at export/compile time. Object-level Rhino violation results and UI remain. |
| Design Inspector | MISSING | No Eto.Forms inspector or equivalent Rhino UI exists. |
| Unified scoring | PARTIAL | Layout energies, opportunity scores, and scenario summaries exist but not one inspectable component-score contract. |
| Optimization | PARTIAL | Strategies and access-combination fitness exist. Callable objective interfaces and a generic multi-objective adapter remain. |
| Debug visualization | PARTIAL | Relationship lines, route layers, scenario diagnostics, terrain metrics, and Grasshopper previews exist. Display conduits/toggles remain. |
| Determinism | PARTIAL | Solver seeds are implemented. Phase 1 adds seed/package metadata and deterministic canonical serialization/IDs. |
| Performance proxies | EXISTING | Core uses points, circles/curves, low-cost grid calculations, and meshes rather than detailed planting/Breps. |

## C. Phase 1 file changes

| File | Purpose | Change |
|---|---|---|
| `src/lib/designPackage/contract.ts` | Canonical schema, validation, deterministic serialization/ID, CSV adapters | Create |
| `src/lib/designPackage/canonicalAdapter.ts` | Adapt existing program/rule/journey/site models and aggregate OD demand | Create |
| `src/lib/designPackage/repository.ts` | Replaceable repository boundary for the HTTP API | Create |
| `src/server/designPackageApi.ts` | Design-package API endpoints | Create |
| `src/lib/gis/parkDesignPackage.ts` | Add canonical file to the existing ZIP; preserve all compatibility files | Modify |
| `src/components/results/ResultsTab.tsx` | Supply synthesized journeys and explicit site road-edge roles | Modify |
| `server.ts` | Register the new API | Modify |
| `tests/designPackage.test.ts` | Schema, invalid-area/reference, provenance, OD, and determinism tests | Create |
| `package.json` | Add focused test command | Modify |

## D. Independently testable commit plan

1. `feat(contract): add canonical ParkDesignPackage v1.4 and deterministic serialization`
2. `feat(contract): adapt Opportunity, journey, and approved-rule models into the package`
3. `feat(api): add design-package generation, retrieval, validation, and export routes`
4. `test(contract): cover validation, provenance, OD aggregation, and deterministic export`
5. `feat(rhino): import canonical v1.4 with stable document/object metadata` (Phase 2)
6. `feat(layout): introduce ILayoutSolver and canonical scoring output` (Phase 3)
7. `feat(movement): drive modular path generation from canonical OD demand` (Phase 4)
8. `feat(dunes): add extensible primitive definitions and explainable resolver` (Phase 5)

Heavy Rhino terrain and detailed geometry remain intentionally outside Phase 1.
