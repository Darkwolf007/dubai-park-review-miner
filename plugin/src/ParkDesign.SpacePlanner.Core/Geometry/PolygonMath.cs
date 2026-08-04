using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Geometry;

public static class PolygonMath
{
    public static double SignedArea(IReadOnlyList<Point2> polygon)
    {
        if (polygon.Count < 3) return 0;
        var sum = 0d;
        for (var i = 0; i < polygon.Count; i++)
        {
            var a = polygon[i];
            var b = polygon[(i + 1) % polygon.Count];
            sum += a.X * b.Y - b.X * a.Y;
        }
        return sum / 2d;
    }

    public static Point2 Centroid(IReadOnlyList<Point2> polygon)
    {
        var area = SignedArea(polygon);
        if (Math.Abs(area) < 1e-9)
            return new(polygon.Average(point => point.X), polygon.Average(point => point.Y));

        var x = 0d;
        var y = 0d;
        for (var i = 0; i < polygon.Count; i++)
        {
            var a = polygon[i];
            var b = polygon[(i + 1) % polygon.Count];
            var cross = a.X * b.Y - b.X * a.Y;
            x += (a.X + b.X) * cross;
            y += (a.Y + b.Y) * cross;
        }
        var factor = 1d / (6d * area);
        return new(x * factor, y * factor);
    }

    public static bool Contains(IReadOnlyList<Point2> polygon, Point2 point)
    {
        var inside = false;
        for (var i = 0; i < polygon.Count; i++)
        {
            var a = polygon[i];
            var b = polygon[(i + 1) % polygon.Count];
            if ((a.Y > point.Y) == (b.Y > point.Y)) continue;
            var intersectionX = (b.X - a.X) * (point.Y - a.Y) / (b.Y - a.Y) + a.X;
            if (point.X < intersectionX) inside = !inside;
        }
        return inside;
    }

    public static double DistanceToBoundary(IReadOnlyList<Point2> polygon, Point2 point)
    {
        var minimum = double.PositiveInfinity;
        for (var i = 0; i < polygon.Count; i++)
            minimum = Math.Min(minimum, DistanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.Count]));
        return minimum;
    }

    private static double DistanceToSegment(Point2 point, Point2 a, Point2 b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        var lengthSquared = dx * dx + dy * dy;
        if (lengthSquared <= 1e-12) return Distance(point, a);
        var t = Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / lengthSquared, 0, 1);
        return Distance(point, new Point2(a.X + t * dx, a.Y + t * dy));
    }

    public static double Distance(Point2 a, Point2 b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }
}
