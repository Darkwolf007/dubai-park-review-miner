# Park Design Space Planner

Rhino 8 / Grasshopper plugin foundation for deterministic, evidence-aware park-space distribution.

## Current component

`Distribute Park Spaces` accepts:

- a closed, planar site boundary in EPSG:32640 coordinates;
- a path to the current Results Grasshopper JSON or a `ParkDesignPackage` v1 JSON;
- a deterministic seed; and
- a run toggle.

It validates metre units and EPSG:32640, converts approved target areas to equal-area circles, and places non-overlapping bubbles fully inside the boundary. It does not yet apply suitability grids, entrances, exclusions, accepted relationship forces, activity-zone clustering, or layout optimization.

When the compact current Results manifest is loaded, the component reports that the grid and relationship graph are absent. It never fabricates those inputs.

## Build

```powershell
dotnet build ParkDesign.SpacePlanner.sln
dotnet run --project tests/ParkDesign.SpacePlanner.SmokeTests/ParkDesign.SpacePlanner.SmokeTests.csproj
```

Copy the runtime bundle from `src/ParkDesign.SpacePlanner/bin/Debug/net8.0/` into a dedicated folder under your Grasshopper Libraries folder:

- `ParkDesign.SpacePlanner.gha`
- `ParkDesign.SpacePlanner.Core.dll`
- `ParkDesign.SpacePlanner.deps.json`

Then unblock the downloaded/copied files in Windows file properties if required. The `.pdb` files are optional debugging symbols.

## Coordinate contract

- Rhino document units: metres
- Boundary coordinates: EPSG:32640
- Exported grid coordinates: EPSG:32640
- No bounding-box stretching, inferred reprojection, or silent coordinate correction

The current legacy Results export does not identify whether program areas are designer-approved. Those bubbles are therefore a provisional planning visualization and the component emits a legacy-package warning. The unified package will carry explicit area-authority statuses.
