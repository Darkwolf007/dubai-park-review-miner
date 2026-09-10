using System.Text.Json;
using Grasshopper.Kernel;
using Rhino;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace ParkDesign.SpacePlanner.Components;

public sealed class TreemapPathNetworkComponent : GH_Component
{
    private sealed record Cell(int Index, string Id, string Name, Curve Boundary, Point3d Center, bool ServiceOnly);
    private sealed record Adjacency(int A, int B, Point3d Portal, double Weight);
    private sealed record SelectedEdge(Adjacency Edge, string Hierarchy);

    public TreemapPathNetworkComponent()
        : base(
            "Treemap Path Network",
            "TreemapPaths",
            "Builds one connected, hierarchical path graph from packed program cells. Shared cell edges become controlled access portals; service access remains separate.",
            "Park Design",
            "Planning")
    {
    }

    public override Guid ComponentGuid => new("42BD438F-9BE0-4F08-87E5-37E5A2948649");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Boundary", "B", "Closed site boundary.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Cells", "C", "Closed packed program cells from the rectangular cartogram/treemap.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program IDs", "ID", "Stable program IDs matching Cells.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program Names", "N", "Program names matching Cells.", GH_ParamAccess.list);
        parameters.AddPointParameter("Main Entrance", "ME", "Optional exact main entrance point. If absent, the mainEntrancePlaza cell is used.", GH_ParamAccess.item);
        parameters.AddPointParameter("Secondary Entrance", "SE", "Optional secondary entrance point. If absent, the secondaryEntrances cell or farthest public cell is used.", GH_ParamAccess.item);
        parameters.AddPointParameter("Service Entrance", "SVE", "Optional service entrance point. If absent, the boundary point nearest Operations is used.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Primary Width", "PW", "Primary path width in document units (metres expected).", GH_ParamAccess.item, 3.0);
        parameters.AddNumberParameter("Secondary Width", "SW", "Secondary path width in document units (metres expected).", GH_ParamAccess.item, 2.0);
        parameters.AddNumberParameter("Service Width", "SVW", "Service path width in document units (metres expected).", GH_ParamAccess.item, 4.0);
        parameters.AddBooleanParameter("Run", "R", "Generate the path graph.", GH_ParamAccess.item, false);
        parameters[4].Optional = true;
        parameters[5].Optional = true;
        parameters[6].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Primary Path", "P", "Continuous entrance-to-hub-to-secondary spine.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Secondary Paths", "S", "Connected public branches; every curve terminates at an exact graph junction.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Service Path", "SV", "Independent service entrance-to-operations route.", GH_ParamAccess.item);
        parameters.AddPointParameter("Portals", "PT", "Selected access portals on shared program-cell edges.", GH_ParamAccess.list);
        parameters.AddTextParameter("Portal Data", "PD", "JSON records identifying the two programs served by each portal.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Corridor Edges", "CE", "Width-aware left/right planning edges for all generated paths.", GH_ParamAccess.list);
        parameters.AddTextParameter("Path Data", "D", "Lands Design-ready JSON metadata matching Primary, Secondary, then Service paths.", GH_ParamAccess.list);
        parameters.AddTextParameter("Warnings", "W", "Topology, adjacency, and input warnings.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Connectivity and hierarchy summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null;
        var curves = new List<Curve>();
        var ids = new List<string>();
        var names = new List<string>();
        Point3d mainEntrance = Point3d.Unset;
        Point3d secondaryEntrance = Point3d.Unset;
        Point3d serviceEntrance = Point3d.Unset;
        var primaryWidth = 3d;
        var secondaryWidth = 2d;
        var serviceWidth = 4d;
        var run = false;
        if (!data.GetData(0, ref boundary)) return;
        data.GetDataList(1, curves);
        data.GetDataList(2, ids);
        data.GetDataList(3, names);
        data.GetData(4, ref mainEntrance);
        data.GetData(5, ref secondaryEntrance);
        data.GetData(6, ref serviceEntrance);
        data.GetData(7, ref primaryWidth);
        data.GetData(8, ref secondaryWidth);
        data.GetData(9, ref serviceWidth);
        data.GetData(10, ref run);
        if (!run) return;

        var warnings = new List<string>();
        var tolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? 0.01;
        if (boundary is null || !boundary.IsClosed)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be closed.");
            return;
        }
        if (curves.Count < 2)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "At least two closed treemap cells are required.");
            return;
        }
        if (ids.Count != curves.Count || names.Count != curves.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Cells, Program IDs, and Program Names must have matching list lengths.");
            return;
        }
        if (primaryWidth <= 0 || secondaryWidth <= 0 || serviceWidth <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "All path widths must be positive.");
            return;
        }

        var cells = new List<Cell>();
        for (var index = 0; index < curves.Count; index++)
        {
            if (!curves[index].IsClosed)
            {
                warnings.Add($"Cell '{names[index]}' is open and was ignored.");
                continue;
            }
            using var mass = AreaMassProperties.Compute(curves[index]);
            var center = mass?.Centroid ?? curves[index].GetBoundingBox(true).Center;
            var searchable = $"{ids[index]} {names[index]}";
            var serviceOnly = ContainsAny(searchable, "operation", "maintenance", "service yard", "back of house");
            cells.Add(new(index, ids[index], names[index], curves[index].DuplicateCurve(), center, serviceOnly));
        }
        if (cells.Count < 2)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Fewer than two valid closed cells remain.");
            return;
        }

        var adjacency = BuildAdjacency(cells, tolerance);
        var publicCells = cells.Where(cell => !cell.ServiceOnly).Select(cell => cell.Index).ToHashSet();
        var publicAdjacency = adjacency.Where(edge => publicCells.Contains(edge.A) && publicCells.Contains(edge.B)).ToList();
        if (publicAdjacency.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "No shared boundaries were detected between public cells. Confirm the treemap cells touch and use the same plane/tolerance.");
            return;
        }

        var byIndex = cells.ToDictionary(cell => cell.Index);
        var start = ResolveCell(cells, mainEntrance, "mainentrance", "gateway")
            ?? publicCells.OrderBy(index => byIndex[index].Center.DistanceTo(boundary.PointAtStart)).First();
        var hub = cells.Where(cell => !cell.ServiceOnly && ContainsAny($"{cell.Id} {cell.Name}", "communityplaza", "community plaza", "baraha", "event lawn"))
            .OrderBy(cell => cell.Center.DistanceTo(AreaMassProperties.Compute(boundary)?.Centroid ?? boundary.GetBoundingBox(true).Center))
            .Select(cell => (int?)cell.Index).FirstOrDefault()
            ?? publicCells.OrderBy(index => byIndex[index].Center.DistanceTo(boundary.GetBoundingBox(true).Center)).First();
        var end = ResolveCell(cells, secondaryEntrance, "secondaryentrance", "secondary entrance")
            ?? publicCells.Where(index => index != start).OrderByDescending(index => byIndex[index].Center.DistanceTo(byIndex[start].Center)).First();

        var startToHub = ShortestPath(start, hub, publicCells, publicAdjacency);
        var hubToEnd = ShortestPath(hub, end, publicCells, publicAdjacency);
        if (startToHub.Count == 0 || hubToEnd.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "The public cell adjacency graph is disconnected; a primary entrance-hub-secondary path cannot be formed.");
            return;
        }
        var primaryCellPath = startToHub.Concat(hubToEnd.Skip(1)).ToList();
        var primaryPairs = PairSet(primaryCellPath);

        var tree = BuildRootedTree(start, publicCells, publicAdjacency);
        var unreachable = publicCells.Where(index => !tree.ContainsKey(index) && index != start).ToList();
        foreach (var index in unreachable) warnings.Add($"Public cell '{byIndex[index].Name}' is disconnected from the path graph.");

        var selectedEdges = new List<SelectedEdge>();
        for (var index = 0; index < primaryCellPath.Count - 1; index++)
        {
            var edge = FindEdge(primaryCellPath[index], primaryCellPath[index + 1], publicAdjacency);
            if (edge is not null) selectedEdges.Add(new(edge, "primary"));
        }
        foreach (var (child, parent) in tree.OrderBy(pair => pair.Key))
        {
            if (primaryPairs.Contains(PairKey(child, parent))) continue;
            var edge = FindEdge(child, parent, publicAdjacency);
            if (edge is not null) selectedEdges.Add(new(edge, "secondary"));
        }

        var primaryPoints = BuildContinuousPath(primaryCellPath, publicAdjacency, byIndex, mainEntrance, secondaryEntrance);
        var primaryCurve = new PolylineCurve(primaryPoints);
        var secondaryCurves = selectedEdges.Where(item => item.Hierarchy == "secondary")
            .Select(item => EdgeCurve(item.Edge, byIndex)).ToList();

        Curve? serviceCurve = null;
        var serviceCell = cells.FirstOrDefault(cell => cell.ServiceOnly);
        if (serviceCell is not null)
        {
            var serviceStart = serviceEntrance.IsValid ? serviceEntrance : ClosestPoint(boundary, serviceCell.Center);
            serviceCurve = new PolylineCurve(new[] { serviceStart, serviceCell.Center });
        }
        else warnings.Add("No Operations/Maintenance cell was identified; service path was not generated.");

        var pathCurves = new List<(Curve Curve, string Hierarchy, double Width, string From, string To)>
        {
            (primaryCurve, "primary", primaryWidth, byIndex[start].Id, byIndex[end].Id)
        };
        pathCurves.AddRange(selectedEdges.Where(item => item.Hierarchy == "secondary").Select((item, index) =>
            ((Curve)secondaryCurves[index], "secondary", secondaryWidth, byIndex[item.Edge.A].Id, byIndex[item.Edge.B].Id)));
        if (serviceCurve is not null && serviceCell is not null)
            pathCurves.Add((serviceCurve, "service", serviceWidth, "serviceBoundary", serviceCell.Id));

        var corridorEdges = new List<Curve>();
        foreach (var path in pathCurves)
        foreach (var sign in new[] { -1d, 1d })
        {
            var offsets = path.Curve.Offset(Plane.WorldXY, sign * path.Width / 2, tolerance, CurveOffsetCornerStyle.Round);
            if (offsets is not null) corridorEdges.AddRange(offsets);
        }

        var portalEdges = selectedEdges.Select(item => item.Edge).DistinctBy(edge => PairKey(edge.A, edge.B)).ToList();
        var portalData = portalEdges.Select(edge => JsonSerializer.Serialize(new
        {
            portal_id = $"portal-{PairKey(edge.A, edge.B)}",
            program_a = byIndex[edge.A].Id,
            program_b = byIndex[edge.B].Id,
            x = Math.Round(edge.Portal.X, 3),
            y = Math.Round(edge.Portal.Y, 3),
            authority = "treemap_shared_edge"
        })).ToList();
        var pathData = pathCurves.Select((path, index) => JsonSerializer.Serialize(new
        {
            path_id = $"treemap-{path.Hierarchy}-{index + 1}",
            hierarchy = path.Hierarchy,
            width_m = path.Width,
            from_program_id = path.From,
            to_program_id = path.To,
            lands_design_target_type = "path",
            surface_code = (string?)null,
            edge_detail_code = (string?)null,
            status = "designer_review_required"
        })).ToList();

        data.SetData(0, primaryCurve);
        data.SetDataList(1, secondaryCurves);
        if (serviceCurve is not null) data.SetData(2, serviceCurve);
        data.SetDataList(3, portalEdges.Select(edge => edge.Portal));
        data.SetDataList(4, portalData);
        data.SetDataList(5, corridorEdges);
        data.SetDataList(6, pathData);
        data.SetDataList(7, warnings);
        data.SetData(8, $"Connected {publicCells.Count - unreachable.Count}/{publicCells.Count} public cells: 1 primary spine, {secondaryCurves.Count} secondary links, {portalEdges.Count} controlled portals, {(serviceCurve is null ? 0 : 1)} service route. Paths follow treemap adjacency rather than centroid-to-centroid shortcuts.");
    }

    private static List<Adjacency> BuildAdjacency(IReadOnlyList<Cell> cells, double tolerance)
    {
        var result = new List<Adjacency>();
        for (var a = 0; a < cells.Count; a++)
        for (var b = a + 1; b < cells.Count; b++)
        {
            var intersections = Intersection.CurveCurve(cells[a].Boundary, cells[b].Boundary, tolerance, tolerance);
            if (intersections is null) continue;
            var portals = intersections.Where(item => item.IsOverlap)
                .Select(item => cells[a].Boundary.PointAt(item.OverlapA.Mid))
                .ToList();
            if (portals.Count == 0) continue;
            var portal = portals.OrderBy(point => point.DistanceTo(cells[a].Center) + point.DistanceTo(cells[b].Center)).First();
            var weight = cells[a].Center.DistanceTo(portal) + portal.DistanceTo(cells[b].Center);
            result.Add(new(cells[a].Index, cells[b].Index, portal, weight));
        }
        return result;
    }

    private static int? ResolveCell(IReadOnlyList<Cell> cells, Point3d point, params string[] nameTokens)
    {
        if (point.IsValid)
        {
            var containing = cells.FirstOrDefault(cell => cell.Boundary.Contains(point, Plane.WorldXY, 0.01) != PointContainment.Outside);
            if (containing is not null) return containing.Index;
            return cells.OrderBy(cell => cell.Center.DistanceTo(point)).First().Index;
        }
        return cells.Where(cell => !cell.ServiceOnly && nameTokens.Any(token => Normalize($"{cell.Id} {cell.Name}").Contains(Normalize(token))))
            .Select(cell => (int?)cell.Index).FirstOrDefault();
    }

    private static List<int> ShortestPath(int start, int end, IReadOnlySet<int> allowed, IReadOnlyList<Adjacency> edges)
    {
        if (start == end) return [start];
        var distance = allowed.ToDictionary(index => index, _ => double.PositiveInfinity);
        var previous = new Dictionary<int, int>();
        var unvisited = allowed.ToHashSet();
        distance[start] = 0;
        while (unvisited.Count > 0)
        {
            var current = unvisited.OrderBy(index => distance[index]).ThenBy(index => index).First();
            if (!double.IsFinite(distance[current])) break;
            unvisited.Remove(current);
            if (current == end) break;
            foreach (var edge in edges.Where(edge => edge.A == current || edge.B == current))
            {
                var next = edge.A == current ? edge.B : edge.A;
                if (!unvisited.Contains(next)) continue;
                var candidate = distance[current] + edge.Weight;
                if (candidate + 1e-9 >= distance[next]) continue;
                distance[next] = candidate;
                previous[next] = current;
            }
        }
        if (!previous.ContainsKey(end)) return [];
        var path = new List<int> { end };
        while (path[^1] != start) path.Add(previous[path[^1]]);
        path.Reverse();
        return path;
    }

    private static Dictionary<int, int> BuildRootedTree(int root, IReadOnlySet<int> allowed, IReadOnlyList<Adjacency> edges)
    {
        var distance = allowed.ToDictionary(index => index, _ => double.PositiveInfinity);
        var previous = new Dictionary<int, int>();
        var unvisited = allowed.ToHashSet();
        distance[root] = 0;
        while (unvisited.Count > 0)
        {
            var current = unvisited.OrderBy(index => distance[index]).ThenBy(index => index).First();
            if (!double.IsFinite(distance[current])) break;
            unvisited.Remove(current);
            foreach (var edge in edges.Where(edge => edge.A == current || edge.B == current))
            {
                var next = edge.A == current ? edge.B : edge.A;
                if (!unvisited.Contains(next)) continue;
                var candidate = distance[current] + edge.Weight;
                if (candidate + 1e-9 >= distance[next]) continue;
                distance[next] = candidate;
                previous[next] = current;
            }
        }
        return previous;
    }

    private static List<Point3d> BuildContinuousPath(IReadOnlyList<int> cellPath, IReadOnlyList<Adjacency> edges,
        IReadOnlyDictionary<int, Cell> cells, Point3d explicitStart, Point3d explicitEnd)
    {
        var points = new List<Point3d> { explicitStart.IsValid ? explicitStart : cells[cellPath[0]].Center };
        for (var index = 0; index < cellPath.Count - 1; index++)
        {
            var edge = FindEdge(cellPath[index], cellPath[index + 1], edges)!;
            if (points[^1].DistanceTo(cells[cellPath[index]].Center) > 0.01) points.Add(cells[cellPath[index]].Center);
            points.Add(edge.Portal);
            points.Add(cells[cellPath[index + 1]].Center);
        }
        if (explicitEnd.IsValid && points[^1].DistanceTo(explicitEnd) > 0.01) points.Add(explicitEnd);
        return RemoveConsecutiveDuplicates(points);
    }

    private static Curve EdgeCurve(Adjacency edge, IReadOnlyDictionary<int, Cell> cells) =>
        new PolylineCurve(RemoveConsecutiveDuplicates([cells[edge.A].Center, edge.Portal, cells[edge.B].Center]));

    private static Adjacency? FindEdge(int a, int b, IReadOnlyList<Adjacency> edges) =>
        edges.FirstOrDefault(edge => edge.A == a && edge.B == b || edge.A == b && edge.B == a);

    private static HashSet<string> PairSet(IReadOnlyList<int> path)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < path.Count - 1; index++) result.Add(PairKey(path[index], path[index + 1]));
        return result;
    }

    private static string PairKey(int a, int b) => a <= b ? $"{a}-{b}" : $"{b}-{a}";

    private static Point3d ClosestPoint(Curve curve, Point3d point) =>
        curve.ClosestPoint(point, out var parameter) ? curve.PointAt(parameter) : curve.PointAtStart;

    private static bool ContainsAny(string value, params string[] tokens)
    {
        var normalized = Normalize(value);
        return tokens.Any(token => normalized.Contains(Normalize(token)));
    }

    private static string Normalize(string value) => new(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

    private static List<Point3d> RemoveConsecutiveDuplicates(IEnumerable<Point3d> points)
    {
        var result = new List<Point3d>();
        foreach (var point in points)
            if (result.Count == 0 || result[^1].DistanceTo(point) > 0.001) result.Add(point);
        return result;
    }
}
