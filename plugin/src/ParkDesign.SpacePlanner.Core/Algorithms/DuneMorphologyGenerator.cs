using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>
/// Converts approved climate/movement intelligence into inspectable guide geometry.
/// These are generative axes and candidate clearings, not final landscape edges.
/// </summary>
public static class DuneMorphologyGenerator
{
    public static List<MorphologyAxisPlacement> GenerateAxes(IReadOnlyList<Point2> boundary, ClimateMorphologyDefinition definition)
    {
        var axes = new List<MorphologyAxisDefinition>();
        if (!string.IsNullOrWhiteSpace(definition.SiteAxes.PrimarySikka.Id)) axes.Add(definition.SiteAxes.PrimarySikka);
        axes.AddRange(definition.SiteAxes.VentilationCuts.Where(axis => !string.IsNullOrWhiteSpace(axis.Id)));
        return axes.Select(axis => ClipAxis(boundary, axis)).Where(axis => axis is not null).Cast<MorphologyAxisPlacement>().ToList();
    }

    public static List<BarahaCandidate> GenerateBaraha(IEnumerable<RoutePlacement> routes,
        IEnumerable<BubblePlacement> areas, BarahaRulesDefinition rules)
    {
        var routeList = routes.Where(route => route.Points.Count >= 2).ToList();
        var raw = new List<(Point2 Point, string A, string B)>();
        for (var i = 0; i < routeList.Count; i++)
        for (var j = i + 1; j < routeList.Count; j++)
        {
            if (routeList[i].ProgramId == routeList[j].ProgramId) continue;
            for (var a = 0; a < routeList[i].Points.Count - 1; a++)
            for (var b = 0; b < routeList[j].Points.Count - 1; b++)
                if (SegmentIntersection(routeList[i].Points[a], routeList[i].Points[a + 1], routeList[j].Points[b], routeList[j].Points[b + 1], out var point))
                    raw.Add((point, routeList[i].ProgramId, routeList[j].ProgramId));
        }

        var clusters = new List<(List<Point2> Points, HashSet<string> Routes)>();
        foreach (var item in raw.OrderBy(item => item.Point.X).ThenBy(item => item.Point.Y))
        {
            var cluster = clusters.FirstOrDefault(candidate => PolygonMath.Distance(Centroid(candidate.Points), item.Point) <= rules.ClusterDistanceM);
            if (cluster.Points is null)
            {
                cluster = ([], new(StringComparer.Ordinal));
                clusters.Add(cluster);
            }
            cluster.Points.Add(item.Point);
            cluster.Routes.Add(item.A);
            cluster.Routes.Add(item.B);
        }

        var socialIds = rules.SocialProgramIds.ToHashSet(StringComparer.Ordinal);
        var socialAreas = areas.Where(area => socialIds.Contains(area.ProgramId)).ToList();
        return clusters
            .Where(cluster => cluster.Routes.Count >= Math.Max(2, rules.MinimumDistinctRoutes))
            .Select(cluster =>
            {
                var point = Centroid(cluster.Points);
                var routeScore = Math.Min(1, cluster.Routes.Count / 4d);
                var nearestSocialM = socialAreas.Count == 0 ? 100 : socialAreas.Min(area => PolygonMath.Distance(point, area.Center));
                var socialScore = 1 / (1 + nearestSocialM / 30d);
                var score = Math.Clamp(.7 * routeScore + .3 * socialScore, 0, 1);
                var radius = rules.MinimumRadiusM + (rules.MaximumRadiusM - rules.MinimumRadiusM) * score;
                return new BarahaCandidate(point, radius, cluster.Routes.OrderBy(id => id, StringComparer.Ordinal).ToList(), score,
                    $"{cluster.Routes.Count} intersecting movement systems; nearest social program {nearestSocialM:0.0}m");
            })
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Point.X)
            .ToList();
    }

    private static MorphologyAxisPlacement? ClipAxis(IReadOnlyList<Point2> boundary, MorphologyAxisDefinition axis)
    {
        if (boundary.Count < 3) return null;
        var centroid = PolygonMath.Centroid(boundary);
        var radians = axis.AzimuthDegFromNorth * Math.PI / 180d;
        var direction = new Point2(Math.Sin(radians), Math.Cos(radians));
        var perpendicular = new Point2(-direction.Y, direction.X);
        var origin = new Point2(centroid.X + perpendicular.X * axis.OffsetM, centroid.Y + perpendicular.Y * axis.OffsetM);
        var intersections = new List<(double T, Point2 Point)>();
        for (var i = 0; i < boundary.Count; i++)
        {
            var a = boundary[i]; var b = boundary[(i + 1) % boundary.Count];
            var segment = new Point2(b.X - a.X, b.Y - a.Y);
            var denominator = Cross(direction, segment);
            if (Math.Abs(denominator) < 1e-9) continue;
            var delta = new Point2(a.X - origin.X, a.Y - origin.Y);
            var t = Cross(delta, segment) / denominator;
            var u = Cross(delta, direction) / denominator;
            if (u < -1e-8 || u > 1 + 1e-8) continue;
            intersections.Add((t, new(origin.X + direction.X * t, origin.Y + direction.Y * t)));
        }
        var unique = intersections.OrderBy(item => item.T).Select(item => item.Point)
            .Aggregate(new List<Point2>(), (list, point) => { if (list.Count == 0 || PolygonMath.Distance(list[^1], point) > 1e-6) list.Add(point); return list; });
        if (unique.Count < 2) return null;
        return new(axis.Id, axis.Role, [unique[0], unique[^1]], axis.AzimuthDegFromNorth, axis.Basis);
    }

    private static bool SegmentIntersection(Point2 a, Point2 b, Point2 c, Point2 d, out Point2 point)
    {
        var r = new Point2(b.X - a.X, b.Y - a.Y);
        var s = new Point2(d.X - c.X, d.Y - c.Y);
        var denominator = Cross(r, s);
        if (Math.Abs(denominator) < 1e-9) { point = default; return false; }
        var delta = new Point2(c.X - a.X, c.Y - a.Y);
        var t = Cross(delta, s) / denominator;
        var u = Cross(delta, r) / denominator;
        if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) { point = default; return false; }
        point = new(a.X + t * r.X, a.Y + t * r.Y);
        return true;
    }

    private static Point2 Centroid(IReadOnlyList<Point2> points) =>
        new(points.Average(point => point.X), points.Average(point => point.Y));

    private static double Cross(Point2 a, Point2 b) => a.X * b.Y - a.Y * b.X;
}
