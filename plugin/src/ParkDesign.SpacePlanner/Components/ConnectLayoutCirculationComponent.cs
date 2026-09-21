using System.Text.Json;
using Grasshopper.Kernel;
using Rhino;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace ParkDesign.SpacePlanner.Components;

public sealed class ConnectLayoutCirculationComponent : GH_Component
{
    public ConnectLayoutCirculationComponent() : base(
        "Connect Layout + Circulation", "ConnectParkFlow",
        "Audits walking, cycling and service corridors against packed spaces, subtracts unique corridor area from usable area, and reports deterministic repacking requirements.",
        "Park Design", "Planning") { }

    public override Guid ComponentGuid => new("E356482F-C9F8-48A1-879B-772B5754AD90");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddCurveParameter("Spaces", "S", "Packed closed space footprints.", GH_ParamAccess.list);
        p.AddTextParameter("Program IDs", "ID", "IDs matching Spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Program Names", "N", "Names matching Spaces.", GH_ParamAccess.list);
        p.AddNumberParameter("Target Usable Areas", "TA", "Net target areas matching Spaces.", GH_ParamAccess.list);
        p.AddCurveParameter("Walking Paths", "W", "Walking centrelines.", GH_ParamAccess.list);
        p.AddCurveParameter("Cycling Paths", "C", "Cycling centrelines.", GH_ParamAccess.list);
        p.AddCurveParameter("Service Paths", "SV", "Dedicated service centrelines.", GH_ParamAccess.list);
        p.AddNumberParameter("Walking Width", "WW", "Walking corridor width.", GH_ParamAccess.item, 1.5);
        p.AddNumberParameter("Cycling Width", "CW", "Cycling corridor width.", GH_ParamAccess.item, 2.5);
        p.AddNumberParameter("Service Width", "SW", "Service corridor width.", GH_ParamAccess.item, 3.0);
        p.AddNumberParameter("Area Tolerance", "AT", "Maximum net-area deficiency ratio.", GH_ParamAccess.item, .02);
        p.AddBooleanParameter("Run", "R", "Run the connection audit.", GH_ParamAccess.item, false);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddCurveParameter("Corridor Footprints", "CF", "Unique walking/cycling/service corridor footprints used for area accounting.", GH_ParamAccess.list);
        p.AddPointParameter("Controlled Crossings", "X", "Walking/cycling centreline intersections.", GH_ParamAccess.list);
        p.AddNumberParameter("Internal Path Areas", "PA", "Unique corridor area inside each matching space.", GH_ParamAccess.list);
        p.AddNumberParameter("Net Usable Areas", "NA", "Gross footprint minus unique internal corridor area.", GH_ParamAccess.list);
        p.AddNumberParameter("Required Gross Areas", "GA", "Gross area required to restore each target net area.", GH_ParamAccess.list);
        p.AddBooleanParameter("Needs Repack", "R", "True per space when net area is below the approved tolerance.", GH_ParamAccess.list);
        p.AddTextParameter("Area Records", "D", "Auditable JSON records matching Spaces.", GH_ParamAccess.list);
        p.AddTextParameter("Service Conflicts", "SC", "Public spaces intersected by the forbidden service corridor.", GH_ParamAccess.list);
        p.AddTextParameter("Summary", "I", "Connection and repacking summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var spaces = new List<Curve>(); var ids = new List<string>(); var names = new List<string>();
        var targets = new List<double>(); var walking = new List<Curve>(); var cycling = new List<Curve>(); var service = new List<Curve>();
        var walkingWidth = 1.5; var cyclingWidth = 2.5; var serviceWidth = 3d; var toleranceRatio = .02; var run = false;
        data.GetDataList(0, spaces); data.GetDataList(1, ids); data.GetDataList(2, names); data.GetDataList(3, targets);
        data.GetDataList(4, walking); data.GetDataList(5, cycling); data.GetDataList(6, service);
        data.GetData(7, ref walkingWidth); data.GetData(8, ref cyclingWidth); data.GetData(9, ref serviceWidth);
        data.GetData(10, ref toleranceRatio); data.GetData(11, ref run);
        if (!run) return;
        try
        {
            if (spaces.Count != ids.Count || spaces.Count != names.Count || spaces.Count != targets.Count)
                throw new ArgumentException("Spaces, Program IDs, Program Names and Target Usable Areas must match.");
            if (spaces.Any(space => !space.IsClosed)) throw new ArgumentException("Every space must be closed.");
            if (walkingWidth <= 0 || cyclingWidth <= 0 || serviceWidth <= 0 || toleranceRatio is < 0 or > .25)
                throw new ArgumentException("Widths must be positive and Area Tolerance must be between 0 and 0.25.");
            var tolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? .01;
            var walkingCorridors = walking.Select(path => Corridor(path, walkingWidth, tolerance)).Where(curve => curve is not null).Cast<Curve>().ToList();
            var cyclingCorridors = cycling.Select(path => Corridor(path, cyclingWidth, tolerance)).Where(curve => curve is not null).Cast<Curve>().ToList();
            var serviceCorridors = service.Select(path => Corridor(path, serviceWidth, tolerance)).Where(curve => curve is not null).Cast<Curve>().ToList();
            var allCorridors = walkingCorridors.Concat(cyclingCorridors).Concat(serviceCorridors).ToList();
            var uniqueCorridors = allCorridors.Count == 0 ? [] : Curve.CreateBooleanUnion(allCorridors, tolerance)?.ToList() ?? allCorridors;
            var pathAreas = new List<double>(); var netAreas = new List<double>(); var requiredGross = new List<double>();
            var needsRepack = new List<bool>(); var records = new List<string>(); var serviceConflicts = new List<string>();
            for (var index = 0; index < spaces.Count; index++)
            {
                var gross = Math.Abs(AreaMassProperties.Compute(spaces[index])?.Area ?? 0);
                var internalArea = IntersectionArea(spaces[index], uniqueCorridors, tolerance);
                var net = Math.Max(0, gross - internalArea);
                var minimum = targets[index] * (1 - toleranceRatio);
                var repack = net + tolerance * tolerance < minimum;
                var required = Math.Max(gross, targets[index] + internalArea);
                pathAreas.Add(internalArea); netAreas.Add(net); requiredGross.Add(required); needsRepack.Add(repack);
                records.Add(JsonSerializer.Serialize(new { program_id = ids[index], gross_area_m2 = gross,
                    internal_path_area_m2 = internalArea, net_usable_area_m2 = net, target_usable_area_m2 = targets[index],
                    minimum_accepted_area_m2 = minimum, required_gross_area_m2 = required, needs_repack = repack }));
                if (!ContainsAny($"{ids[index]} {names[index]}", "operation", "maintenance", "service yard")
                    && IntersectionArea(spaces[index], serviceCorridors, tolerance) > tolerance * tolerance)
                    serviceConflicts.Add($"SERVICE_PUBLIC_CONFLICT: service corridor intersects '{ids[index]}'.");
            }
            var crossings = new List<Point3d>();
            foreach (var walk in walking)
            foreach (var cycle in cycling)
            {
                var intersections = Intersection.CurveCurve(walk, cycle, tolerance, tolerance);
                if (intersections is null) continue;
                crossings.AddRange(intersections.Where(item => item.IsPoint).Select(item => item.PointA));
            }
            data.SetDataList(0, uniqueCorridors); data.SetDataList(1, crossings); data.SetDataList(2, pathAreas);
            data.SetDataList(3, netAreas); data.SetDataList(4, requiredGross); data.SetDataList(5, needsRepack);
            data.SetDataList(6, records); data.SetDataList(7, serviceConflicts);
            data.SetData(8, $"{spaces.Count} spaces | {uniqueCorridors.Count} unique corridor footprints | " +
                $"{crossings.Count} controlled crossing candidates | {needsRepack.Count(value => value)} spaces need repacking | " +
                $"{serviceConflicts.Count} forbidden service conflicts.");
            foreach (var conflict in serviceConflicts) AddRuntimeMessage(GH_RuntimeMessageLevel.Error, conflict);
        }
        catch (Exception exception) { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message); }
    }

    private static Curve? Corridor(Curve path, double width, double tolerance)
    {
        var left = path.Offset(Plane.WorldXY, width / 2, tolerance, CurveOffsetCornerStyle.Round)?.OrderByDescending(curve => curve.GetLength()).FirstOrDefault();
        var right = path.Offset(Plane.WorldXY, -width / 2, tolerance, CurveOffsetCornerStyle.Round)?.OrderByDescending(curve => curve.GetLength()).FirstOrDefault();
        if (left is null || right is null) return null;
        var joined = Curve.JoinCurves([left, new LineCurve(left.PointAtEnd, right.PointAtEnd), right,
            new LineCurve(right.PointAtStart, left.PointAtStart)], tolerance);
        return joined?.FirstOrDefault(curve => curve.IsClosed);
    }

    private static double IntersectionArea(Curve space, IEnumerable<Curve> corridors, double tolerance)
    {
        var area = 0d;
        foreach (var corridor in corridors)
        {
            var intersections = Curve.CreateBooleanIntersection(space, corridor, tolerance);
            if (intersections is null) continue;
            area += intersections.Sum(curve => Math.Abs(AreaMassProperties.Compute(curve)?.Area ?? 0));
        }
        return area;
    }

    private static bool ContainsAny(string value, params string[] terms) =>
        terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
}
