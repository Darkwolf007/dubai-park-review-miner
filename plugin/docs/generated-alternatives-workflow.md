# Test generated alternatives in Rhino 8

1. Close Rhino before replacing installed plugin files. Build without automatic deployment:

   ```powershell
   dotnet build plugin\src\ParkDesign.SpacePlanner\ParkDesign.SpacePlanner.csproj --no-restore -c Release
   ```

2. Copy `ParkDesign.SpacePlanner.gha`, `ParkDesign.SpacePlanner.Core.dll` and `ParkDesign.SpacePlanner.deps.json` from `plugin\src\ParkDesign.SpacePlanner\bin\Release\net7.0` into your Grasshopper Libraries folder, replacing the existing installation. Avoid loading a second copy. Restart Rhino.
3. Set Rhino model units to metres. Open Grasshopper and search for **ParkOptions** / **Generate Park Alternatives** under Park Design → Planning.
4. Connect a File Path to **J** pointing to the exported ZIP or canonical JSON with a site boundary. An extracted split package folder also works. The component uses the exact package boundary in EPSG:32640; it never moves or reprojects coordinates.
5. Start with **A = 2**, **S = 1**, **D = 0.08**, **O = 0**, and set **R = True**. Generation runs in a background task; larger packages may take time. Results appear automatically when it completes. Constraints and duplicate filtering can return fewer options.
6. Connect Panels to **SC**, **SS** and **W**. Preview **SP**, **P**, **N** and **B**. Use Rhino Zoom Extents because georeferenced geometry is far from the origin. Change **O** from zero to the last returned option index to compare geometry. Selection changes reuse cached solver results; changes to package content, seed, alternative count or diversity regenerate them.

## Expected checks

- Repeating the same package/settings/seed yields the same scenario records and geometry.
- Different retained options have different program-centre positions; no duplicate geometry is inserted merely to meet the requested count.
- Every returned option has solver-valid diagnostics. An incompatible CRS/unit, missing boundary, invalid count/index or unsupported numeric relationship produces an error.
- Shared/overlay circles remain per-program diagnostic proxies, not additive construction footprints.
- **SC** marks regulatory status `not_validated`. Suitability and solver scores do not certify shade, budget, route accessibility or Park Brain compliance.
- Nothing is baked into Rhino by this component. Grasshopper preview disappears when disabled. Approval/bake integration and live Park Brain validation are still separate pending stages.

Automated core verification:

```powershell
dotnet run --no-restore --project plugin\tests\ParkDesign.SpacePlanner.SmokeTests\ParkDesign.SpacePlanner.SmokeTests.csproj
```

