using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>
/// Converts approved climate/movement intelligence into inspectable guide geometry.
/// These are generative axes and candidate clearings, not final landscape edges.
/// </summary>
public static class DuneMorphologyGenerator
{
    public static List<MorphologyAxisPlacement> GenerateAxes(IReadOnlyList<Point2> boundary,
        ClimateMorphologyDefinition definition, int seed = 0, IEnumerable<BubblePlacement>? protectedAreas = null)
    {
        var axes = new List<MorphologyAxisDefinition>();
        if (!string.IsNullOrWhiteSpace(definition.SiteAxes.PrimarySikka.Id)) axes.Add(definition.SiteAxes.PrimarySikka);
        axes.AddRange(definition.SiteAxes.VentilationCuts.Where(axis => !string.IsNullOrWhiteSpace(axis.Id)));
        var protectedList = (protectedAreas ?? []).Where(area => IsProtected(area.ProgramId, area.ProgramName)).ToList();
        return axes.Select((axis, index) => SeededAxis(boundary, axis, definition.SiteAxes, seed, index, protectedList))
            .Where(axis => axis is not null).Cast<MorphologyAxisPlacement>().ToList();
    }

    private static MorphologyAxisPlacement? SeededAxis(IReadOnlyList<Point2> boundary, MorphologyAxisDefinition baseline,
        SiteAxesDefinition settings, int masterSeed, int index, IReadOnlyList<BubblePlacement> protectedAreas)
    {
        var subsystemSeed = DeterministicSeed.Derive(masterSeed, $"dune-axis:{baseline.Id}", index);
        var angleLimit = Math.Clamp(settings.SeedAzimuthVariationMaxDeg, 0, 30);
        var offsetLimit = Math.Max(0, settings.SeedLateralVariationMaxM);
        var candidates = new List<MorphologyAxisPlacement>();
        for (var candidateIndex = 0; candidateIndex < 9; candidateIndex++)
        {
            var angleNoise = DeterministicSeed.Unit(subsystemSeed, $"angle:{candidateIndex}") * 2 - 1;
            var offsetNoise = DeterministicSeed.Unit(subsystemSeed, $"offset:{candidateIndex}") * 2 - 1;
            var angle = baseline.AzimuthDegFromNorth + angleNoise * angleLimit;
            var offset = baseline.OffsetM + offsetNoise * offsetLimit;
            var generated = ClipAxis(boundary, baseline, angle, offset, subsystemSeed);
            if (generated is null) continue;
            var climateCompliance = 1 - Math.Abs(angle - baseline.AzimuthDegFromNorth) / Math.Max(1, angleLimit * 2);
            var protectedClearance = protectedAreas.Count == 0 ? 1 : protectedAreas
                .Select(area => DistanceToSegment(area.Center, generated.Points[0], generated.Points[^1]) - area.Radius)
                .Select(distance => Math.Clamp(distance / 20, 0, 1)).Average();
            candidates.Add(generated with { Score = .7 * climateCompliance + .3 * protectedClearance });
        }
        return candidates.OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.AzimuthDegFromNorth).FirstOrDefault();
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

    private static MorphologyAxisPlacement? ClipAxis(IReadOnlyList<Point2> boundary, MorphologyAxisDefinition axis,
        double generatedAzimuth, double generatedOffset, int seed)
    {
        if (boundary.Count < 3) return null;
        var centroid = PolygonMath.Centroid(boundary);
        var radians = generatedAzimuth * Math.PI / 180d;
        var direction = new Point2(Math.Sin(radians), Math.Cos(radians));
        var perpendicular = new Point2(-direction.Y, direction.X);
        var origin = new Point2(centroid.X + perpendicular.X * generatedOffset, centroid.Y + perpendicular.Y * generatedOffset);
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
        return new(axis.Id, axis.Role, [unique[0], unique[^1]], generatedAzimuth,
            $"{axis.Basis}; seeded climate-constrained variation", axis.AzimuthDegFromNorth, generatedOffset, seed);
    }

    private static bool IsProtected(string id, string name)
    {
        var value = $"{id} {name}";
        return new[] { "operation", "maintenance", "court", "playground", "toddler", "children play" }
            .Any(token => value.Contains(token, StringComparison.OrdinalIgnoreCase));
    }

    private static double DistanceToSegment(Point2 point, Point2 a, Point2 b)
    {
        var dx = b.X - a.X; var dy = b.Y - a.Y;
        var denominator = dx * dx + dy * dy;
        var t = denominator <= 1e-12 ? 0 : Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / denominator, 0, 1);
        return PolygonMath.Distance(point, new(a.X + dx * t, a.Y + dy * t));
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
