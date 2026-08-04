using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class BubbleDistributor
{
    public static DistributionResult Distribute(
        IReadOnlyList<Point2> boundary,
        IEnumerable<ProgramDefinition> programs,
        int seed = 1,
        int candidateCount = 6000)
    {
        if (boundary.Count < 3) throw new ArgumentException("Boundary requires at least three vertices.", nameof(boundary));

        var area = Math.Abs(PolygonMath.SignedArea(boundary));
        var placeable = programs
            .Where(program => program.Selected && program.TargetAreaM2 is > 0)
            .OrderByDescending(program => program.TargetAreaM2)
            .ThenBy(program => program.Id, StringComparer.Ordinal)
            .ToList();
        var requestedArea = placeable.Sum(program => program.TargetAreaM2!.Value);
        var result = new DistributionResult
        {
            BoundaryAreaM2 = area,
            RequestedProgramAreaM2 = requestedArea
        };

        if (requestedArea > area)
            result.Warnings.Add($"Requested program area ({requestedArea:0} m2) exceeds boundary area ({area:0} m2).");

        var minX = boundary.Min(point => point.X);
        var maxX = boundary.Max(point => point.X);
        var minY = boundary.Min(point => point.Y);
        var maxY = boundary.Max(point => point.Y);
        var centroid = PolygonMath.Centroid(boundary);

        foreach (var program in placeable)
        {
            var targetArea = program.TargetAreaM2!.Value;
            var radius = Math.Sqrt(targetArea / Math.PI);
            Point2? best = null;
            var bestScore = double.PositiveInfinity;

            for (var index = 1; index <= candidateCount; index++)
            {
                var offset = Math.Abs(seed % 997) + 1;
                var candidate = index == 1
                    ? centroid
                    : new Point2(
                        minX + Halton(index + offset, 2) * (maxX - minX),
                        minY + Halton(index + offset, 3) * (maxY - minY));

                if (!PolygonMath.Contains(boundary, candidate)) continue;
                var clearance = PolygonMath.DistanceToBoundary(boundary, candidate);
                if (clearance + 1e-7 < radius) continue;
                if (result.Placements.Any(other => PolygonMath.Distance(candidate, other.Center) + 1e-7 < radius + other.Radius)) continue;

                var zoneScore = ZonePenalty(program.LocationZone, clearance, radius, Math.Sqrt(area));
                if (zoneScore >= bestScore) continue;
                best = candidate;
                bestScore = zoneScore;
            }

            if (best is null)
            {
                result.Warnings.Add($"Could not place {program.Name} without overlap and while fully inside the boundary.");
                continue;
            }

            result.Placements.Add(new BubblePlacement(
                program.Id,
                program.Name,
                best.Value,
                radius,
                targetArea,
                program.LocationZone));
        }

        return result;
    }

    private static double ZonePenalty(string zone, double clearance, double radius, double siteScale)
    {
        var normalizedClearance = Math.Max(0, clearance - radius) / Math.Max(1, siteScale);
        return zone.ToUpperInvariant() switch
        {
            "INNER_BUFFER" => -normalizedClearance,
            "PERIMETER_LOOP" => normalizedClearance,
            "ACTIVE_EDGE" => Math.Abs(normalizedClearance - 0.08),
            "GATEWAY_NODE" => normalizedClearance,
            _ => -normalizedClearance
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
