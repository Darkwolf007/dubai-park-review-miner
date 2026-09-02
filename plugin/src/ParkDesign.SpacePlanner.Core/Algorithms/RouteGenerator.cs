using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class RouteGenerator
{
    public static (List<RoutePlacement> Routes, List<RelationshipLine> Relationships) Generate(
        IReadOnlyList<Point2> boundary, IEnumerable<ProgramDefinition> programs, IEnumerable<BubblePlacement> areas,
        IEnumerable<NodePlacement> areaAnchors, IEnumerable<NodePlacement> nodes,
        IEnumerable<RelationshipDefinition> relationships, bool includeOptional, List<string> warnings,
        IEnumerable<MovementDemandDefinition>? movementDemands = null)
    {
        var programList = programs.Where(item => item.Selected || includeOptional).OrderBy(item => item.Id, StringComparer.Ordinal).ToList();
        var areaList = areas.ToList();
        var anchors = areaList.ToDictionary(item => item.ProgramId, item => item.Center, StringComparer.Ordinal);
        foreach (var areaAnchor in areaAnchors) anchors[areaAnchor.ProgramId] = areaAnchor.Point;
        foreach (var node in nodes) anchors[node.ProgramId] = node.Point;
        var relationshipList = relationships.ToList();
        var relationshipLines = relationshipList.Where(item => item.Accepted)
            .Where(item => anchors.ContainsKey(item.Source) && anchors.ContainsKey(item.Target))
            .Select(item => new RelationshipLine(item.Id, item.Source, item.Target, anchors[item.Source], anchors[item.Target], item.Type, item.Mandatory,
                item.Authority.Contains("designer_approved", StringComparison.OrdinalIgnoreCase) ? "designer_approved" : "accepted_rule"))
            .ToList();

        var routes = new List<RoutePlacement>();
        var walkingProgram = programList.FirstOrDefault(program => program.Id == "walkingPromenade");
        var walkingRoutes = walkingProgram is null ? []
            : GenerateWalkingNetwork(boundary, walkingProgram, anchors, areaList, movementDemands ?? [], warnings);
        var loopIndex = 0;
        foreach (var program in programList)
        {
            if (program.Id == "walkingPromenade") { routes.AddRange(walkingRoutes); continue; }
            if (program.Id is "accessibleRoutes" or "shadedCirculation")
                continue;
            if (program.RouteTopology == "closed_loop" || program.Id.Contains("loop", StringComparison.OrdinalIgnoreCase))
            {
                routes.Add(new(program.Id, program.Name, CreateConceptualInsetLoop(boundary, loopIndex++), true, "distinct_centroid_inset_loop"));
                continue;
            }
            if (program.Id == "serviceAccess") { AddServiceSpur(routes, warnings, boundary, program, areaList); continue; }
            AddSystemNetwork(routes, warnings, boundary, program, anchors, areaList, relationshipList);
        }
        return (routes, relationshipLines);
    }

    private static List<RoutePlacement> GenerateWalkingNetwork(IReadOnlyList<Point2> boundary, ProgramDefinition program,
        IReadOnlyDictionary<string, Point2> anchors, IReadOnlyList<BubblePlacement> areas,
        IEnumerable<MovementDemandDefinition> movementDemands, List<string> warnings)
    {
        var demandList = movementDemands.ToList();
        var demandedIds = demandList.SelectMany(demand => new[] { demand.Origin, demand.Destination }).ToHashSet(StringComparer.Ordinal);
        var requiredIds = areas.Select(area => area.ProgramId).Concat(anchors.Keys.Where(demandedIds.Contains))
            .Distinct(StringComparer.Ordinal).Where(anchors.ContainsKey).ToList();
        if (requiredIds.Count < 2)
        {
            warnings.Add("Walking Promenade needs at least two placed program or amenity anchors and was not generated.");
            return [];
        }
        var demandWeights = demandList.Where(demand => anchors.ContainsKey(demand.Origin) && anchors.ContainsKey(demand.Destination))
            .GroupBy(demand => PairKey(demand.Origin, demand.Destination), StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Sum(item => Math.Max(0, item.Weight)), StringComparer.Ordinal);
        var maximumDemand = demandWeights.Values.DefaultIfEmpty(0).Max();
        return WeightedMinimumSpanningTree(requiredIds, anchors, demandWeights, maximumDemand)
            .Select(edge => new RoutePlacement(program.Id, program.Name,
                BuildSpaceEdgeRoute(boundary, edge.A, edge.B, anchors, areas), false,
                $"persona_od_weighted_program_connector:{edge.DemandWeight:0.##}", ["accessible", "shade_priority"], edge.A, edge.B))
            .ToList();
    }

    private static List<(string A, string B, double DemandWeight)> WeightedMinimumSpanningTree(IReadOnlyList<string> ids,
        IReadOnlyDictionary<string, Point2> anchors, IReadOnlyDictionary<string, double> demandWeights, double maximumDemand)
    {
        var connected = new HashSet<string>(StringComparer.Ordinal) { ids.OrderBy(id => id, StringComparer.Ordinal).First() };
        var edges = new List<(string A, string B, double DemandWeight)>();
        while (connected.Count < ids.Count)
        {
            var candidates = connected.SelectMany(a => ids.Where(b => !connected.Contains(b)).Select(b =>
            {
                var demand = demandWeights.GetValueOrDefault(PairKey(a, b));
                var normalizedDemand = maximumDemand <= 0 ? 0 : demand / maximumDemand;
                return (A: a, B: b, Demand: demand,
                    Cost: PolygonMath.Distance(anchors[a], anchors[b]) / (1 + 3 * normalizedDemand));
            })).OrderBy(item => item.Cost).ThenByDescending(item => item.Demand)
                .ThenBy(item => item.A, StringComparer.Ordinal).ThenBy(item => item.B, StringComparer.Ordinal).ToList();
            if (candidates.Count == 0) break;
            var best = candidates[0]; connected.Add(best.B); edges.Add((best.A, best.B, best.Demand));
        }
        return edges;
    }

    private static IReadOnlyList<Point2> BuildSpaceEdgeRoute(IReadOnlyList<Point2> boundary, string sourceId, string targetId,
        IReadOnlyDictionary<string, Point2> anchors, IReadOnlyList<BubblePlacement> areas)
    {
        var source = anchors[sourceId]; var target = anchors[targetId];
        var obstacles = areas.Where(area => area.SpatialMode == "exclusive"
            && area.ProgramId != sourceId && area.ProgramId != targetId).ToList();
        var start = AccessibleBubbleEdge(sourceId, source, target, areas, obstacles, boundary);
        var end = AccessibleBubbleEdge(targetId, target, source, areas, obstacles, boundary);
        return ShortestVisibilityPath(boundary, start, end, obstacles);
    }

    private static Point2 AccessibleBubbleEdge(string id, Point2 center, Point2 toward,
        IReadOnlyList<BubblePlacement> areas, IReadOnlyList<BubblePlacement> obstacles, IReadOnlyList<Point2> boundary)
    {
        var bubble = areas.FirstOrDefault(area => area.ProgramId == id);
        if (bubble is null) return center;
        var candidates = Enumerable.Range(0, 48).Select(index =>
        {
            var angle = 2 * Math.PI * index / 48;
            return new Point2(center.X + Math.Cos(angle) * bubble.Radius, center.Y + Math.Sin(angle) * bubble.Radius);
        }).Where(point => (PolygonMath.Contains(boundary, point) || PolygonMath.DistanceToBoundary(boundary, point) <= .01)
            && obstacles.All(obstacle => PolygonMath.Distance(point, obstacle.Center) >= obstacle.Radius + .25)).ToList();
        return candidates.Count == 0 ? MoveToBubbleEdge(id, center, toward, areas)
            : candidates.OrderBy(point => PolygonMath.Distance(point, toward)).First();
    }

    private static IReadOnlyList<Point2> ShortestVisibilityPath(IReadOnlyList<Point2> boundary, Point2 start, Point2 end,
        IReadOnlyList<BubblePlacement> obstacles)
    {
        if (SegmentClear(boundary, start, end, obstacles)) return [start, end];
        var points = new List<Point2> { start, end };
        foreach (var obstacle in obstacles)
        for (var index = 0; index < 16; index++)
        {
            var angle = 2 * Math.PI * index / 16;
            var radius = obstacle.Radius + 1;
            var point = new Point2(obstacle.Center.X + Math.Cos(angle) * radius, obstacle.Center.Y + Math.Sin(angle) * radius);
            if (PolygonMath.Contains(boundary, point)
                && obstacles.All(other => other.ProgramId == obstacle.ProgramId || PolygonMath.Distance(point, other.Center) >= other.Radius + .5))
                points.Add(point);
        }

        var distance = Enumerable.Repeat(double.PositiveInfinity, points.Count).ToArray();
        var previous = Enumerable.Repeat(-1, points.Count).ToArray();
        var visited = new bool[points.Count]; distance[0] = 0;
        for (var iteration = 0; iteration < points.Count; iteration++)
        {
            var current = -1; var best = double.PositiveInfinity;
            for (var index = 0; index < points.Count; index++)
                if (!visited[index] && distance[index] < best) { current = index; best = distance[index]; }
            if (current < 0 || current == 1) break;
            visited[current] = true;
            for (var next = 0; next < points.Count; next++)
            {
                if (visited[next] || next == current || !SegmentClear(boundary, points[current], points[next], obstacles)) continue;
                var candidate = distance[current] + PolygonMath.Distance(points[current], points[next]);
                if (candidate + 1e-9 >= distance[next]) continue;
                distance[next] = candidate; previous[next] = current;
            }
        }
        if (!double.IsFinite(distance[1])) return [start, end];
        var path = new List<Point2>();
        for (var current = 1; current >= 0; current = previous[current])
        {
            path.Add(points[current]);
            if (current == 0) break;
        }
        path.Reverse(); return path;
    }

    private static bool SegmentClear(IReadOnlyList<Point2> boundary, Point2 a, Point2 b,
        IReadOnlyList<BubblePlacement> obstacles)
    {
        if (obstacles.Any(obstacle => DistanceToSegment(obstacle.Center, a, b) < obstacle.Radius + .25)) return false;
        for (var step = 0; step <= 20; step++)
        {
            var t = step / 20d;
            var point = new Point2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
            if (!PolygonMath.Contains(boundary, point) && PolygonMath.DistanceToBoundary(boundary, point) > .01) return false;
        }
        return true;
    }

    private static Point2 MoveToBubbleEdge(string id, Point2 center, Point2 toward, IReadOnlyList<BubblePlacement> areas)
    {
        var bubble = areas.FirstOrDefault(area => area.ProgramId == id);
        if (bubble is null) return center;
        var dx = toward.X - center.X; var dy = toward.Y - center.Y; var length = Math.Sqrt(dx * dx + dy * dy);
        return length <= 1e-9 ? center : new(center.X + dx / length * bubble.Radius, center.Y + dy / length * bubble.Radius);
    }

    private static void AddServiceSpur(List<RoutePlacement> routes, List<string> warnings, IReadOnlyList<Point2> boundary,
        ProgramDefinition program, IReadOnlyList<BubblePlacement> areas)
    {
        var operations = areas.FirstOrDefault(area => area.ProgramId == "operationsArea");
        if (operations is null) { warnings.Add("Service access requires the placed Operations / Maintenance Area and was not generated."); return; }
        var gate = ClosestBoundaryPoint(boundary, operations.Center);
        routes.Add(new(program.Id, program.Name, [gate, MoveToBubbleEdge(operations.ProgramId, operations.Center, gate, areas)],
            false, "single_boundary_to_operations_spur", [], "serviceBoundary", operations.ProgramId));
    }

    private static void AddSystemNetwork(List<RoutePlacement> routes, List<string> warnings, IReadOnlyList<Point2> boundary,
        ProgramDefinition program, IReadOnlyDictionary<string, Point2> anchors, IReadOnlyList<BubblePlacement> areas,
        IReadOnlyList<RelationshipDefinition> relationships)
    {
        var ids = relationships.Where(item => item.Accepted || IsRouteGuidance(item))
            .Where(item => item.Source == program.Id || item.Target == program.Id)
            .Where(item => !item.Type.Contains("avoid", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Source == program.Id ? item.Target : item.Source).Where(anchors.ContainsKey)
            .Concat(FallbackAnchorIds(program.Id).Where(anchors.ContainsKey)).Distinct(StringComparer.Ordinal).ToList();
        if (ids.Count < 2) ids = anchors.Keys.OrderBy(id => id, StringComparer.Ordinal).Take(4).ToList();
        if (ids.Count < 2) { warnings.Add($"Route {program.Name} needs at least two placed anchors and was not generated."); return; }
        foreach (var edge in MinimumSpanningTree(ids, anchors))
        {
            var points = BuildSpaceEdgeRoute(boundary, edge.A, edge.B, anchors, areas);
            if (PolylineInside(boundary, points)) routes.Add(new(program.Id, program.Name, points, false,
                "program_specific_system_network", [], edge.A, edge.B));
        }
    }

    private static bool IsRouteGuidance(RelationshipDefinition relationship) =>
        relationship.Authority.Equals("advisory", StringComparison.OrdinalIgnoreCase)
        && (relationship.Type.Contains("preferred", StringComparison.OrdinalIgnoreCase)
            || relationship.Type.Contains("movement", StringComparison.OrdinalIgnoreCase)
            || relationship.Type.Contains("service", StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<string> FallbackAnchorIds(string programId) => programId switch
    {
        "irrigationEfficiency" => ["operationsArea", "treePlanting", "nativePlanting", "bioswale"],
        "efficientLighting" => ["mainEntrancePlaza", "communityPlaza", "safetyPoint", "wayfindingNodes", "inclusivePlayground"],
        _ => []
    };

    private static List<Point2> CreateConceptualInsetLoop(IReadOnlyList<Point2> boundary, int loopIndex)
    {
        var centroid = PolygonMath.Centroid(boundary);
        var minimumRadius = boundary.Min(point => PolygonMath.Distance(point, centroid));
        if (minimumRadius <= 1e-6) return boundary.Concat([boundary[0]]).ToList();
        var insetM = Math.Min(5d + loopIndex * 6d, minimumRadius * .45);
        var factor = Math.Max(.55, 1 - insetM / minimumRadius);
        var inset = boundary.Select(point => new Point2(centroid.X + (point.X - centroid.X) * factor,
            centroid.Y + (point.Y - centroid.Y) * factor)).ToList();
        inset.Add(inset[0]); return inset;
    }

    private static List<(string A, string B)> MinimumSpanningTree(IReadOnlyList<string> ids, IReadOnlyDictionary<string, Point2> anchors)
    {
        var connected = new HashSet<string>(StringComparer.Ordinal) { ids[0] }; var edges = new List<(string A, string B)>();
        while (connected.Count < ids.Count)
        {
            var best = connected.SelectMany(a => ids.Where(b => !connected.Contains(b)).Select(b =>
                (A: a, B: b, Distance: PolygonMath.Distance(anchors[a], anchors[b]))))
                .OrderBy(item => item.Distance).ThenBy(item => item.A, StringComparer.Ordinal).ThenBy(item => item.B, StringComparer.Ordinal).First();
            connected.Add(best.B); edges.Add((best.A, best.B));
        }
        return edges;
    }

    private static bool PolylineInside(IReadOnlyList<Point2> boundary, IReadOnlyList<Point2> points)
    {
        for (var i = 0; i < points.Count - 1; i++) for (var step = 0; step <= 20; step++)
        {
            var t = step / 20d;
            var sample = new Point2(points[i].X + (points[i + 1].X - points[i].X) * t, points[i].Y + (points[i + 1].Y - points[i].Y) * t);
            if (!PolygonMath.Contains(boundary, sample) && PolygonMath.DistanceToBoundary(boundary, sample) > 1e-6) return false;
        }
        return true;
    }

    private static string PairKey(string a, string b) => StringComparer.Ordinal.Compare(a, b) <= 0 ? $"{a}|{b}" : $"{b}|{a}";
    private static double ProjectionParameter(Point2 point, Point2 a, Point2 b)
    {
        var dx = b.X - a.X; var dy = b.Y - a.Y; var lengthSquared = dx * dx + dy * dy;
        return lengthSquared <= 1e-12 ? 0 : ((point.X - a.X) * dx + (point.Y - a.Y) * dy) / lengthSquared;
    }
    private static double DistanceToSegment(Point2 point, Point2 a, Point2 b)
    {
        var t = Math.Clamp(ProjectionParameter(point, a, b), 0, 1);
        return PolygonMath.Distance(point, new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t));
    }
    private static Point2 ClosestBoundaryPoint(IReadOnlyList<Point2> boundary, Point2 point)
    {
        var best = boundary[0]; var bestDistance = double.PositiveInfinity;
        for (var i = 0; i < boundary.Count; i++)
        {
            var a = boundary[i]; var b = boundary[(i + 1) % boundary.Count]; var t = Math.Clamp(ProjectionParameter(point, a, b), 0, 1);
            var candidate = new Point2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
            var distance = PolygonMath.Distance(point, candidate);
            if (distance < bestDistance) { best = candidate; bestDistance = distance; }
        }
        return best;
    }
}
