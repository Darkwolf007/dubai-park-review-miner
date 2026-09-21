using System.Text.Json;
using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class LandscapeDetailZonesComponent : GH_Component
{
    private string? _cachedPackagePath;
    private DateTime _cachedPackageWriteTimeUtc;
    private DesignPackage? _cachedPackage;

    public LandscapeDetailZonesComponent() : base(
        "Landscape Detail Zones", "ParkLandscapeZones",
        "Scores shade and green-cover needs per program, then zones active shade, canopy trees, side trees, shrubs and planting while avoiding circulation corridors.",
        "Park Design", "Detail") { }

    public override Guid ComponentGuid => new("7FD5B57D-AE33-47F2-A1F2-B264AF2BFED7");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddCurveParameter("Spaces", "S", "Closed packed program footprints.", GH_ParamAccess.list);
        p.AddTextParameter("Program IDs", "ID", "Stable IDs matching Spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Program Names", "N", "Names matching Spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Design Package", "J", "Optional Park Design Package path supplying shade-demand scores.", GH_ParamAccess.item);
        p.AddCurveParameter("Corridor Footprints", "CF", "Optional closed walking, cycling and service footprints to keep clear.", GH_ParamAccess.list);
        p.AddVectorParameter("Afternoon Sun From", "SUN", "Planar vector pointing from each space toward the hot afternoon sun.", GH_ParamAccess.item, new Vector3d(-1, -1, 0));
        p.AddNumberParameter("Tree Spacing", "TS", "Nominal canopy/side-tree spacing in metres.", GH_ParamAccess.item, 7);
        p.AddNumberParameter("Tree Edge Setback", "ES", "Tree-line setback from the selected space edge.", GH_ParamAccess.item, 2);
        p.AddNumberParameter("Outer Green Width", "GW", "Width of the single continuous outer planting band.", GH_ParamAccess.item, 2.5);
        p.AddBooleanParameter("Run", "R", "Generate landscape detail zones.", GH_ParamAccess.item, false);
        p[3].Optional = true; p[4].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddNumberParameter("Shade Requirement", "SR", "Normalized shade demand matching Spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Shade Strategy", "SS", "Selected primary and optional secondary shade strategy.", GH_ParamAccess.list);
        p.AddTextParameter("Green Cover Mode", "GC", "OUTER_RING, FULL_COVER or NONE matching Spaces.", GH_ParamAccess.list);
        p.AddCurveParameter("Active Shade Zones", "AS", "Pergola, pavilion or tensile-canopy candidate zones.", GH_ParamAccess.list);
        p.AddTextParameter("Active Shade IDs", "ASID", "Program IDs matching Active Shade Zones.", GH_ParamAccess.list);
        p.AddCurveParameter("Canopy Tree Zones", "CTZ", "Internal canopy-tree candidate zones.", GH_ParamAccess.list);
        p.AddTextParameter("Canopy Zone IDs", "CTID", "Program IDs matching Canopy Tree Zones.", GH_ParamAccess.list);
        p.AddCurveParameter("Side Tree Lines", "STL", "Sun-facing edge lines for side trees.", GH_ParamAccess.list);
        p.AddTextParameter("Side Tree IDs", "STID", "Program IDs matching Side Tree Lines.", GH_ParamAccess.list);
        p.AddCurveParameter("Shrub Perimeters", "SP", "Low planting/screening perimeter curves.", GH_ParamAccess.list);
        p.AddTextParameter("Shrub IDs", "SPID", "Program IDs matching Shrub Perimeters.", GH_ParamAccess.list);
        p.AddPointParameter("Tree Points", "TP", "Indicative tree centres outside supplied corridor footprints.", GH_ParamAccess.list);
        p.AddTextParameter("Tree Point IDs", "TPID", "Program IDs matching Tree Points.", GH_ParamAccess.list);
        p.AddBrepParameter("Outer Green Bands", "OG", "One continuous perimeter green band for each OUTER_RING space.", GH_ParamAccess.list);
        p.AddTextParameter("Outer Green IDs", "OGID", "Program IDs matching Outer Green Bands.", GH_ParamAccess.list);
        p.AddBrepParameter("Full Green Covers", "FG", "Full-space green surfaces for FULL_COVER spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Full Green IDs", "FGID", "Program IDs matching Full Green Covers.", GH_ParamAccess.list);
        p.AddTextParameter("Landscape Records", "D", "Auditable shade-option scores, selected strategies and generated quantities.", GH_ParamAccess.list);
        p.AddTextParameter("Summary", "I", "Landscape zoning summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var spaces = new List<Curve>(); var ids = new List<string>(); var names = new List<string>();
        var packagePath = string.Empty; var corridors = new List<Curve>(); var sun = new Vector3d(-1, -1, 0);
        var treeSpacing = 7d; var edgeSetback = 2d; var greenWidth = 2.5; var run = false;
        data.GetDataList(0, spaces); data.GetDataList(1, ids); data.GetDataList(2, names);
        data.GetData(3, ref packagePath); data.GetDataList(4, corridors); data.GetData(5, ref sun);
        data.GetData(6, ref treeSpacing); data.GetData(7, ref edgeSetback); data.GetData(8, ref greenWidth); data.GetData(9, ref run);
        if (!run) return;
        try
        {
            if (spaces.Count == 0 || spaces.Count != ids.Count || spaces.Count != names.Count)
                throw new ArgumentException("Spaces, Program IDs and Program Names must be non-empty matching lists.");
            if (spaces.Any(space => !space.IsClosed)) throw new ArgumentException("Every space must be closed.");
            if (treeSpacing < 2 || edgeSetback < 0 || greenWidth <= 0)
                throw new ArgumentException("Tree Spacing must be at least 2m; setbacks cannot be negative and green width must be positive.");
            sun.Z = 0; if (!sun.Unitize()) sun = new Vector3d(-1, -1, 0);
            sun.Unitize();
            var tolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? .01;
            var package = string.IsNullOrWhiteSpace(packagePath) ? null : LoadPackageCached(packagePath);
            var programs = package?.Programs.ToDictionary(program => program.Id, StringComparer.OrdinalIgnoreCase)
                ?? new Dictionary<string, ProgramDefinition>(StringComparer.OrdinalIgnoreCase);
            var shadeRequirements = new List<double>(); var strategies = new List<string>(); var greenModes = new List<string>();
            var activeZones = new List<Curve>(); var canopyZones = new List<Curve>(); var sideLines = new List<Curve>();
            var shrubPerimeters = new List<Curve>(); var treePoints = new List<Point3d>();
            var outerGreen = new List<Brep>(); var fullGreen = new List<Brep>(); var records = new List<string>();
            var activeIds = new List<string>(); var canopyIds = new List<string>(); var sideIds = new List<string>();
            var shrubIds = new List<string>(); var treePointIds = new List<string>();
            var outerGreenIds = new List<string>(); var fullGreenIds = new List<string>();

            for (var index = 0; index < spaces.Count; index++)
            {
                var space = spaces[index]; var key = $"{ids[index]} {names[index]}";
                programs.TryGetValue(ids[index], out var program);
                var demand = ShadeDemand(program, key);
                var scores = TreatmentScores(key, demand);
                var ranked = scores.OrderByDescending(pair => pair.Value).ThenBy(pair => pair.Key, StringComparer.Ordinal).ToList();
                var selected = ranked[0].Key;
                var secondary = ranked.Count > 1 && demand >= .72 && ranked[1].Value >= ranked[0].Value - .12 ? ranked[1].Key : null;
                var strategy = secondary is null ? selected : $"{selected}+{secondary}";
                var greenMode = GreenMode(key);
                shadeRequirements.Add(demand); strategies.Add(strategy); greenModes.Add(greenMode);

                var center = AreaMassProperties.Compute(space)?.Centroid ?? space.GetBoundingBox(true).Center;
                var activeZone = (selected == "ACTIVE_SHADE" || secondary == "ACTIVE_SHADE") ? Scaled(space, center, .52) : null;
                if (activeZone is not null) { activeZones.Add(activeZone); activeIds.Add(ids[index]); }
                var canopyZone = (selected == "CANOPY_TREES" || secondary == "CANOPY_TREES")
                    ? InwardOffset(space, Math.Max(edgeSetback, 1), tolerance) : null;
                if (canopyZone is not null)
                {
                    canopyZones.Add(canopyZone); canopyIds.Add(ids[index]);
                    var points = GridPoints(canopyZone, corridors, treeSpacing, tolerance).ToList();
                    treePoints.AddRange(points); treePointIds.AddRange(Enumerable.Repeat(ids[index], points.Count));
                }
                Curve? sideLine = null;
                if (selected == "SIDE_TREES" || secondary == "SIDE_TREES")
                {
                    sideLine = SunFacingLine(space, center, sun, edgeSetback);
                    if (sideLine is not null)
                    {
                        sideLines.Add(sideLine); sideIds.Add(ids[index]);
                        var points = LinePoints(sideLine, corridors, treeSpacing, tolerance).ToList();
                        treePoints.AddRange(points); treePointIds.AddRange(Enumerable.Repeat(ids[index], points.Count));
                    }
                }
                if (selected == "SHRUBS_ONLY" || greenMode == "OUTER_RING")
                {
                    var shrub = InwardOffset(space, Math.Min(1, greenWidth * .4), tolerance) ?? space.DuplicateCurve();
                    shrubPerimeters.Add(shrub); shrubIds.Add(ids[index]);
                }
                if (greenMode == "OUTER_RING")
                {
                    var inner = InwardOffset(space, greenWidth, tolerance);
                    if (inner is not null)
                    {
                        var surfaces = PlanarRegion([space, inner], tolerance).ToList();
                        outerGreen.AddRange(surfaces); outerGreenIds.AddRange(Enumerable.Repeat(ids[index], surfaces.Count));
                    }
                }
                else if (greenMode == "FULL_COVER")
                {
                    var surfaces = PlanarRegion([space], tolerance).ToList();
                    fullGreen.AddRange(surfaces); fullGreenIds.AddRange(Enumerable.Repeat(ids[index], surfaces.Count));
                }

                records.Add(JsonSerializer.Serialize(new
                {
                    program_id = ids[index], program_name = names[index], shade_requirement = demand,
                    shade_scores = new { active_shade = scores["ACTIVE_SHADE"], canopy_trees = scores["CANOPY_TREES"],
                        side_trees = scores["SIDE_TREES"], shrubs_only = scores["SHRUBS_ONLY"] },
                    selected_primary = selected, selected_secondary = secondary, green_cover_mode = greenMode,
                    active_zone_generated = activeZone is not null, canopy_zone_generated = canopyZone is not null,
                    side_tree_line_generated = sideLine is not null,
                    authority = program is null ? "program_type_default" : "design_package_plus_program_type",
                    note = "Indicative landscape zoning; species, utilities, root volumes and irrigation require detailed design."
                }));
            }

            data.SetDataList(0, shadeRequirements); data.SetDataList(1, strategies); data.SetDataList(2, greenModes);
            data.SetDataList(3, activeZones); data.SetDataList(4, activeIds);
            data.SetDataList(5, canopyZones); data.SetDataList(6, canopyIds);
            data.SetDataList(7, sideLines); data.SetDataList(8, sideIds);
            data.SetDataList(9, shrubPerimeters); data.SetDataList(10, shrubIds);
            data.SetDataList(11, treePoints); data.SetDataList(12, treePointIds);
            data.SetDataList(13, outerGreen); data.SetDataList(14, outerGreenIds);
            data.SetDataList(15, fullGreen); data.SetDataList(16, fullGreenIds); data.SetDataList(17, records);
            data.SetData(18, $"{spaces.Count} spaces scored | {activeZones.Count} active-shade zones | {canopyZones.Count} canopy zones | " +
                $"{sideLines.Count} side-tree lines | {treePoints.Count} indicative trees | {outerGreen.Count} outer green surfaces | {fullGreen.Count} full green surfaces.");
        }
        catch (Exception exception) { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message); }
    }

    private static double ShadeDemand(ProgramDefinition? program, string key)
    {
        if (program is not null)
        {
            var value = program.PerformanceAttributes.FirstOrDefault(pair =>
                pair.Key.Equals("shadeDemand", StringComparison.OrdinalIgnoreCase)
                || pair.Key.Equals("shade_requirement", StringComparison.OrdinalIgnoreCase)).Value;
            if (value > 0) return Math.Clamp(value, 0, 1);
        }
        if (Contains(key, "toddler", "inclusive", "children", "quiet", "sensory", "picnic", "nature", "wellness", "fitness")) return .9;
        if (Contains(key, "plaza", "entrance", "drop", "gathering", "recreation")) return .78;
        if (Contains(key, "lawn", "court")) return .62;
        if (Contains(key, "operation", "maintenance")) return .45;
        return .65;
    }

    private static Dictionary<string, double> TreatmentScores(string key, double demand)
    {
        double Compatibility(params string[] terms) => Contains(key, terms) ? 1 : .35;
        var active = Math.Clamp(.6 * demand + .4 * Compatibility("play", "fitness", "plaza", "picnic", "wellness", "gathering", "entrance", "drop"), 0, 1);
        var canopy = Math.Clamp(.6 * demand + .4 * Compatibility("garden", "nature", "picnic", "play", "wellness", "recreation"), 0, 1);
        var side = Math.Clamp(.55 * demand + .45 * Compatibility("court", "lawn", "drop", "operation", "maintenance", "entrance"), 0, 1);
        var shrubs = Math.Clamp(.35 * (1 - demand) + .65 * Compatibility("operation", "maintenance", "court", "drop"), 0, 1);
        return new() { ["ACTIVE_SHADE"] = active, ["CANOPY_TREES"] = canopy, ["SIDE_TREES"] = side, ["SHRUBS_ONLY"] = shrubs };
    }

    private static string GreenMode(string key)
    {
        if (Contains(key, "garden", "nature", "picnic", "lawn", "recreation", "wellness", "event", "gathering")) return "FULL_COVER";
        if (Contains(key, "plaza", "entrance", "drop", "court", "fitness", "play", "operation", "maintenance")) return "OUTER_RING";
        return "OUTER_RING";
    }

    private static Curve Scaled(Curve source, Point3d center, double factor)
    {
        var result = source.DuplicateCurve(); result.Transform(Transform.Scale(center, factor)); return result;
    }

    private static Curve? InwardOffset(Curve source, double distance, double tolerance)
    {
        var sourceArea = Math.Abs(AreaMassProperties.Compute(source)?.Area ?? 0);
        var candidates = new List<Curve>();
        foreach (var signed in new[] { distance, -distance })
            candidates.AddRange(source.Offset(Plane.WorldXY, signed, tolerance, CurveOffsetCornerStyle.Sharp) ?? []);
        return candidates.Where(curve => curve.IsClosed)
            .Select(curve => (Curve: curve, Area: Math.Abs(AreaMassProperties.Compute(curve)?.Area ?? 0)))
            .Where(item => item.Area > tolerance * tolerance && item.Area < sourceArea - tolerance * tolerance)
            .OrderByDescending(item => item.Area).Select(item => item.Curve).FirstOrDefault();
    }

    private static Curve? SunFacingLine(Curve space, Point3d center, Vector3d sun, double setback)
    {
        if (!space.TryGetPolyline(out var polyline) || polyline.Count < 3) return null;
        var segments = Enumerable.Range(0, polyline.Count - 1).Select(index =>
        {
            var a = polyline[index]; var b = polyline[index + 1]; var midpoint = (a + b) / 2;
            return (A: a, B: b, Score: Vector3d.Multiply(midpoint - center, sun), Length: a.DistanceTo(b));
        }).Where(item => item.Length > 1).OrderByDescending(item => item.Score).ThenByDescending(item => item.Length).ToList();
        if (segments.Count == 0) return null;
        var edge = segments[0]; var midpoint = (edge.A + edge.B) / 2; var inward = center - midpoint;
        if (!inward.Unitize()) inward = Vector3d.Zero;
        var start = edge.A + (edge.B - edge.A) * .1 + inward * setback;
        var end = edge.B + (edge.A - edge.B) * .1 + inward * setback;
        return start.DistanceTo(end) > .1 ? new LineCurve(start, end) : null;
    }

    private static IEnumerable<Point3d> GridPoints(Curve zone, IReadOnlyList<Curve> corridors, double spacing, double tolerance)
    {
        var box = zone.GetBoundingBox(true); var points = new List<Point3d>();
        for (var x = box.Min.X + spacing / 2; x <= box.Max.X - spacing / 2; x += spacing)
        for (var y = box.Min.Y + spacing / 2; y <= box.Max.Y - spacing / 2; y += spacing)
        {
            var point = new Point3d(x, y, 0);
            if (zone.Contains(point, Plane.WorldXY, tolerance) == PointContainment.Inside && IsClear(point, corridors, tolerance)) points.Add(point);
        }
        return points;
    }

    private static IEnumerable<Point3d> LinePoints(Curve line, IReadOnlyList<Curve> corridors, double spacing, double tolerance)
    {
        var count = Math.Max(1, (int)Math.Floor(line.GetLength() / spacing));
        return (line.DivideByCount(count, true) ?? [line.Domain.Min, line.Domain.Max]).Select(line.PointAt)
            .Where(point => IsClear(point, corridors, tolerance));
    }

    private static bool IsClear(Point3d point, IEnumerable<Curve> corridors, double tolerance) => corridors.All(corridor =>
        !corridor.IsClosed || corridor.Contains(point, Plane.WorldXY, tolerance) != PointContainment.Inside);

    private static IEnumerable<Brep> PlanarRegion(IEnumerable<Curve> curves, double tolerance) =>
        Brep.CreatePlanarBreps(curves, tolerance) ?? [];

    private static bool Contains(string value, params string[] terms) =>
        terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));

    private DesignPackage LoadPackageCached(string path)
    {
        var normalized = Path.GetFullPath(path.Trim().Trim('"'));
        var writeTime = File.Exists(normalized) ? File.GetLastWriteTimeUtc(normalized) : DateTime.MinValue;
        if (_cachedPackage is not null && string.Equals(_cachedPackagePath, normalized, StringComparison.OrdinalIgnoreCase)
            && _cachedPackageWriteTimeUtc == writeTime) return _cachedPackage;
        _cachedPackage = DesignPackageLoader.LoadFile(normalized); _cachedPackagePath = normalized;
        _cachedPackageWriteTimeUtc = writeTime; return _cachedPackage;
    }
}
