# Terrain and Movement Optimization

The terrain workflow uses an authoritative Rhino mesh. XY and Z must both be in metres and must share the park package's horizontal location. Vertical datum and survey source remain project metadata; the plugin does not infer or repair them.

## Components

### Sample Park Terrain (`TerrainGrid`)

Inputs: terrain mesh, grid spacing and Run. Outputs vertically sampled points with elevation, local slope percentage and downslope aspect. Use these fields to visualize terrain or feed later route and landscape-region generators.

### Evaluate Terrain Routes (`RouteTerrain`)

Inputs: terrain mesh, route centerlines, mode label, sample spacing, an Enforce Max Slope Boolean, an explicitly supplied Max Slope Percent and Run. Instantiate it separately for walking, jogging, exercise cycling and service circulation.

Outputs per route: projected curve, horizontal length, terrain length, elevation gain/loss, maximum slope, weighted average slope and slope-violation length. Aggregated Total Length, Total Gain, Worst Slope and Total Violation outputs can connect to Wallacei fitness inputs.

No default maximum slope is hidden in the component. A Park Brain result becomes computational only after citation review and designer approval.

### Estimate Park Cut Fill (`CutFill`)

Inputs: existing mesh, proposed mesh, grid spacing and Run. Outputs sampled elevation differences plus approximate cut, fill, net, total earthwork, disturbed area, maximum depths and balance ratio.

The calculation is a vertical grid approximation, not a survey quantity. Use a coarse spacing during optimization and a finer spacing when comparing shortlisted solutions.

## Wallacei wiring

Use numeric sliders for genes such as entrance indices, layout seed, terrain-control-point Z offsets, route attraction weights and route-sharing switches (0 or 1). Rebuild proposed terrain and movement curves from those genes, then connect raw evaluator outputs to Wallacei objectives.

Suggested objective directions:

- exercise cycling terrain length: maximize by minimizing its negative value;
- jogging and cycling elevation gain: minimize or retain as a visible trade-off;
- walking slope-violation length: minimize to zero when accessibility is enforced;
- worst cycling slope: minimize;
- total cut plus fill: minimize;
- cut/fill balance ratio: minimize toward zero;
- pedestrian/cycle conflict and route crossings: minimize once the movement-network evaluator is implemented.

Do not maximize route length alone: an optimizer will create loops, wiggles and repeated segments. Pair length with self-intersection, curvature, repeated-edge, conflict and useful-coverage penalties.

The walking-accessibility Boolean determines which curves enter the hard slope check: either every pedestrian route or only the primary accessible network. A service-sharing Boolean belongs in the movement-network generator; terrain evaluation remains mode-neutral.

