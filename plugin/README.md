# Park Design Space Planner

Rhino 8 / Grasshopper plugin foundation for deterministic, evidence-aware park-space distribution. This checkout is pinned to the installed Rhino `8.15.25019.13001` SDK and its .NET 7 runtime so the component loads on the current workstation.

## Current component

`Distribute Park Spaces` accepts:

- a closed, planar site boundary in EPSG:32640 coordinates;
- a path to the Results **Park Design Package ZIP** (preferred), its extracted folder, a unified `ParkDesignPackage` v1 JSON, or the legacy Results JSON;
- a deterministic seed; and
- a run toggle;
- an `All Programs` compatibility toggle (the final mixed-design contract always processes every program); and
- a strategy: `AUTO`, `Balanced`, `Suitability`, or `Connectivity`; and
- `Use Package Boundary`, which explicitly selects the EPSG:32640 polygon in `site.json` instead of the Rhino input curve.

The ZIP keeps geometry types separate. `area_programs.json` drives area-correct bubbles, `node_programs.json` drives grid-ranked point placement, and `route_programs.json` drives conceptual linear or network centerlines. The package also carries the site, suitability grid, accepted and designer-approved relationship graphs, climate morphology, planting governance, unresolved decisions, and a human-readable README.

As of package schema v1.4, `park_design_package.json` is the canonical cross-application contract and is imported directly. The role-specific files remain supported compatibility views.

The component validates metre units and EPSG:32640 and runs five deterministic stages:

1. place every mandatory area program with a documented extent as an area-correct bubble using named suitability fields and hard grid exclusions; approved compatibility scores reduce separation between shared and overlay territories; if target totals exceed the site but documented minimums fit, use those minimums without scaling below them;
2. apply accepted evidence rules and separately identified designer-approved relationships as placement forces, while accepted mandatory numeric metre constraints remain fail-closed checks;
3. place point nodes on unique eligible grid cells using suitability, accepted and advisory adjacency, program-specific edge roles, and maximin spatial coverage so generic scores cannot collapse every amenity onto one boundary;
4. generate distinct loop bands, program-relevant desire lines, or minimum-spanning networks from each movement program's governed anchors without inventing widths; and
5. compare Balanced, Suitability, and Connectivity scenarios when `AUTO` is selected.

The original Bubbles, Centers, Names, Warnings, and Summary outputs are unchanged. Additional outputs expose Nodes, Node Names, Routes, Route Names, governed Relationship lines, Relationship Names, Scenario summaries, climate-axis curves, axis metadata, baraha points, and baraha scoring data.

`ParkBubbles` also exposes `Route Program IDs`, `Route GIS Layers`, `Loop Routes`, and `Loop Names`. Conceptual jogging and exercise-cycling loops use separate radial inset bands so they remain visible in Rhino; these are planning geometry, not surveyed construction offsets. Connect `Routes`, `Route Names`, and `Route GIS Layers` to `BakeRoutes`, then pulse its Bake input to create color-coded Rhino layers beneath `PARK_DESIGN_GIS`.

Schema v1.4 quantities are exposed without inventing construction standards. `Area Reconciliation` and `Design Estimate` return the exported JSON statements, while `Area Proxy Data` and `Route Proxy Data` match the generated geometry by stable program ID. Route records include topology, generated and target length, approved/default width, approximate footprint, and the exported early-stage system cost. Walking remains an interior connector network; jogging and exercise cycling remain distinct loops; service access remains an entrance-to-operations spur.

The walking network is a deterministic minimum-cost connector graph whose edge costs combine geometric distance with the canonical persona OD weights. Connectors terminate at area-proxy edges and add boundary-safe detour vertices around unrelated area bubbles where feasible. Accessibility and shade are stored as attributes on walking segments rather than duplicated centerlines. `Route Corridor Edges` offsets physical centerlines by half the exported width; `Route Corridor Data` reports the associated footprint, source length, layer, and stable program ID. These are width-aware planning proxies, not detailed pavement geometry.

For a readable zoning view, use `Exclusive Territories` together with `Shared Territories` instead of previewing the legacy `Bubbles` output. Approved temporal/shared-footprint relationships consolidate eight shared programs into six physical proxies for the current package; each JSON record preserves its member IDs, nominal demand, compatibility, host, and estimated occupied footprint. `Landscape Overlays` separately exposes the four coverage-equivalent canopy, native planting, habitat, and bioswale circles. `Territory Reconciliation` keeps these non-additive overlay and shared assumptions explicit.

For the clean Rhino handoff, connect `Clean Geometry`, `Clean Geometry Names`, and `Clean Geometry Layers` to `BakePark`. The flattened stream includes the resolved site boundary, consolidated exclusive/shared territories, separate landscape overlays, movement centerlines and width-aware corridor edges, clipped dune morphology guides, and governed Baraha candidate footprints. It deliberately excludes relationship lines and solver diagnostics. `BakePark` creates a `PARK_DESIGN` layer hierarchy and can replace only the objects it previously baked.

Baraha footprints are alternative candidates and may overlap each other; they are isolated on `PARK_DESIGN::05_MORPHOLOGY::Baraha Alternatives` and must not be read as simultaneous built clearings. `Dune Morphology Data` identifies the primary sikka and ventilation cuts as planar guides and carries the package terrain rules. The plugin does not invent dune widths, ridge surfaces, hollows, or elevations. Those geometries remain unresolved until the authoritative terrain mesh is supplied to the Terrain components.

The component stops with `GRID_BOUNDARY_MISMATCH` when no exported grid centroid lies inside the selected boundary. It never translates or stretches the grid to make a mismatched boundary appear valid. `Resolved Boundary` exposes the exact polygon used by the engines.

Routes are conceptual centerlines, not construction geometry. Walking, accessible, shaded, service, irrigation, and lighting systems use different program-anchor sets; jogging and exercise cycling use separate inset bands. The engine does not invent gates, widths, turning radii, slopes, obstacles, or visibility obstructions. Those require supplied design/GIS inputs or approved standards.

When the compact current Results manifest is loaded, the component reports that the grid and relationship graph are absent. It never fabricates those inputs.

## Build

```powershell
dotnet build ParkDesign.SpacePlanner.sln
dotnet run --project tests/ParkDesign.SpacePlanner.SmokeTests/ParkDesign.SpacePlanner.SmokeTests.csproj
```

Debug builds automatically deploy these runtime files to `%APPDATA%\Grasshopper\Libraries`:

- `ParkDesign.SpacePlanner.gha`
- `ParkDesign.SpacePlanner.Core.dll`
- `ParkDesign.SpacePlanner.deps.json`

The `.pdb` files remain in the build output so Visual Studio can resolve breakpoints.

## Debug in Rhino 8

1. Close every running Rhino instance before rebuilding; loaded Grasshopper assemblies are locked.
2. Open `ParkDesign.SpacePlanner.sln` in Visual Studio 2022.
3. Set `ParkDesign.SpacePlanner` as the startup project.
4. Select the `Rhino 8 + Grasshopper` launch profile.
5. Put a breakpoint inside `DistributeSpacesComponent.SolveInstance`.
6. Press `F5`. Rhino starts with the .NET 7 runtime used by the installed Rhino 8.15 build and opens Grasshopper.
7. In Grasshopper, open the `Park Design` tab and the `Planning` panel, or double-click the canvas and search for `ParkBubbles`.

The breakpoint is reached when the component has its required inputs and `Run` is set to `True`.

If the tab is missing, use Grasshopper's `File > Special Folders > Components Folder` and confirm the three deployed runtime files are present. Close Rhino, rebuild Debug, and launch again.

## Coordinate contract

- Rhino document units: metres
- Boundary coordinates: EPSG:32640
- Exported grid coordinates: EPSG:32640
- No bounding-box stretching, inferred reprojection, or silent coordinate correction

The current legacy Results export does not identify whether program areas are designer-approved. Those bubbles are therefore a provisional planning visualization and the component emits a legacy-package warning. The new ZIP carries explicit area-authority statuses; system/AI recommendations still require designer approval before they become authoritative design requirements.

The current Al Safa 2 package carries 44 mixed programs: sixteen area programs with numeric ranges, six area programs whose extents remain unresolved, fourteen point nodes, and eight route/network programs including exercise cycling. All are represented. Unresolved areas appear as `Area Intent Anchors` rather than fabricated circles.

## Access optimization components

The `Park Design > Optimization` panel contains:

- `AccessCandidates`, which reads every georeferenced boundary candidate, eligibility flag, hard exclusion, raw demand metric, and normalized access score. The list index is the integer gene used by the optimizer.
- `AccessFitness`, which accepts main, secondary, and service candidate indices. It rejects duplicate, ineligible, school-facing, and building-facing choices and outputs raw access metrics plus eight minimization-ready Wallacei fitness values. Objectives whose design intent is maximization are negated; invalid combinations receive `1e9` on every fitness output.

The access evaluator uses exported pair metrics and does not invent service/public path conflicts. That conflict can only be evaluated after route geometry exists. Population pull remains a modeled potential-demand proxy, not observed pedestrian counts.

## Authoritative CAD grid

`CADGrid` in `Park Design > GIS` reads closed curves and hatch boundaries directly from named Rhino layers and exports EPSG:32640 plus EPSG:4326 GeoJSON without AutoCAD. Connect the UTM result to the optional `ParkBubbles.CAD Grid GeoJSON` input to replace the package-generated analysis grid. See [docs/cad-grid-workflow.md](docs/cad-grid-workflow.md).

## Terrain and dune-generation components

The `Park Design > Terrain` panel contains `SelectBaraha`, `DuneTerrain`, `TerrainGrid`, `RouteTerrain`, and `CutFill`. `SelectBaraha` converts ranked overlapping alternatives into a boundary-safe, mutually separated shortlist. `DuneTerrain` creates a preliminary proposed mesh with paired ridges beside low/open sikka and ventilation axes, protected Baraha interiors, optional protected program territories, boundary fade, smoothing, and visible cut/fill-balancing strength. The evaluation components then sample terrain, evaluate walking/jogging/exercise-cycling routes, and compare existing/proposed grading meshes with raw numeric outputs suitable for Wallacei. See [docs/terrain-optimization.md](docs/terrain-optimization.md) for the Grasshopper wiring and objective contract.
