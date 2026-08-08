# Rhino CAD grid to GeoJSON

`CADGrid` converts closed curves and outer hatch boundaries already loaded in Rhino into an authoritative analysis grid. AutoCAD is not required.

## Rhino preparation

1. Keep the Rhino document in metres and retain the EPSG:32640 location.
2. Put grid cells on clearly named Rhino layers, for example `BASEGRID::CELLS`.
3. Each analysis cell must be a closed planar curve or hatch outer boundary. Open construction lines are not cells.
4. Clip boundary cells to the site boundary in Rhino. `CADGrid` rejects cells that cross outside rather than silently clipping them.
5. Keep existing/site evidence separate from proposed masterplan geometry so proposed design does not become circular input evidence.

## Grasshopper wiring

1. Add `CADGrid` from `Park Design > GIS`.
2. Connect `ParkBubbles.Resolved Boundary` or the matching EPSG:32640 site boundary to `Site Boundary`.
3. Supply one or more layer filters. Wildcards are accepted, such as `*BASEGRID*` or `BASEGRID::*`.
4. Leave `Run` true. Inspect `Grid Cells`, `Cell IDs`, `Source Layers`, `Areas`, and `Rejected` before exporting.
5. Connect a folder path and pulse `Export` with a Grasshopper Button.

The component writes:

- `<name>_utm.geojson`: EPSG:32640 computational grid for Grasshopper.
- `<name>_wgs84.geojson`: EPSG:4326 web-map derivative.

Connect the `_utm.geojson` path to the optional `ParkBubbles.CAD Grid GeoJSON` input. The designer-CAD cells then replace the package-generated grid. Existing suitability scores and hard constraints are transferred from the nearest package-grid centroid; the summary explicitly reports `designer CAD` authority.

## Validation behavior

- Rejects open, non-planar, negligible-area, duplicate, off-site, and boundary-crossing cells.
- Generates stable IDs by north-to-south, west-to-east centroid order.
- Preserves source layer, cell area, polygon geometry, authority, and CRS provenance.
- Does not infer program scores from hatch colors or names.
- Does not flatten the OBJ terrain into GeoJSON. Terrain remains an authoritative mesh for elevation, slope, drainage, routes, and cut/fill analysis.
