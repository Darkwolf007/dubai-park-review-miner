using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class BubbleDistributor
{
    public static DistributionResult Distribute(
        IReadOnlyList<Point2> boundary,
        IEnumerable<ProgramDefinition> programs,
        int seed = 1,
        int candidateCount = 6000,
        GridDefinition? grid = null,
        IEnumerable<RelationshipDefinition>? relationships = null,
        LayoutStrategy strategy = LayoutStrategy.Balanced,
        GeneratedStrategy? generatedStrategy = null,
        IReadOnlyList<AccessCandidateDefinition>? accessCandidates = null,
        IReadOnlyList<MovementDemandDefinition>? movementDemands = null)
    {
        if (boundary.Count < 3) throw new ArgumentException("Boundary requires at least three vertices.", nameof(boundary));

        var area = Math.Abs(PolygonMath.SignedArea(boundary));
        var genome = generatedStrategy?.Organisation;
        var anchors = genome?.AnchorProgramIds.ToHashSet(StringComparer.Ordinal);
        var movementIds = movementDemands?.GroupBy(d => d.Destination, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Sum(d => Math.Max(0, d.Weight)), StringComparer.Ordinal);
        var placeable = programs
            .Where(program => program.Selected && program.TargetAreaM2 is > 0)
            .OrderBy(program => string.Equals(program.SpatialMode, "exclusive", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(program => anchors?.Contains(program.Id) == true ? 0 : 1)
            .ThenByDescending(program => program.TargetAreaM2)
            .ThenBy(program => program.Id, StringComparer.Ordinal)
            .ToList();
        var requestedArea = placeable.Sum(program => program.TargetAreaM2!.Value);
        var exclusiveRequestedArea = placeable
            .Where(program => string.Equals(program.SpatialMode, "exclusive", StringComparison.OrdinalIgnoreCase))
            .Sum(program => program.TargetAreaM2!.Value);
        var result = new DistributionResult { BoundaryAreaM2 = area, RequestedProgramAreaM2 = requestedArea };
        var relationList = relationships?.Where(item => item.Accepted).ToList() ?? [];
        var weights = SpatialScoring.Weights(strategy);

        if (exclusiveRequestedArea > area)
            result.Warnings.Add($"Requested exclusive program area ({exclusiveRequestedArea:0} m2) exceeds boundary area ({area:0} m2). Shared and overlay demand is excluded from this capacity check.");

        var minX = boundary.Min(point => point.X);
        var maxX = boundary.Max(point => point.X);
        var minY = boundary.Min(point => point.Y);
        var maxY = boundary.Max(point => point.Y);
        var centroid = PolygonMath.Centroid(boundary);
        var siteScale = Math.Sqrt(area);

        foreach (var program in placeable)
        {
            var targetArea = program.TargetAreaM2!.Value;
            var radius = Math.Sqrt(targetArea / Math.PI);
            Point2? best = null;
            var bestScore = double.PositiveInfinity;
            var bestSuitability = 0d;
            var bestRelationshipPenalty = 0d;
            var placedById = result.Placements.ToDictionary(item => item.ProgramId, item => item.Center);
            var gridCandidates = (grid?.Cells ?? [])
                .Select(cell => (Point: new Point2(cell.X, cell.Y), Cell: cell, Suitability: SpatialScoring.CellSuitability(cell, program)))
                .Where(candidate => candidate.Suitability is not null)
                .OrderByDescending(candidate => candidate.Suitability)
                .ThenBy(candidate => candidate.Cell.Id, StringComparer.Ordinal)
                .ToList();

            var totalCandidates = Math.Max(candidateCount, gridCandidates.Count + 1);
            for (var index = 0; index < totalCandidates; index++)
            {
                Point2 candidate;
                double suitability;
                string candidateId;
                if (index < gridCandidates.Count)
                {
                    candidate = gridCandidates[index].Point;
                    suitability = gridCandidates[index].Suitability!.Value;
                    candidateId = gridCandidates[index].Cell.Id;
                }
                else if (index == gridCandidates.Count)
                {
                    candidate = centroid;
                    suitability = NearestSuitability(candidate, gridCandidates);
                    candidateId = "centroid";
                }
                else
                {
                    var offset = Math.Abs(seed % 997) + 1;
                    var sample = index - gridCandidates.Count;
                    candidate = new Point2(
                        minX + Halton(sample + offset, 2) * (maxX - minX),
                        minY + Halton(sample + offset, 3) * (maxY - minY));
                    suitability = NearestSuitability(candidate, gridCandidates);
                    candidateId = $"halton-{sample}";
                }

                if (!PolygonMath.Contains(boundary, candidate)) continue;
                var clearance = PolygonMath.DistanceToBoundary(boundary, candidate);
                if (clearance + 1e-7 < radius) continue;
                var overlapPenalty = result.Placements.Sum(other =>
                {
                    var otherProgram = placeable.First(item => item.Id == other.ProgramId);
                    var required = RequiredSeparation(program, radius, otherProgram, other.Radius, relationList);
                    var overlap = Math.Max(0, required - PolygonMath.Distance(candidate, other.Center));
                    return Math.Pow(overlap / Math.Max(1, radius + other.Radius), 2);
                });

                var relationshipPenalty = SpatialScoring.RelationshipPenalty(program.Id, candidate, placedById, relationList, siteScale, out var hardViolation);
                if (hardViolation) continue;
                var zonePenalty = ZonePenalty(program.LocationZone, clearance, radius, siteScale);
                var score = weights.Zone * zonePenalty
                    + weights.Suitability * (1 - suitability)
                    + weights.Relationships * relationshipPenalty
                    + 20 * overlapPenalty
                    + SpatialScoring.SeedNoise(seed, program.Id, candidateId) * 0.1;
                if (genome is not null)
                {
                    var centerDistance = PolygonMath.Distance(candidate, centroid) / Math.Max(1, siteScale);
                    var edgeDistance = clearance / Math.Max(1, siteScale);
                    var isAnchor = anchors!.Contains(program.Id);
                    score += (isAnchor ? genome.CentralityBias : genome.CentralityBias * .25) * centerDistance;
                    score += genome.EdgeAffinity * (isAnchor ? .25 : 1) * edgeDistance;
                    score += genome.EnvironmentalInfluence * (1 - suitability);
                    score += genome.RelationshipInfluence * relationshipPenalty;
                    if (!isAnchor && result.Placements.Count > 0)
                    {
                        var nearestAnchor = result.Placements.Where(p => anchors.Contains(p.ProgramId))
                            .Select(p => PolygonMath.Distance(candidate, p.Center)).DefaultIfEmpty(siteScale).Min() / Math.Max(1, siteScale);
                        score += genome.ClusteringStrength * nearestAnchor;
                        score += genome.DispersionStrength * (1 - Math.Clamp(nearestAnchor, 0, 1));
                    }
                    var projected = ((candidate.X - centroid.X) * genome.OrientationX +
                        (candidate.Y - centroid.Y) * genome.OrientationY) / Math.Max(1, siteScale);
                    score -= genome.RouteInfluence * (movementIds?.GetValueOrDefault(program.Id) > 0 ? .45 : .1) * projected;
                    if (accessCandidates is { Count: > 0 })
                    {
                        var entranceDistance = accessCandidates.Min(a => PolygonMath.Distance(candidate, new Point2(a.Coordinates.X, a.Coordinates.Y))) / Math.Max(1, siteScale);
                        score += genome.EntranceInfluence * entranceDistance;
                    }
                }
                if (score >= bestScore) continue;
                best = candidate;
                bestScore = score;
                bestSuitability = suitability;
                bestRelationshipPenalty = relationshipPenalty;
            }

            if (best is null)
            {
                result.Warnings.Add($"Could not place {program.Name} while satisfying the boundary, overlap, grid, and accepted mandatory relationship constraints.");
                continue;
            }

            result.Placements.Add(new BubblePlacement(
                program.Id, program.Name, best.Value, radius, targetArea,
                program.LocationZone, bestSuitability, bestRelationshipPenalty, program.SpatialMode));
        }

        if (result.Placements.Count > 0)
        {
            result.AverageSuitability = result.Placements.Average(item => item.SuitabilityScore);
            result.RelationshipPenalty = result.Placements.Average(item => item.RelationshipPenalty);
        }
        return result;
    }

    private static double NearestSuitability(Point2 point, IReadOnlyList<(Point2 Point, GridCell Cell, double? Suitability)> candidates)
    {
        if (candidates.Count == 0) return 0;
        return candidates.OrderBy(candidate => PolygonMath.Distance(point, candidate.Point)).First().Suitability ?? 0;
    }

    private static double RequiredSeparation(ProgramDefinition program, double radius, ProgramDefinition other, double otherRadius,
        IReadOnlyList<RelationshipDefinition> relationships)
    {
        var explicitCompatibility = relationships
            .Where(item => item.Accepted && item.Type.Contains("overlap", StringComparison.OrdinalIgnoreCase)
                && ((item.Source == program.Id && item.Target == other.Id) || (item.Source == other.Id && item.Target == program.Id)))
            .Select(item => Math.Clamp(item.CompatibilityScore ?? 0, 0, 1))
            .DefaultIfEmpty(-1)
            .Max();
        var compatibility = explicitCompatibility >= 0
            ? explicitCompatibility
            : string.Equals(program.SpatialMode, "shared", StringComparison.OrdinalIgnoreCase)
                || string.Equals(other.SpatialMode, "shared", StringComparison.OrdinalIgnoreCase) ? .5 : 0;
        return (radius + otherRadius) * (1 - compatibility);
    }

    private static double ZonePenalty(string zone, double clearance, double radius, double siteScale)
    {
        var normalizedClearance = Math.Max(0, clearance - radius) / Math.Max(1, siteScale);
        return (zone ?? string.Empty).ToUpperInvariant() switch
        {
            "INNER_BUFFER" => -normalizedClearance,
            "PERIMETER_LOOP" => normalizedClearance,
            "ACTIVE_EDGE" => Math.Abs(normalizedClearance - 0.08),
            "GATEWAY_NODE" => normalizedClearance,
            _ => 0
        };
    }

    private static double Halton(int index, int numberBase)
    {
        var result = 0d;
        var fraction = 1d / numberBase;
        while (index > 0)
        {
            result += fraction * (index % numberBase);
            index /= numberBase;
            fraction /= numberBase;
        }
        return result;
    }
}
