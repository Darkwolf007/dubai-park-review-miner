using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class RubberBandPathfinder
{
    public static RubberBandPathResult Find(Point2 start, Point2 end, IReadOnlyList<Point2> siteBoundary,
        IEnumerable<RubberBandObstacle> obstacles, double corridorWidthM)
    {
        if (corridorWidthM <= 0) throw new ArgumentOutOfRangeException(nameof(corridorWidthM));
        var obstacleList = obstacles.Select(obstacle => Inflate(obstacle, corridorWidthM / 2)).ToList();
        var nodes = new List<Point2> { start, end };
        nodes.AddRange(obstacleList.SelectMany(obstacle => obstacle.Ring));
        nodes = nodes.Where(point => PolygonMath.Contains(siteBoundary, point)
                || PolygonMath.DistanceToBoundary(siteBoundary, point) <= .01)
            .Distinct().ToList();
        var startIndex = nodes.IndexOf(start); var endIndex = nodes.IndexOf(end);
        var adjacency = Enumerable.Range(0, nodes.Count).Select(_ => new List<(int Index, double Cost)>()).ToList();
        for (var a = 0; a < nodes.Count; a++)
        for (var b = a + 1; b < nodes.Count; b++)
        {
            if (!SegmentInsideSite(nodes[a], nodes[b], siteBoundary)) continue;
            if (obstacleList.Any(obstacle => SegmentBlocked(nodes[a], nodes[b], obstacle.Ring))) continue;
            var distance = PolygonMath.Distance(nodes[a], nodes[b]);
            adjacency[a].Add((b, distance)); adjacency[b].Add((a, distance));
        }

        var distanceByNode = Enumerable.Repeat(double.PositiveInfinity, nodes.Count).ToArray();
        var previous = Enumerable.Repeat(-1, nodes.Count).ToArray();
        var queue = new PriorityQueue<int, double>();
        distanceByNode[startIndex] = 0; queue.Enqueue(startIndex, 0);
        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (current == endIndex) break;
            foreach (var edge in adjacency[current])
            {
                var candidate = distanceByNode[current] + edge.Cost;
                if (candidate + 1e-9 >= distanceByNode[edge.Index]) continue;
                distanceByNode[edge.Index] = candidate; previous[edge.Index] = current;
                queue.Enqueue(edge.Index, candidate);
            }
        }
        if (!double.IsFinite(distanceByNode[endIndex]))
            return new(false, [], 0, "no_clear_corridor", []);
        var indexes = new List<int>();
        for (var current = endIndex; current >= 0; current = previous[current])
        {
            indexes.Add(current); if (current == startIndex) break;
        }
        indexes.Reverse();
        var points = StringPull(indexes.Select(index => nodes[index]).ToList(), siteBoundary, obstacleList);
        var touched = obstacleList.Where(obstacle => points.Any(point => obstacle.Ring.Any(corner => PolygonMath.Distance(point, corner) < .01)))
            .Select(obstacle => obstacle.Id).Distinct(StringComparer.Ordinal).ToList();
        return new(true, points, points.Zip(points.Skip(1), PolygonMath.Distance).Sum(), "visibility_graph_string_pulled", touched);
    }

    private static RubberBandObstacle Inflate(RubberBandObstacle obstacle, double amount)
    {
        var centroid = PolygonMath.Centroid(obstacle.Ring);
        var inflated = obstacle.Ring.Select(point =>
        {
            var dx = point.X - centroid.X; var dy = point.Y - centroid.Y;
            var length = Math.Sqrt(dx * dx + dy * dy);
            return length <= 1e-9 ? point : new Point2(point.X + dx / length * amount, point.Y + dy / length * amount);
        }).ToList();
        return new(obstacle.Id, inflated);
    }

    private static List<Point2> StringPull(List<Point2> source, IReadOnlyList<Point2> site,
        IReadOnlyList<RubberBandObstacle> obstacles)
    {
        var result = new List<Point2>(); var index = 0;
        while (index < source.Count)
        {
            result.Add(source[index]);
            if (index == source.Count - 1) break;
            var next = source.Count - 1;
            while (next > index + 1 && (!SegmentInsideSite(source[index], source[next], site)
                || obstacles.Any(obstacle => SegmentBlocked(source[index], source[next], obstacle.Ring)))) next--;
            index = next;
        }
        return result;
    }

    private static bool SegmentInsideSite(Point2 a, Point2 b, IReadOnlyList<Point2> boundary)
    {
        for (var step = 0; step <= 20; step++)
        {
            var t = step / 20d; var point = new Point2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
            if (!PolygonMath.Contains(boundary, point) && PolygonMath.DistanceToBoundary(boundary, point) > .01) return false;
        }
        return true;
    }

    private static bool SegmentBlocked(Point2 a, Point2 b, IReadOnlyList<Point2> ring)
    {
        var midpoint = new Point2((a.X + b.X) / 2, (a.Y + b.Y) / 2);
        if (PolygonMath.Contains(ring, midpoint)) return true;
        for (var index = 0; index < ring.Count; index++)
        {
            var c = ring[index]; var d = ring[(index + 1) % ring.Count];
            if (SharesEndpoint(a, b, c, d)) continue;
            if (Intersects(a, b, c, d)) return true;
        }
        return false;
    }

    private static bool SharesEndpoint(Point2 a, Point2 b, Point2 c, Point2 d) =>
        PolygonMath.Distance(a, c) < 1e-7 || PolygonMath.Distance(a, d) < 1e-7
        || PolygonMath.Distance(b, c) < 1e-7 || PolygonMath.Distance(b, d) < 1e-7;

    private static bool Intersects(Point2 a, Point2 b, Point2 c, Point2 d)
    {
        static double Cross(Point2 p, Point2 q, Point2 r) => (q.X - p.X) * (r.Y - p.Y) - (q.Y - p.Y) * (r.X - p.X);
        var abC = Cross(a, b, c); var abD = Cross(a, b, d); var cdA = Cross(c, d, a); var cdB = Cross(c, d, b);
        return abC * abD < -1e-9 && cdA * cdB < -1e-9;
    }
}
