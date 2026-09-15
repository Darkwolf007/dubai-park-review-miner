using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class PathGeometryRefiner
{
    public static PathRefinementResult Refine(
        CirculationPathChain chain,
        MovementCostField field,
        PathRefinementSettings? settings = null)
    {
        settings ??= new();
        if (chain.Points.Count < 3)
            return new(chain, chain.Points, "raw_too_short", chain.Points.Count, chain.Points.Count);

        var validationStep = Math.Max(0.05, Math.Min(settings.ValidationStepM, field.CellSizeM / 3));
        var simplified = Shortcut(chain.Points, field, validationStep);
        if (!Valid(simplified, field, validationStep))
            simplified = chain.Points.ToList();

        var current = simplified;
        var appliedPasses = 0;
        var ratio = Math.Clamp(settings.CornerCutRatio, 0.01, 0.45);
        for (var pass = 0; pass < Math.Clamp(settings.SmoothingPasses, 0, 4); pass++)
        {
            var accepted = false;
            for (var attempt = 0; attempt < 4; attempt++)
            {
                var candidate = Chaikin(current, ratio / Math.Pow(2, attempt));
                if (!Valid(candidate, field, validationStep)) continue;
                current = candidate;
                appliedPasses++;
                accepted = true;
                break;
            }
            if (!accepted) break;
        }

        var status = appliedPasses > 0 ? $"smoothed_{appliedPasses}_passes"
            : simplified.Count < chain.Points.Count ? "simplified_only"
            : "raw_fallback";
        return new(chain, current, status, chain.Points.Count, current.Count);
    }

    public static bool Valid(
        IReadOnlyList<Point2> points,
        MovementCostField field,
        double validationStepM)
    {
        if (points.Count < 2) return false;
        var endpointAllowance = field.CellSizeM * 1.5;
        for (var index = 0; index < points.Count - 1; index++)
        {
            var a = points[index];
            var b = points[index + 1];
            var length = PolygonMath.Distance(a, b);
            var divisions = Math.Max(1, (int)Math.Ceiling(length / Math.Max(0.05, validationStepM)));
            for (var sampleIndex = 0; sampleIndex <= divisions; sampleIndex++)
            {
                var t = (double)sampleIndex / divisions;
                var point = new Point2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
                if (Traversable(field, point)) continue;
                if (PolygonMath.Distance(point, points[0]) <= endpointAllowance
                    || PolygonMath.Distance(point, points[^1]) <= endpointAllowance)
                    continue;
                return false;
            }
        }
        return true;
    }

    private static List<Point2> Shortcut(
        IReadOnlyList<Point2> points,
        MovementCostField field,
        double validationStep)
    {
        var result = new List<Point2> { points[0] };
        var current = 0;
        while (current < points.Count - 1)
        {
            var next = current + 1;
            for (var candidate = points.Count - 1; candidate > current + 1; candidate--)
            {
                if (!ValidSegment(points[current], points[candidate], points[0], points[^1], field, validationStep))
                    continue;
                next = candidate;
                break;
            }
            result.Add(points[next]);
            current = next;
        }
        return result;
    }

    private static bool ValidSegment(
        Point2 a,
        Point2 b,
        Point2 routeStart,
        Point2 routeEnd,
        MovementCostField field,
        double validationStep)
    {
        var length = PolygonMath.Distance(a, b);
        var divisions = Math.Max(1, (int)Math.Ceiling(length / validationStep));
        var endpointAllowance = field.CellSizeM * 1.5;
        for (var index = 0; index <= divisions; index++)
        {
            var t = (double)index / divisions;
            var point = new Point2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
            if (Traversable(field, point)) continue;
            if (PolygonMath.Distance(point, routeStart) <= endpointAllowance
                || PolygonMath.Distance(point, routeEnd) <= endpointAllowance)
                continue;
            return false;
        }
        return true;
    }

    private static List<Point2> Chaikin(IReadOnlyList<Point2> points, double ratio)
    {
        var result = new List<Point2> { points[0] };
        for (var index = 0; index < points.Count - 1; index++)
        {
            var a = points[index];
            var b = points[index + 1];
            var q = new Point2(a.X * (1 - ratio) + b.X * ratio, a.Y * (1 - ratio) + b.Y * ratio);
            var r = new Point2(a.X * ratio + b.X * (1 - ratio), a.Y * ratio + b.Y * (1 - ratio));
            if (PolygonMath.Distance(result[^1], q) > 1e-9) result.Add(q);
            if (PolygonMath.Distance(result[^1], r) > 1e-9) result.Add(r);
        }
        if (PolygonMath.Distance(result[^1], points[^1]) > 1e-9) result.Add(points[^1]);
        return result;
    }

    private static bool Traversable(MovementCostField field, Point2 point)
    {
        var column = (int)Math.Floor((point.X - field.OriginX) / field.CellSizeM);
        var row = (int)Math.Floor((point.Y - field.OriginY) / field.CellSizeM);
        if (column < 0 || row < 0 || column >= field.ColumnCount || row >= field.RowCount) return false;
        return field.Cell(column, row).Traversable;
    }
}
