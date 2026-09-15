using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>
/// Connects access portals using polygon boundary segments, never cell centroids.
/// The union of shortest routes from the entrance is a rooted, loop-free edge tree.
/// </summary>
public static class CellEdgeTreeBuilder
{
    public sealed record Result(
        IReadOnlyList<IReadOnlyList<Point2>> Chains,
        IReadOnlyList<Point2> UnreachableTerminals,
        Point2 RootOnEdge,
        double EntranceConnectorLengthM);

    private sealed record Segment(Point2 A, Point2 B);

    public static Result Build(
        IReadOnlyList<IReadOnlyList<Point2>> cells,
        Point2 entrance,
        IReadOnlyList<Point2> terminals,
        double tolerance = 0.01)
    {
        if (cells.Count == 0) throw new ArgumentException("At least one cell is required.", nameof(cells));
        if (tolerance <= 0) throw new ArgumentOutOfRangeException(nameof(tolerance));

        var segments = new List<Segment>();
        foreach (var ring in cells)
        {
            if (ring.Count < 3) continue;
            for (var index = 0; index < ring.Count; index++)
            {
                var a = ring[index];
                var b = ring[(index + 1) % ring.Count];
                if (PolygonMath.Distance(a, b) > tolerance) segments.Add(new(a, b));
            }
        }
        if (segments.Count == 0) throw new ArgumentException("Cells have no usable boundary edges.", nameof(cells));

        var root = ProjectToClosestEdge(entrance, segments);
        var projectedTerminals = terminals.Select(point => ProjectToClosestEdge(point, segments)).ToList();
        // Split every cell edge at shared vertices and access projections. This also
        // joins adjoining cells whose boundary segments have different subdivisions.
        var splitCandidates = segments.SelectMany(segment => new[] { segment.A, segment.B })
            .Concat([root]).Concat(projectedTerminals).Distinct().ToList();
        var points = new List<Point2>();
        var byKey = new Dictionary<(long X, long Y), int>();
        int Node(Point2 point)
        {
            var key = ((long)Math.Round(point.X / tolerance), (long)Math.Round(point.Y / tolerance));
            if (byKey.TryGetValue(key, out var existing)) return existing;
            var id = points.Count;
            points.Add(point);
            byKey[key] = id;
            return id;
        }

        var adjacency = new Dictionary<int, List<(int Next, double Length)>>();
        var uniqueEdges = new HashSet<(int A, int B)>();
        foreach (var segment in segments)
        {
            var dx = segment.B.X - segment.A.X;
            var dy = segment.B.Y - segment.A.Y;
            var lengthSquared = dx * dx + dy * dy;
            var splits = new List<(double T, Point2 Point)> { (0, segment.A), (1, segment.B) };
            foreach (var candidate in splitCandidates)
            {
                var t = Math.Clamp(((candidate.X - segment.A.X) * dx + (candidate.Y - segment.A.Y) * dy) / lengthSquared, 0, 1);
                var projection = new Point2(segment.A.X + t * dx, segment.A.Y + t * dy);
                if (PolygonMath.Distance(projection, candidate) <= tolerance) splits.Add((t, candidate));
            }
            var ordered = splits.OrderBy(item => item.T).ToList();
            for (var index = 0; index < ordered.Count - 1; index++)
            {
                if (PolygonMath.Distance(ordered[index].Point, ordered[index + 1].Point) <= tolerance) continue;
                var a = Node(ordered[index].Point);
                var b = Node(ordered[index + 1].Point);
                if (a == b) continue;
                var key = a < b ? (a, b) : (b, a);
                if (!uniqueEdges.Add(key)) continue;
                var length = PolygonMath.Distance(points[a], points[b]);
                if (!adjacency.TryGetValue(a, out var first)) adjacency[a] = first = [];
                if (!adjacency.TryGetValue(b, out var second)) adjacency[b] = second = [];
                first.Add((b, length));
                second.Add((a, length));
            }
        }

        var rootId = Node(root);
        var distance = Enumerable.Repeat(double.PositiveInfinity, points.Count).ToArray();
        var parent = Enumerable.Repeat(-1, points.Count).ToArray();
        var queue = new PriorityQueue<int, (double Cost, int Id)>();
        distance[rootId] = 0;
        queue.Enqueue(rootId, (0, rootId));
        while (queue.TryDequeue(out var current, out var priority))
        {
            if (priority.Cost > distance[current] + 1e-9) continue;
            if (!adjacency.TryGetValue(current, out var neighbors)) continue;
            foreach (var (next, length) in neighbors.OrderBy(item => item.Next))
            {
                var candidate = distance[current] + length;
                if (candidate >= distance[next] - 1e-9) continue;
                distance[next] = candidate;
                parent[next] = current;
                queue.Enqueue(next, (candidate, next));
            }
        }

        var used = new HashSet<(int A, int B)>();
        var unreachable = new List<Point2>();
        foreach (var terminal in projectedTerminals)
        {
            var id = Node(terminal);
            if (!double.IsFinite(distance[id]))
            {
                unreachable.Add(terminal);
                continue;
            }
            for (var current = id; parent[current] >= 0; current = parent[current])
            {
                var previous = parent[current];
                used.Add(current < previous ? (current, previous) : (previous, current));
            }
        }

        var tree = new Dictionary<int, List<int>>();
        foreach (var (a, b) in used)
        {
            if (!tree.TryGetValue(a, out var first)) tree[a] = first = [];
            if (!tree.TryGetValue(b, out var second)) tree[b] = second = [];
            first.Add(b);
            second.Add(a);
        }
        var chains = new List<IReadOnlyList<Point2>>();
        var consumed = new HashSet<(int A, int B)>();
        foreach (var start in tree.Keys.OrderBy(id => id).Where(id => tree[id].Count != 2))
        foreach (var next in tree[start].OrderBy(id => id))
        {
            var firstEdge = start < next ? (start, next) : (next, start);
            if (!consumed.Add(firstEdge)) continue;
            var chain = new List<Point2> { points[start], points[next] };
            var previous = start;
            var current = next;
            while (tree[current].Count == 2)
            {
                var following = tree[current][0] == previous ? tree[current][1] : tree[current][0];
                var edge = current < following ? (current, following) : (following, current);
                if (!consumed.Add(edge)) break;
                chain.Add(points[following]);
                previous = current;
                current = following;
            }
            chains.Add(chain);
        }
        return new(chains, unreachable, root, PolygonMath.Distance(entrance, root));
    }

    private static Point2 ProjectToClosestEdge(Point2 point, IReadOnlyList<Segment> segments)
    {
        var bestDistance = double.PositiveInfinity;
        var best = segments[0].A;
        foreach (var segment in segments)
        {
            var dx = segment.B.X - segment.A.X;
            var dy = segment.B.Y - segment.A.Y;
            var t = Math.Clamp(((point.X - segment.A.X) * dx + (point.Y - segment.A.Y) * dy) / (dx * dx + dy * dy), 0, 1);
            var projection = new Point2(segment.A.X + t * dx, segment.A.Y + t * dy);
            var distance = PolygonMath.Distance(point, projection);
            if (distance >= bestDistance - 1e-9) continue;
            bestDistance = distance;
            best = projection;
        }
        return best;
    }
}
