using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class SpaceRegionValidator
{
    public static IReadOnlyList<string> Validate(
        IReadOnlyList<Point2> siteBoundary,
        IReadOnlyList<SpaceRegion> regions,
        double toleranceM = 0.05)
    {
        var errors = new List<string>();
        if (NormalizeRing(siteBoundary).Count < 3)
            errors.Add("SITE_BOUNDARY_INVALID: Site boundary needs at least three distinct points.");

        foreach (var duplicate in regions.GroupBy(region => region.ProgramId, StringComparer.Ordinal)
                     .Where(group => string.IsNullOrWhiteSpace(group.Key) || group.Count() > 1))
            errors.Add($"SPACE_ID_INVALID: Program ID '{duplicate.Key}' is empty or duplicated.");

        foreach (var region in regions)
        {
            var ring = NormalizeRing(region.Ring);
            if (ring.Count < 3)
            {
                errors.Add($"SPACE_RING_INVALID: '{region.ProgramId}' has no usable polygon area.");
                continue;
            }
            var selfIntersects = SelfIntersects(ring, toleranceM);
            if (selfIntersects)
                errors.Add($"SPACE_RING_SELF_INTERSECTION: '{region.ProgramId}' is self-intersecting.");
            if (Math.Abs(PolygonMath.SignedArea(ring)) <= toleranceM * toleranceM)
                errors.Add($"SPACE_RING_INVALID: '{region.ProgramId}' has no usable polygon area.");
            var outsideDistances = ring.Where(point => !PolygonMath.Contains(siteBoundary, point))
                .Select(point => PolygonMath.DistanceToBoundary(siteBoundary, point)).ToList();
            var maximumOutsideDistance = outsideDistances.Count == 0 ? 0 : outsideDistances.Max();
            if (maximumOutsideDistance > toleranceM)
                errors.Add($"SPACE_OUTSIDE_SITE: '{region.ProgramId}' extends approximately {maximumOutsideDistance:0.###} m beyond the site boundary.");
            if (region.AccessPointCount is < 0)
                errors.Add($"SPACE_ACCESS_COUNT_INVALID: '{region.ProgramId}' has a negative access-point count.");
        }
        return errors;
    }

    public static List<Point2> NormalizeRing(IReadOnlyList<Point2> ring)
    {
        var normalized = new List<Point2>();
        foreach (var point in ring)
            if (normalized.Count == 0 || PolygonMath.Distance(normalized[^1], point) > 1e-9)
                normalized.Add(point);
        if (normalized.Count > 1 && PolygonMath.Distance(normalized[0], normalized[^1]) <= 1e-9)
            normalized.RemoveAt(normalized.Count - 1);
        return normalized;
    }

    private static bool SelfIntersects(IReadOnlyList<Point2> ring, double tolerance)
    {
        for (var i = 0; i < ring.Count; i++)
        for (var j = i + 1; j < ring.Count; j++)
        {
            if (j == i || j == (i + 1) % ring.Count || i == (j + 1) % ring.Count) continue;
            if (SegmentsIntersect(ring[i], ring[(i + 1) % ring.Count],
                    ring[j], ring[(j + 1) % ring.Count], tolerance))
                return true;
        }
        return false;
    }

    private static bool SegmentsIntersect(Point2 a, Point2 b, Point2 c, Point2 d, double tolerance)
    {
        static double Cross(Point2 p, Point2 q, Point2 r) =>
            (q.X - p.X) * (r.Y - p.Y) - (q.Y - p.Y) * (r.X - p.X);
        var abC = Cross(a, b, c);
        var abD = Cross(a, b, d);
        var cdA = Cross(c, d, a);
        var cdB = Cross(c, d, b);
        return ((abC > tolerance && abD < -tolerance) || (abC < -tolerance && abD > tolerance))
            && ((cdA > tolerance && cdB < -tolerance) || (cdA < -tolerance && cdB > tolerance));
    }
}
