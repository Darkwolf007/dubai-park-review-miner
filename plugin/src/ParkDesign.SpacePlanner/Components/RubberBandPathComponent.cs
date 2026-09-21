using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class RubberBandPathComponent : GH_Component
{
    public RubberBandPathComponent() : base("Rubber Band Path", "RubberPath",
        "Creates a shortest visibility-graph path around full-width inflated space obstacles, then removes unnecessary bends.",
        "Park Design", "Planning") { }
    public override Guid ComponentGuid => new("94EC160B-2FD9-4D7C-8D45-81C2C4A2B91D");
    protected override System.Drawing.Bitmap? Icon => null;
    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddCurveParameter("Boundary", "B", "Closed site boundary.", GH_ParamAccess.item);
        p.AddCurveParameter("Input Curve", "C", "Open route or closed/periodic loop guide. Open endpoints remain fixed; loops are rerouted and closed again.", GH_ParamAccess.item);
        p.AddCurveParameter("Obstacles", "O", "Closed forbidden space polygons.", GH_ParamAccess.list);
        p.AddTextParameter("Obstacle IDs", "ID", "IDs matching obstacles.", GH_ParamAccess.list);
        p.AddNumberParameter("Corridor Width", "W", "Full corridor width in metres.", GH_ParamAccess.item, 1.5);
        p.AddBooleanParameter("Run", "R", "Generate path.", GH_ParamAccess.item, false);
    }
    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddCurveParameter("Path", "P", "Rubber-band path centreline.", GH_ParamAccess.item);
        p.AddNumberParameter("Length", "L", "Path length in metres.", GH_ParamAccess.item);
        p.AddTextParameter("Status", "S", "Routing status.", GH_ParamAccess.item);
        p.AddTextParameter("Touched Obstacles", "T", "Obstacle vertices used by the path.", GH_ParamAccess.list);
    }
    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null; Curve? inputCurve = null;
        var obstacles = new List<Curve>(); var ids = new List<string>(); var width = 1.5; var run = false;
        if (!data.GetData(0, ref boundary) || boundary is null || !data.GetData(1, ref inputCurve) || inputCurve is null) return;
        data.GetDataList(2, obstacles); data.GetDataList(3, ids); data.GetData(4, ref width); data.GetData(5, ref run);
        if (!run) return;
        try
        {
            if (ids.Count != obstacles.Count) throw new ArgumentException("Obstacle IDs must match Obstacles.");
            var site = Ring(boundary);
            var obstacleModels = obstacles.Select((curve, index) => new RubberBandObstacle(ids[index], Ring(curve))).ToList();
            var guideParameters = inputCurve.DivideByLength(Math.Max(5, width * 4), true)
                ?? inputCurve.DivideByCount(8, true) ?? [];
            var isLoop = inputCurve.IsClosed || inputCurve.IsPeriodic;
            var sampledGuide = guideParameters.Select(parameter => ToPoint(inputCurve.PointAt(parameter))).ToList();
            if (isLoop && sampledGuide.Count > 1 && PolygonMath.Distance(sampledGuide[0], sampledGuide[^1]) < .001)
                sampledGuide.RemoveAt(sampledGuide.Count - 1);
            var guide = sampledGuide.Where((point, index) => !isLoop && (index == 0 || index == sampledGuide.Count - 1)
                    || obstacleModels.All(obstacle => !PolygonMath.Contains(obstacle.Ring, point)))
                .ToList();
            if (!isLoop)
            {
                if (guide.Count == 0 || PolygonMath.Distance(guide[0], ToPoint(inputCurve.PointAtStart)) > .001)
                    guide.Insert(0, ToPoint(inputCurve.PointAtStart));
                if (PolygonMath.Distance(guide[^1], ToPoint(inputCurve.PointAtEnd)) > .001)
                    guide.Add(ToPoint(inputCurve.PointAtEnd));
            }
            if (guide.Count < (isLoop ? 3 : 2))
                throw new ArgumentException(isLoop
                    ? "The periodic input curve has fewer than three obstacle-free guide samples."
                    : "The input curve has no usable guide span.");
            var combined = new List<Point2>(); var touched = new HashSet<string>(StringComparer.Ordinal); var found = true;
            var segmentCount = isLoop ? guide.Count : guide.Count - 1;
            for (var index = 0; index < segmentCount; index++)
            {
                var nextIndex = (index + 1) % guide.Count;
                var segment = RubberBandPathfinder.Find(guide[index], guide[nextIndex], site, obstacleModels, width);
                if (!segment.Found) { found = false; break; }
                if (combined.Count == 0) combined.AddRange(segment.Points); else combined.AddRange(segment.Points.Skip(1));
                foreach (var id in segment.TouchedObstacleIds) touched.Add(id);
            }
            if (isLoop && found && combined.Count > 0 && PolygonMath.Distance(combined[0], combined[^1]) > .001)
                combined.Add(combined[0]);
            var length = combined.Zip(combined.Skip(1), PolygonMath.Distance).Sum();
            if (found) data.SetData(0, new PolylineCurve(combined.Select(Point)));
            data.SetData(1, length); data.SetData(2, found
                ? isLoop ? "curve_guided_periodic_visibility_graph" : "curve_guided_visibility_graph"
                : "no_clear_corridor");
            data.SetDataList(3, touched);
            if (!found) AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "No clear full-width route was found along the input curve guide.");
        }
        catch (Exception exception) { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message); }
    }
    private static List<Point2> Ring(Curve curve)
    {
        var parameters = curve.DivideByCount(Math.Clamp((int)Math.Ceiling(curve.GetLength()), 8, 512), true) ?? [];
        var ring = parameters.Select(parameter => ToPoint(curve.PointAt(parameter))).ToList();
        if (ring.Count > 1 && PolygonMath.Distance(ring[0], ring[^1]) < .001) ring.RemoveAt(ring.Count - 1);
        return ring;
    }
    private static Point2 ToPoint(Point3d point) => new(point.X, point.Y);
    private static Point3d Point(Point2 point) => new(point.X, point.Y, 0);
}
