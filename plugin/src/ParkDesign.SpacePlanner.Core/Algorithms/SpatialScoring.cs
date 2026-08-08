using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public enum LayoutStrategy
{
    Balanced,
    Suitability,
    Connectivity
}

internal readonly record struct StrategyWeights(double Zone, double Suitability, double Relationships);

internal static class SpatialScoring
{
    public static StrategyWeights Weights(LayoutStrategy strategy) => strategy switch
    {
        LayoutStrategy.Suitability => new(0.5, 2.0, 0.5),
        LayoutStrategy.Connectivity => new(0.5, 0.5, 2.0),
        _ => new(1.0, 1.0, 1.0)
    };

    public static double? CellSuitability(GridCell cell, ProgramDefinition program)
    {
        if (cell.Constraint || cell.ProgramConstraints.ContainsKey(program.Id)) return null;
        var keys = new[]
        {
            $"{program.Id}_suitability",
            $"{program.Id}_opportunity",
            program.SuitabilityField
        }.Where(key => !string.IsNullOrWhiteSpace(key));
        foreach (var key in keys)
        {
            if (cell.Scores.TryGetValue(key!, out var value) && value is not null)
                return Math.Clamp(value.Value, 0, 1);
        }
        return 0;
    }

    public static double SeedNoise(int seed, string programId, string candidateId)
    {
        unchecked
        {
            uint hash = 2166136261;
            foreach (var character in $"{seed}|{programId}|{candidateId}")
            {
                hash ^= character;
                hash *= 16777619;
            }
            return (hash % 10000) / 9999d;
        }
    }

    public static double RelationshipPenalty(
        string programId,
        Point2 candidate,
        IReadOnlyDictionary<string, Point2> placed,
        IEnumerable<RelationshipDefinition> relationships,
        double siteScale,
        out bool violatesMandatory)
    {
        violatesMandatory = false;
        var total = 0d;
        var count = 0;
        foreach (var relationship in relationships.Where(item => item.Accepted && (item.Source == programId || item.Target == programId)))
        {
            var otherId = relationship.Source == programId ? relationship.Target : relationship.Source;
            if (!placed.TryGetValue(otherId, out var other)) continue;
            var distance = PolygonMath.Distance(candidate, other);
            var evaluation = Evaluate(relationship, distance, siteScale);
            if (relationship.Mandatory && evaluation.HardViolation) violatesMandatory = true;
            total += evaluation.Penalty;
            count++;
        }
        return count == 0 ? 0 : total / count;
    }

    private static (double Penalty, bool HardViolation) Evaluate(RelationshipDefinition relationship, double distance, double siteScale)
    {
        var text = $"{relationship.GraphLayer} {relationship.Type} {relationship.NumericParameter}".ToLowerInvariant();
        var numericMetres = IsMetres(relationship.NumericUnit) ? relationship.NumericValue : null;
        var isMinimum = text.Contains("minimum") || text.Contains("min ") || text.Contains("separation") || text.Contains("buffer") || text.Contains("at least");
        var isMaximum = text.Contains("maximum") || text.Contains("max ") || text.Contains("within") || text.Contains("proximity") || text.Contains("near") || text.Contains("adjacent") || text.Contains("no more");

        if (numericMetres is > 0 && isMinimum)
        {
            var violation = distance + 1e-7 < numericMetres.Value;
            return (Math.Max(0, numericMetres.Value - distance) / Math.Max(1, numericMetres.Value), violation);
        }
        if (numericMetres is > 0 && isMaximum)
        {
            var violation = distance - 1e-7 > numericMetres.Value;
            return (Math.Max(0, distance - numericMetres.Value) / Math.Max(1, numericMetres.Value), violation);
        }

        if (text.Contains("visibility") || text.Contains("sightline") || text.Contains("overlook"))
            return (0, false); // Exported as a relationship line; obstruction testing needs 3D context.
        if (text.Contains("avoid") || text.Contains("separat") || text.Contains("buffer") || text.Contains("repel"))
            return (1 - Math.Min(1, distance / Math.Max(1, siteScale)), false);
        return (Math.Min(1, distance / Math.Max(1, siteScale)), false);
    }

    private static bool IsMetres(string? unit)
    {
        if (string.IsNullOrWhiteSpace(unit)) return false;
        var normalized = unit.Trim().ToLowerInvariant();
        return normalized is "m" or "meter" or "meters" or "metre" or "metres";
    }
}
