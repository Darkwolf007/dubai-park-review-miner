using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>Reproducible, package-derived strategy parameters; no named topology catalogue.</summary>
public static class StrategyGenerator
{
    public static IReadOnlyList<GeneratedStrategy> GenerateStrategyCandidates(DesignPackage package,
        IReadOnlyList<Point2> boundary, int seed, StrategyGenerationSettings? settings = null,
        StrategyObjectiveWeights? weights = null)
    {
        settings ??= new();
        weights ??= new();
        if (settings.CandidateCount < 1 || settings.CandidateCount > 50)
            throw new ArgumentOutOfRangeException(nameof(settings), "Candidate count must be between 1 and 50.");
        if (boundary.Count < 3 || Math.Abs(PolygonMath.SignedArea(boundary)) <= 0)
            throw new ArgumentException("A non-empty site boundary is required.", nameof(boundary));
        var programs = package.Programs.Where(p => p.Selected && p.TargetAreaM2 is > 0)
            .OrderBy(p => p.Id, StringComparer.Ordinal).ToList();
        if (programs.Count == 0) throw new ArgumentException("No selected quantified area programs.", nameof(package));
        var movement = package.MovementDemands.GroupBy(d => d.Destination, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Sum(d => Math.Max(0, d.Weight)), StringComparer.Ordinal);
        var relationships = package.Relationships.Where(r => r.Accepted)
            .SelectMany(r => new[] { r.Source, r.Target }).GroupBy(id => id, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        var maxArea = programs.Max(p => p.TargetAreaM2 ?? 0);
        var ranked = programs.OrderByDescending(p =>
                .35 * Math.Clamp(p.Priority, 0, 1) +
                .25 * (p.TargetAreaM2 ?? 0) / maxArea +
                .2 * movement.GetValueOrDefault(p.Id) / Math.Max(1, movement.Values.DefaultIfEmpty(0).Max()) +
                .2 * relationships.GetValueOrDefault(p.Id) / Math.Max(1, relationships.Values.DefaultIfEmpty(0).Max()))
            .ThenBy(p => p.Id, StringComparer.Ordinal).ToList();
        var minX = boundary.Min(p => p.X); var maxX = boundary.Max(p => p.X);
        var minY = boundary.Min(p => p.Y); var maxY = boundary.Max(p => p.Y);
        var longX = maxX - minX >= maxY - minY;
        var candidates = new List<GeneratedStrategy>();
        for (var i = 0; i < settings.CandidateCount; i++)
        {
            var random = new Random(unchecked(seed * 7919 + i * 104729));
            var anchorCount = Math.Min(programs.Count, 1 + i % Math.Min(3, programs.Count));
            var anchors = ranked.Skip(i % ranked.Count).Concat(ranked.Take(i % ranked.Count))
                .Take(anchorCount).Select(p => p.Id).ToArray();
            double Bounded() => .1 + .8 * random.NextDouble();
            var angle = (random.NextDouble() - .5) * Math.PI / 2;
            var x = longX ? Math.Cos(angle) : Math.Sin(angle);
            var y = longX ? Math.Sin(angle) : Math.Cos(angle);
            var cluster = Bounded();
            var genome = new StrategyGenome(anchors, Bounded(), Bounded(), cluster, 1 - cluster,
                Bounded(), Bounded(), Bounded(), Bounded(), x, y, Bounded(), Bounded());
            var forces = new List<string> { $"{programs.Count} selected quantified programs", "site boundary aspect" };
            if (movement.Count > 0) forces.Add("origin-destination demand");
            if (package.Grid.Cells.Count > 0) forces.Add("package suitability grid");
            if (relationships.Count > 0) forces.Add("accepted relationships");
            var unresolved = package.Unresolved.ToArray();
            var strategy = new GeneratedStrategy($"strategy-{i + 1:D3}", unchecked(seed + i * 101), genome,
                weights, new StrategyRationale(forces, unresolved));
            ValidateStrategy(strategy, package);
            candidates.Add(strategy);
        }
        return candidates;
    }

    public static void ValidateStrategy(GeneratedStrategy strategy, DesignPackage package)
    {
        var ids = package.Programs.Where(p => p.Selected && p.TargetAreaM2 is > 0)
            .Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
        if (strategy.Organisation.AnchorProgramIds.Count == 0 ||
            strategy.Organisation.AnchorProgramIds.Any(id => !ids.Contains(id)))
            throw new ArgumentException("Strategy anchors must be selected quantified package programs.");
        var g = strategy.Organisation;
        var values = new[] { g.CentralityBias, g.EdgeAffinity, g.ClusteringStrength, g.DispersionStrength,
            g.RouteInfluence, g.EntranceInfluence, g.EnvironmentalInfluence, g.RelationshipInfluence,
            g.LoopPreference, g.BranchingPreference };
        if (values.Any(v => !double.IsFinite(v) || v < 0 || v > 1) ||
            !double.IsFinite(g.OrientationX) || !double.IsFinite(g.OrientationY) ||
            Math.Abs(Math.Sqrt(g.OrientationX * g.OrientationX + g.OrientationY * g.OrientationY) - 1) > 1e-6)
            throw new ArgumentException("Strategy parameters must be finite, bounded, and have a unit orientation vector.");
        var w = strategy.ObjectiveWeights;
        if (new[] { w.AreaCompliance, w.RelationshipSatisfaction, w.MovementEfficiency,
            w.SiteSuitability, w.ThermalComfort, w.Accessibility, w.Biodiversity, w.Cost }
            .Any(v => !double.IsFinite(v) || v < 0 || v > 1))
            throw new ArgumentException("Objective weights must be finite and between zero and one.");
    }

    public static GeneratedStrategy MutateStrategy(GeneratedStrategy source, DesignPackage package, int seed)
    {
        var random = new Random(seed);
        var g = source.Organisation;
        var mutated = source with { StrategyId = source.StrategyId + "-revision", Seed = seed,
            Organisation = g with { CentralityBias = Math.Clamp(g.CentralityBias + (random.NextDouble() - .5) * .4, 0, 1),
                ClusteringStrength = Math.Clamp(g.ClusteringStrength + (random.NextDouble() - .5) * .4, 0, 1),
                RouteInfluence = Math.Clamp(g.RouteInfluence + (random.NextDouble() - .5) * .4, 0, 1) } };
        ValidateStrategy(mutated, package);
        return mutated;
    }

    public static GeneratedStrategy CombineStrategies(GeneratedStrategy a, GeneratedStrategy b, DesignPackage package, int seed)
    {
        var x = a.Organisation; var y = b.Organisation;
        var combined = a with { StrategyId = $"{a.StrategyId}-{b.StrategyId}", Seed = seed,
            Organisation = x with { AnchorProgramIds = x.AnchorProgramIds.Concat(y.AnchorProgramIds).Distinct(StringComparer.Ordinal).Take(3).ToArray(),
                CentralityBias = (x.CentralityBias + y.CentralityBias) / 2,
                EdgeAffinity = (x.EdgeAffinity + y.EdgeAffinity) / 2,
                ClusteringStrength = (x.ClusteringStrength + y.ClusteringStrength) / 2,
                RouteInfluence = (x.RouteInfluence + y.RouteInfluence) / 2,
                EnvironmentalInfluence = (x.EnvironmentalInfluence + y.EnvironmentalInfluence) / 2 } };
        ValidateStrategy(combined, package);
        return combined;
    }

    public static StrategyRationale ExplainStrategy(GeneratedStrategy strategy) => strategy.Rationale;
}
