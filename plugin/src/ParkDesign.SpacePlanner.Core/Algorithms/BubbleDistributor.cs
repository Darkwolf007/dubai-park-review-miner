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
        LayoutStrategy strategy = LayoutStrategy.Balanced)
    {
        if (boundary.Count < 3) throw new ArgumentException("Boundary requires at least three vertices.", nameof(boundary));

        var area = Math.Abs(PolygonMath.SignedArea(boundary));
        var placeable = programs
            .Where(program => program.Selected && program.TargetAreaM2 is > 0)
            .OrderByDescending(program => program.TargetAreaM2)
            .ThenBy(program => program.Id, StringComparer.Ordinal)
            .ToList();
        var requestedArea = placeable.Sum(program => program.TargetAreaM2!.Value);
        var result = new DistributionResult { BoundaryAreaM2 = area, RequestedProgramAreaM2 = requestedArea };
        var relationList = relationships?.Where(item => item.Accepted).ToList() ?? [];
        var weights = SpatialScoring.Weights(strategy);

        if (requestedArea > area)
            result.Warnings.Add($"Requested program area ({requestedArea:0} m2) exceeds boundary area ({area:0} m2).");

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
                if (result.Placements.Any(other => PolygonMath.Distance(candidate, other.Center) + 1e-7 < radius + other.Radius)) continue;

                var relationshipPenalty = SpatialScoring.RelationshipPenalty(program.Id, candidate, placedById, relationList, siteScale, out var hardViolation);
                if (hardViolation) continue;
                var zonePenalty = ZonePenalty(program.LocationZone, clearance, radius, siteScale);
                var score = weights.Zone * zonePenalty
                    + weights.Suitability * (1 - suitability)
                    + weights.Relationships * relationshipPenalty
                    + SpatialScoring.SeedNoise(seed, program.Id, candidateId) * 0.1;
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
                program.LocationZone, bestSuitability, bestRelationshipPenalty));
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
