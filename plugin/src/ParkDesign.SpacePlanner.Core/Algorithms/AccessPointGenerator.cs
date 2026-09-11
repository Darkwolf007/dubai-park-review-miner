using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class AccessPointGenerator
{
    private sealed record Candidate(
        Point2 Point,
        Point2 Approach,
        string Source,
        string AccessType,
        double Score,
        bool Accessible,
        bool AllowsService,
        string StableSourceId);

    public static AccessPointGenerationResult Generate(
        IReadOnlyList<Point2> siteBoundary,
        IReadOnlyList<SpaceRegion> regions,
        IReadOnlyList<SiteEntrance> entrances,
        IReadOnlyList<MovementDemandDefinition> movementDemands,
        IReadOnlyList<ExplicitAccessPoint>? explicitAccessPoints = null,
        AccessPointGenerationSettings? settings = null)
    {
        settings ??= new();
        explicitAccessPoints ??= [];
        var errors = SpaceRegionValidator.Validate(siteBoundary, regions, settings.BoundaryToleranceM);
        if (errors.Count > 0)
            throw new ArgumentException(string.Join(Environment.NewLine, errors));

        var result = new AccessPointGenerationResult();
        var regionById = regions.ToDictionary(region => region.ProgramId, StringComparer.Ordinal);
        foreach (var point in explicitAccessPoints.Where(point => !regionById.ContainsKey(point.ProgramId)))
            result.Warnings.Add($"ACCESS_PROGRAM_MISSING: Explicit access '{point.Id}' references unknown program '{point.ProgramId}'.");

        var centroidById = regions.ToDictionary(
            region => region.ProgramId,
            region => PolygonMath.Centroid(SpaceRegionValidator.NormalizeRing(region.Ring)),
            StringComparer.Ordinal);

        foreach (var region in regions.OrderBy(region => region.ProgramId, StringComparer.Ordinal))
        {
            var ring = SpaceRegionValidator.NormalizeRing(region.Ring);
            var center = centroidById[region.ProgramId];
            var candidates = new List<Candidate>();

            foreach (var point in explicitAccessPoints.Where(point => point.ProgramId == region.ProgramId)
                         .OrderBy(point => point.Id, StringComparer.Ordinal))
            {
                var projected = ProjectToBoundary(ring, point.Point);
                if (PolygonMath.Distance(projected.Point, point.Point) > settings.BoundaryToleranceM)
                    result.Warnings.Add($"ACCESS_PROJECTED: Explicit access '{point.Id}' was projected to the '{region.ProgramId}' boundary.");
                candidates.Add(new(projected.Point, UnitVector(projected.Point, point.Point, center), "explicit",
                    point.AccessType, 1_000_000 + point.Priority, point.Accessible, point.AllowsService, point.Id));
            }

            var regionDemand = movementDemands.Where(demand =>
                    demand.Origin == region.ProgramId || demand.Destination == region.ProgramId)
                .Sum(demand => Math.Max(0, demand.Weight));
            foreach (var entrance in entrances.OrderBy(entrance => entrance.Id, StringComparer.Ordinal))
            {
                if (entrance.Type == SiteEntranceType.Service && !region.RequiresService) continue;
                if (entrance.Type != SiteEntranceType.Service && !region.PublicAccess) continue;
                var projected = ProjectToBoundary(ring, entrance.Point);
                var score = 1000 + regionDemand * Math.Max(0, entrance.DemandWeight)
                    / (1 + PolygonMath.Distance(projected.Point, entrance.Point));
                candidates.Add(new(projected.Point, UnitVector(projected.Point, entrance.Point, center),
                    "entrance_projection", entrance.Type == SiteEntranceType.Service ? "service" : "public",
                    score, entrance.Accessible, entrance.AllowsService, entrance.Id));
            }

            foreach (var demand in movementDemands.Where(demand =>
                         demand.Origin == region.ProgramId || demand.Destination == region.ProgramId)
                         .OrderByDescending(demand => demand.Weight)
                         .ThenBy(demand => demand.Origin, StringComparer.Ordinal)
                         .ThenBy(demand => demand.Destination, StringComparer.Ordinal))
            {
                if (!region.PublicAccess) continue;
                var otherId = demand.Origin == region.ProgramId ? demand.Destination : demand.Origin;
                if (!centroidById.TryGetValue(otherId, out var otherCenter)) continue;
                var projected = ProjectToBoundary(ring, otherCenter);
                candidates.Add(new(projected.Point, UnitVector(projected.Point, otherCenter, center),
                    "demand_projection", "public", 100 + Math.Max(0, demand.Weight),
                    true, false, otherId));
            }

            var perimeter = Perimeter(ring);
            var fallbackCount = Math.Clamp(
                (int)Math.Ceiling(perimeter / Math.Max(1, settings.CandidateSpacingM)),
                1,
                settings.MaximumCandidatesPerSpace);
            for (var index = 0; index < fallbackCount; index++)
            {
                var point = PointAtDistance(ring, perimeter * index / fallbackCount);
                var accessType = region.PublicAccess ? "public" : "service";
                candidates.Add(new(point, UnitVector(point, point, center), "perimeter_fallback", accessType,
                    region.Priority, region.PublicAccess, region.RequiresService, index.ToString(CultureInfo.InvariantCulture)));
            }

            var distinct = Deduplicate(candidates, settings.BoundaryToleranceM)
                .OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => candidate.Source, StringComparer.Ordinal)
                .ThenBy(candidate => candidate.Point.X)
                .ThenBy(candidate => candidate.Point.Y)
                .ToList();
            var requestedCount = region.AccessPointCount ?? DefaultAccessCount(perimeter);
            var selected = Select(distinct, requestedCount, settings.MinimumSelectedSpacingM);
            var selectedKeys = selected.Select(CandidateKey).ToHashSet(StringComparer.Ordinal);

            foreach (var candidate in distinct)
            {
                var id = StableId(region.ProgramId, candidate);
                var accessPoint = new ProgramAccessPoint(id, region.ProgramId, candidate.Point, candidate.Approach,
                    candidate.Source, candidate.AccessType, candidate.Score, selectedKeys.Contains(CandidateKey(candidate)),
                    candidate.Accessible, candidate.AllowsService);
                result.Candidates.Add(accessPoint);
                if (accessPoint.Selected) result.Selected.Add(accessPoint);
            }

            if (selected.Count < requestedCount)
                result.Warnings.Add($"ACCESS_COUNT_UNMET: '{region.ProgramId}' selected {selected.Count}/{requestedCount} sufficiently separated access points.");
        }
        return result;
    }

    private static List<Candidate> Select(IReadOnlyList<Candidate> candidates, int count, double minimumSpacing)
    {
        var selected = new List<Candidate>();
        foreach (var candidate in candidates)
        {
            if (selected.Count >= count) break;
            if (candidate.Source != "explicit"
                && selected.Any(existing => PolygonMath.Distance(existing.Point, candidate.Point) < minimumSpacing))
                continue;
            selected.Add(candidate);
        }
        return selected;
    }

    private static List<Candidate> Deduplicate(IEnumerable<Candidate> candidates, double tolerance)
    {
        var result = new List<Candidate>();
        foreach (var candidate in candidates)
        {
            var existingIndex = result.FindIndex(existing =>
                PolygonMath.Distance(existing.Point, candidate.Point) <= tolerance
                && existing.AccessType == candidate.AccessType);
            if (existingIndex < 0)
            {
                result.Add(candidate);
                continue;
            }
            if (candidate.Score > result[existingIndex].Score)
                result[existingIndex] = candidate;
        }
        return result;
    }

    private static int DefaultAccessCount(double perimeter) => perimeter switch
    {
        < 80 => 1,
        < 200 => 2,
        _ => 3
    };

    private static (Point2 Point, int SegmentIndex) ProjectToBoundary(IReadOnlyList<Point2> ring, Point2 target)
    {
        var best = ring[0];
        var bestIndex = 0;
        var bestDistance = double.PositiveInfinity;
        for (var index = 0; index < ring.Count; index++)
        {
            var candidate = ClosestPointOnSegment(target, ring[index], ring[(index + 1) % ring.Count]);
            var distance = PolygonMath.Distance(candidate, target);
            if (distance >= bestDistance) continue;
            best = candidate;
            bestDistance = distance;
            bestIndex = index;
        }
        return (best, bestIndex);
    }

    private static Point2 ClosestPointOnSegment(Point2 point, Point2 a, Point2 b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        var lengthSquared = dx * dx + dy * dy;
        if (lengthSquared <= 1e-12) return a;
        var t = Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / lengthSquared, 0, 1);
        return new(a.X + t * dx, a.Y + t * dy);
    }

    private static Point2 UnitVector(Point2 boundaryPoint, Point2 target, Point2 center)
    {
        var dx = target.X - boundaryPoint.X;
        var dy = target.Y - boundaryPoint.Y;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length <= 1e-9)
        {
            dx = boundaryPoint.X - center.X;
            dy = boundaryPoint.Y - center.Y;
            length = Math.Sqrt(dx * dx + dy * dy);
        }
        return length <= 1e-9 ? new Point2(0, 0) : new Point2(dx / length, dy / length);
    }

    private static double Perimeter(IReadOnlyList<Point2> ring)
    {
        var length = 0d;
        for (var index = 0; index < ring.Count; index++)
            length += PolygonMath.Distance(ring[index], ring[(index + 1) % ring.Count]);
        return length;
    }

    private static Point2 PointAtDistance(IReadOnlyList<Point2> ring, double distance)
    {
        for (var index = 0; index < ring.Count; index++)
        {
            var a = ring[index];
            var b = ring[(index + 1) % ring.Count];
            var length = PolygonMath.Distance(a, b);
            if (distance <= length || index == ring.Count - 1)
            {
                var t = length <= 1e-12 ? 0 : Math.Clamp(distance / length, 0, 1);
                return new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
            }
            distance -= length;
        }
        return ring[0];
    }

    private static string StableId(string programId, Candidate candidate)
    {
        var payload = string.Join("|",
            programId,
            candidate.Source,
            candidate.StableSourceId,
            Math.Round(candidate.Point.X, 3).ToString("0.000", CultureInfo.InvariantCulture),
            Math.Round(candidate.Point.Y, 3).ToString("0.000", CultureInfo.InvariantCulture));
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return $"access-{programId}-{Convert.ToHexString(digest)[..12].ToLowerInvariant()}";
    }

    private static string CandidateKey(Candidate candidate) =>
        $"{candidate.Source}|{candidate.StableSourceId}|{candidate.AccessType}|{candidate.Point.X:0.000}|{candidate.Point.Y:0.000}";
}
