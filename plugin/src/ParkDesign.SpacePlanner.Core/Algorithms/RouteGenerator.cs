using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class RouteGenerator
{
    public static (List<RoutePlacement> Routes, List<RelationshipLine> Relationships) Generate(
        IReadOnlyList<Point2> boundary,
        IEnumerable<ProgramDefinition> programs,
        IEnumerable<BubblePlacement> areas,
        IEnumerable<NodePlacement> areaAnchors,
        IEnumerable<NodePlacement> nodes,
        IEnumerable<RelationshipDefinition> relationships,
        bool includeOptional,
        List<string> warnings)
    {
        var anchors = areas.ToDictionary(item => item.ProgramId, item => item.Center);
        foreach (var areaAnchor in areaAnchors) anchors[areaAnchor.ProgramId] = areaAnchor.Point;
        foreach (var node in nodes) anchors[node.ProgramId] = node.Point;
        var accepted = relationships.Where(item => item.Accepted).ToList();
        var relationshipLines = accepted
            .Where(item => anchors.ContainsKey(item.Source) && anchors.ContainsKey(item.Target))
            .Select(item => new RelationshipLine(item.Id, item.Source, item.Target, anchors[item.Source], anchors[item.Target], item.Type, item.Mandatory))
            .ToList();

        var routes = new List<RoutePlacement>();
        var loopIndex = 0;
        foreach (var program in programs.Where(item => item.Selected || includeOptional).OrderBy(item => item.Id, StringComparer.Ordinal))
        {
            if (program.Id.Contains("loop", StringComparison.OrdinalIgnoreCase))
            {
                var loop = CreateConceptualInsetLoop(boundary, loopIndex++);
                routes.Add(new RoutePlacement(program.Id, program.Name, loop, true, "centroid_inset_concept_loop"));
                continue;
            }

            var relatedIds = accepted
                .Where(item => item.Source == program.Id || item.Target == program.Id)
                .Select(item => item.Source == program.Id ? item.Target : item.Source)
                .Where(anchors.ContainsKey)
                .Distinct(StringComparer.Ordinal)
                .ToList();
            var routeAnchors = (relatedIds.Count >= 2 ? relatedIds.Select(id => anchors[id]) : anchors.Values).Distinct().ToList();
            if (routeAnchors.Count < 2)
            {
                warnings.Add($"Route {program.Name} needs at least two placed anchors and was not generated.");
                continue;
            }

            if (string.Equals(program.GeometryType, "network", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var (a, b) in MinimumSpanningTree(routeAnchors))
                    AddBoundarySafeRoute(routes, warnings, boundary, program, [a, b], "minimum_spanning_network");
            }
            else
            {
                AddBoundarySafeRoute(routes, warnings, boundary, program, NearestNeighbourPath(routeAnchors), "anchor_desire_line");
            }
        }
        return (routes, relationshipLines);
    }

    private static List<Point2> CreateConceptualInsetLoop(IReadOnlyList<Point2> boundary, int loopIndex)
    {
        var centroid = PolygonMath.Centroid(boundary);
        var minimumRadius = boundary.Min(point => PolygonMath.Distance(point, centroid));
        if (minimumRadius <= 1e-6) return boundary.Concat([boundary[0]]).ToList();

        // This is intentionally a conceptual radial inset, not a claimed construction offset.
        // Separate inset bands keep jogging and exercise-cycling visible until terrain/access
        // optimization replaces them with resolved centerlines.
        var requestedInsetM = 5d + loopIndex * 5d;
        var insetM = Math.Min(requestedInsetM, minimumRadius * 0.45);
        var factor = Math.Max(0.55, 1 - insetM / minimumRadius);
        var inset = boundary.Select(point => new Point2(
            centroid.X + (point.X - centroid.X) * factor,
            centroid.Y + (point.Y - centroid.Y) * factor)).ToList();
        inset.Add(inset[0]);
        return inset;
    }

    private static void AddBoundarySafeRoute(
        List<RoutePlacement> routes,
        List<string> warnings,
        IReadOnlyList<Point2> boundary,
        ProgramDefinition program,
        IReadOnlyList<Point2> points,
        string basis)
    {
        if (PolylineInside(boundary, points))
        {
            routes.Add(new RoutePlacement(program.Id, program.Name, points, false, basis));
            return;
        }
        var centroid = PolygonMath.Centroid(boundary);
        var diverted = new List<Point2> { points[0], centroid, points[^1] };
        if (PolylineInside(boundary, diverted))
            routes.Add(new RoutePlacement(program.Id, program.Name, diverted, false, basis + "_via_centroid"));
        else
            warnings.Add($"A {program.Name} desire-line left the boundary and was omitted; boundary-aware routing needs designer-defined gates or obstacles.");
    }

    private static bool PolylineInside(IReadOnlyList<Point2> boundary, IReadOnlyList<Point2> points)
    {
        for (var i = 0; i < points.Count - 1; i++)
        {
            for (var step = 0; step <= 20; step++)
            {
                var t = step / 20d;
                var sample = new Point2(points[i].X + (points[i + 1].X - points[i].X) * t, points[i].Y + (points[i + 1].Y - points[i].Y) * t);
                if (!PolygonMath.Contains(boundary, sample) && PolygonMath.DistanceToBoundary(boundary, sample) > 1e-6) return false;
            }
        }
        return true;
    }

    private static List<Point2> NearestNeighbourPath(IReadOnlyList<Point2> points)
    {
        var remaining = points.Skip(1).ToList();
        var path = new List<Point2> { points[0] };
        while (remaining.Count > 0)
        {
            var next = remaining.OrderBy(point => PolygonMath.Distance(path[^1], point)).First();
            path.Add(next);
            remaining.Remove(next);
        }
        return path;
    }

    private static List<(Point2 A, Point2 B)> MinimumSpanningTree(IReadOnlyList<Point2> points)
    {
        var connected = new HashSet<int> { 0 };
        var edges = new List<(Point2 A, Point2 B)>();
        while (connected.Count < points.Count)
        {
            var best = (From: -1, To: -1, Distance: double.PositiveInfinity);
            foreach (var from in connected)
            for (var to = 0; to < points.Count; to++)
            {
                if (connected.Contains(to)) continue;
                var distance = PolygonMath.Distance(points[from], points[to]);
                if (distance < best.Distance) best = (from, to, distance);
            }
            if (best.To < 0) break;
            connected.Add(best.To);
            edges.Add((points[best.From], points[best.To]));
        }
        return edges;
    }
}
