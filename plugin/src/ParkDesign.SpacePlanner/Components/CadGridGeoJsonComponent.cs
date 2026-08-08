using System.Text.RegularExpressions;
using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class CadGridGeoJsonComponent : GH_Component
{
    private bool _lastExport;

    public CadGridGeoJsonComponent()
        : base("CAD Grid to GeoJSON", "CADGrid", "Reads closed curves and hatch boundaries from Rhino layers, validates an authoritative EPSG:32640 analysis grid, and exports UTM and WGS84 GeoJSON.", "Park Design", "GIS") { }

    public override Guid ComponentGuid => new("8E8AE08B-475B-45AA-B689-CFBBC58EC7EA");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Site Boundary", "B", "Closed EPSG:32640 site/package boundary used to reject off-site cells.", GH_ParamAccess.item);
        parameters.AddTextParameter("Layer Filters", "L", "Rhino full-layer names or wildcard filters. Empty defaults to *grid*.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Sample Spacing", "S", "Maximum approximate curve sampling spacing in metres for GeoJSON linear rings.", GH_ParamAccess.item, 0.5);
        parameters.AddTextParameter("Output Folder", "F", "Folder for basegrid_utm.geojson and basegrid_wgs84.geojson.", GH_ParamAccess.item);
        parameters.AddTextParameter("Base Name", "N", "Output filename stem.", GH_ParamAccess.item, "basegrid");
        parameters.AddBooleanParameter("Run", "R", "Read and validate Rhino grid geometry.", GH_ParamAccess.item, true);
        parameters.AddBooleanParameter("Export", "E", "Connect a Button. Files are written only on the rising pulse.", GH_ParamAccess.item, false);
        parameters[1].Optional = true;
        parameters[3].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Grid Cells", "C", "Accepted closed analysis-grid cell boundaries.", GH_ParamAccess.list);
        parameters.AddPointParameter("Centroids", "P", "Cell centroids matching Grid Cells.", GH_ParamAccess.list);
        parameters.AddTextParameter("Cell IDs", "ID", "Stable generated cell IDs matching Grid Cells.", GH_ParamAccess.list);
        parameters.AddTextParameter("Source Layers", "SL", "Rhino source layers matching Grid Cells.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Areas", "A", "Cell areas in square metres.", GH_ParamAccess.list);
        parameters.AddTextParameter("Rejected", "X", "Rejected geometry and validation reasons.", GH_ParamAccess.list);
        parameters.AddTextParameter("Available Layers", "AL", "Rhino layer inventory to help author Layer Filters.", GH_ParamAccess.list);
        parameters.AddTextParameter("Export Paths", "EP", "UTM and WGS84 GeoJSON paths written by the latest export pulse.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Grid validation and export summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null;
        var filters = new List<string>();
        var sampleSpacing = 0.5;
        var outputFolder = string.Empty;
        var baseName = "basegrid";
        var run = true;
        var export = false;
        if (!data.GetData(0, ref boundary) || boundary is null) return;
        data.GetDataList(1, filters);
        data.GetData(2, ref sampleSpacing);
        data.GetData(3, ref outputFolder);
        data.GetData(4, ref baseName);
        data.GetData(5, ref run);
        data.GetData(6, ref export);
        var exportPulse = export && !_lastExport;
        _lastExport = export;
        if (!run) return;

        var document = RhinoDoc.ActiveDoc;
        if (document is null)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "No active Rhino document is available.");
            return;
        }
        if (document.ModelUnitSystem != UnitSystem.Meters)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Rhino document units must be metres for EPSG:32640 export.");
            return;
        }
        if (!boundary.IsClosed || !boundary.IsPlanar())
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Site Boundary must be closed and planar.");
            return;
        }
        if (sampleSpacing <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Sample Spacing must be greater than zero.");
            return;
        }

        var availableLayers = document.Layers.Where(layer => !layer.IsDeleted).Select(layer => layer.FullPath).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList();
        data.SetDataList(6, availableLayers);
        var effectiveFilters = filters.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).ToList();
        if (effectiveFilters.Count == 0) effectiveFilters.Add("*grid*");
        var matchers = effectiveFilters.Select(WildcardRegex).ToList();
        var extracted = new List<(Curve Curve, string Layer)>();
        foreach (var obj in document.Objects.Where(obj => !obj.IsDeleted))
            CollectGeometry(document, obj, Transform.Identity, matchers, extracted, depth: 0);

        var rejected = new List<string>();
        var accepted = new List<(Curve Curve, string Layer, Point3d Centroid, double Area, List<Point2> Ring)>();
        var dedupe = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (curve, layer) in extracted)
        {
            if (!curve.IsClosed || !curve.IsPlanar())
            {
                rejected.Add($"{layer}: open or non-planar curve");
                continue;
            }
            var areaProperties = AreaMassProperties.Compute(curve);
            if (areaProperties is null || areaProperties.Area <= 0.01)
            {
                rejected.Add($"{layer}: zero or negligible enclosed area");
                continue;
            }
            var centroid = areaProperties.Centroid;
            if (boundary.Contains(centroid, Plane.WorldXY, document.ModelAbsoluteTolerance) == PointContainment.Outside)
            {
                rejected.Add($"{layer}: centroid outside Site Boundary at {centroid.X:0.###}, {centroid.Y:0.###}");
                continue;
            }
            var ring = SampleRing(curve, sampleSpacing, document.ModelAbsoluteTolerance);
            if (ring.Count < 4)
            {
                rejected.Add($"{layer}: could not produce a valid polygon ring");
                continue;
            }
            if (ring.Any(point => boundary.Contains(new Point3d(point.X, point.Y, 0), Plane.WorldXY, document.ModelAbsoluteTolerance) == PointContainment.Outside))
            {
                rejected.Add($"{layer}: cell crosses outside Site Boundary; clip it in Rhino before export");
                continue;
            }
            var key = $"{Math.Round(centroid.X, 3)}|{Math.Round(centroid.Y, 3)}|{Math.Round(areaProperties.Area, 3)}";
            if (!dedupe.Add(key))
            {
                rejected.Add($"{layer}: duplicate closed region at {centroid.X:0.###}, {centroid.Y:0.###}");
                continue;
            }
            accepted.Add((curve, layer, centroid, areaProperties.Area, ring));
        }

        accepted = accepted.OrderByDescending(item => item.Centroid.Y).ThenBy(item => item.Centroid.X).ToList();
        var features = accepted.Select((item, index) => new CadGridFeature(
            $"cad-grid-{index + 1:0000}", item.Layer, item.Ring, item.Area)).ToList();
        data.SetDataList(0, accepted.Select(item => item.Curve));
        data.SetDataList(1, accepted.Select(item => item.Centroid));
        data.SetDataList(2, features.Select(item => item.CellId));
        data.SetDataList(3, accepted.Select(item => item.Layer));
        data.SetDataList(4, accepted.Select(item => item.Area));
        data.SetDataList(5, rejected);

        var exportPaths = new List<string>();
        if (exportPulse)
        {
            if (features.Count == 0)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "No valid grid cells are available to export.");
            }
            else if (string.IsNullOrWhiteSpace(outputFolder))
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Output Folder is required when Export is pulsed.");
            }
            else
            {
                Directory.CreateDirectory(outputFolder);
                var safeBaseName = Regex.Replace(string.IsNullOrWhiteSpace(baseName) ? "basegrid" : baseName.Trim(), "[^A-Za-z0-9_-]+", "_");
                var utmPath = Path.Combine(outputFolder, safeBaseName + "_utm.geojson");
                var wgs84Path = Path.Combine(outputFolder, safeBaseName + "_wgs84.geojson");
                File.WriteAllText(utmPath, CadGridGeoJsonExporter.SerializeUtm(features));
                File.WriteAllText(wgs84Path, CadGridGeoJsonExporter.SerializeWgs84(features));
                exportPaths.Add(utmPath);
                exportPaths.Add(wgs84Path);
                AddRuntimeMessage(GH_RuntimeMessageLevel.Remark, $"Exported {features.Count} authoritative CAD grid cells in both CRS variants.");
            }
        }
        data.SetDataList(7, exportPaths);
        var matchedLayers = accepted.Select(item => item.Layer).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        data.SetData(8, $"{features.Count} accepted cells from {matchedLayers} layer(s) | {rejected.Count} rejected | filters {string.Join(", ", effectiveFilters)} | EPSG:32640 source; EPSG:4326 web derivative" + (exportPaths.Count > 0 ? " | exported" : " | preview only"));
        if (features.Count == 0)
            AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"No valid closed grid cells matched {string.Join(", ", effectiveFilters)}. Inspect Available Layers and update Layer Filters.");
    }

    private static void CollectGeometry(RhinoDoc document, RhinoObject obj, Transform transform, IReadOnlyList<Regex> matchers, List<(Curve Curve, string Layer)> output, int depth)
    {
        if (depth > 8) return;
        if (obj is InstanceObject instance)
        {
            var combined = transform * instance.InstanceXform;
            foreach (var child in instance.InstanceDefinition.GetObjects())
                CollectGeometry(document, child, combined, matchers, output, depth + 1);
            return;
        }

        var layer = obj.Attributes.LayerIndex >= 0 && obj.Attributes.LayerIndex < document.Layers.Count
            ? document.Layers[obj.Attributes.LayerIndex].FullPath
            : "Unassigned";
        if (!matchers.Any(matcher => matcher.IsMatch(layer))) return;
        var geometry = obj.Geometry.Duplicate();
        if (!transform.Equals(Transform.Identity)) geometry.Transform(transform);
        if (geometry is Curve curve)
        {
            output.Add((curve, layer));
            return;
        }
        if (geometry is Hatch hatch)
            foreach (var hatchCurve in hatch.Get3dCurves(outer: true))
                output.Add((hatchCurve, layer));
    }

    private static List<Point2> SampleRing(Curve curve, double spacing, double tolerance)
    {
        var length = curve.GetLength();
        var count = Math.Clamp((int)Math.Ceiling(length / spacing), 4, 4096);
        var parameters = curve.DivideByCount(count, includeEnds: true);
        if (parameters is null) return [];
        var ring = parameters.Select(parameter => curve.PointAt(parameter)).Select(point => new Point2(point.X, point.Y)).ToList();
        if (ring.Count == 0) return ring;
        if (PolygonMath.Distance(ring[0], ring[^1]) > tolerance) ring.Add(ring[0]);
        else ring[^1] = ring[0];
        return ring;
    }

    private static Regex WildcardRegex(string pattern) => new(
        "^" + Regex.Escape(pattern).Replace("\\*", ".*").Replace("\\?", ".") + "$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
}
