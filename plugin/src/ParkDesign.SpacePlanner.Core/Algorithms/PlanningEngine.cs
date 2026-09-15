using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Validation;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class PlanningEngine
{
    public static PlanningResult Generate(
        IReadOnlyList<Point2> boundary,
        DesignPackage package,
        int seed,
        string strategyName = "AUTO",
        bool includeOptionalNodesAndRoutes = false,
        GeneratedStrategy? generatedStrategy = null)
    {
        if (generatedStrategy is not null)
        {
            StrategyGenerator.ValidateStrategy(generatedStrategy, package);
            ValidateGeneratedNumericProvenance(package);
        }
        var strategies = generatedStrategy is null ? ParseStrategies(strategyName) : [LayoutStrategy.Balanced];
        var scenarios = new List<LayoutScenarioResult>();
        var boundaryArea = Math.Abs(PolygonMath.SignedArea(boundary));
        var allocation = ProgramAreaAllocator.AllocateAll(package.Programs, boundaryArea);
        var compilation = SpatialRelationshipCompiler.Compile(package);
        var unresolvedAreaPrograms = package.Programs.Where(program => program.TargetAreaM2 is null or <= 0).ToList();
        foreach (var strategy in strategies)
        {
            var actualSeed = generatedStrategy?.Seed ?? seed;
            var areas = BubbleDistributor.Distribute(boundary, allocation.Programs, actualSeed, grid: package.Grid, relationships: package.Relationships, strategy: strategy,
                generatedStrategy: generatedStrategy, accessCandidates: package.AccessCandidates, movementDemands: package.MovementDemands);
            var warnings = new List<string>(allocation.Warnings);
            warnings.AddRange(areas.Warnings);
            warnings.AddRange(compilation.Warnings);
            var solved = AreaRelaxationSolver.Solve(boundary, allocation.Programs, areas.Placements, package.Grid, compilation.Graph, strategy);
            areas.Placements.Clear();
            areas.Placements.AddRange(solved.Agents.Select(agent => new BubblePlacement(agent.ProgramId, agent.ProgramName,
                agent.Position, agent.Radius, agent.EffectiveAreaM2, allocation.Programs.First(p => p.Id == agent.ProgramId).LocationZone,
                solved.Diagnostics.Programs.First(p => p.ProgramId == agent.ProgramId).Suitability,
                solved.Diagnostics.Programs.First(p => p.ProgramId == agent.ProgramId).RelationshipPenalty,
                allocation.Programs.First(p => p.Id == agent.ProgramId).SpatialMode)));
            areas.AverageSuitability = solved.Diagnostics.AverageSuitability;
            areas.RelationshipPenalty = 1 - solved.Diagnostics.RelationshipSatisfactionRatio;
            if (!solved.Diagnostics.Valid)
            {
                var failedIds = solved.Diagnostics.Edges.Where(edge => !edge.Satisfied).Select(edge => edge.EdgeId).Take(8);
                warnings.Add($"Area solver result is invalid: {solved.Diagnostics.HardViolationCount} hard violation(s): {string.Join(", ", failedIds)}.");
            }
            var allPointPrograms = unresolvedAreaPrograms.Concat(package.NodePrograms).ToList();
            var placedPoints = NodePlacer.Place(boundary, package.Grid, allPointPrograms, areas.Placements, package.Relationships, includeOptional: true, seed: actualSeed, warnings: warnings);
            var unresolvedIds = unresolvedAreaPrograms.Select(program => program.Id).ToHashSet(StringComparer.Ordinal);
            var areaAnchors = placedPoints.Where(point => unresolvedIds.Contains(point.ProgramId)).ToList();
            var nodes = placedPoints.Where(point => !unresolvedIds.Contains(point.ProgramId)).ToList();
            var sharedTerritories = TerritoryConsolidator.ConsolidateShared(package.Programs, areas.Placements, package.Relationships);
            var landscapeOverlays = TerritoryConsolidator.BuildLandscapeOverlays(package.Programs, areaAnchors, package.AreaReconciliation);
            var (routes, relationshipLines) = RouteGenerator.Generate(boundary, package.RoutePrograms, areas.Placements, areaAnchors, nodes,
                package.Relationships, includeOptional: true, warnings, package.MovementDemands);
            var morphologyAxes = DuneMorphologyGenerator.GenerateAxes(boundary, package.ClimateMorphology);
            var barahaCandidates = DuneMorphologyGenerator.GenerateBaraha(routes, areas.Placements, package.ClimateMorphology.BarahaRules);
            var pointById = areas.Placements.Select(p => (p.ProgramId, p.Center))
                .Concat(areaAnchors.Select(p => (p.ProgramId, p.Point))).Concat(nodes.Select(p => (p.ProgramId, p.Point)))
                .GroupBy(p => p.ProgramId, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.First().Item2, StringComparer.Ordinal);
            foreach (var edge in compilation.Graph.Edges.Where(e => e.Authority == RelationshipAuthority.Advisory))
                if (pointById.TryGetValue(edge.SourceId, out var source) && pointById.TryGetValue(edge.TargetId, out var target))
                    relationshipLines.Add(new(edge.Id, edge.SourceId, edge.TargetId, source, target, edge.RelationshipType, false, "advisory"));
            var resolvedAreaCount = allocation.Programs.Count;
            var placementRatio = resolvedAreaCount == 0 ? 0 : (double)areas.Placements.Count / resolvedAreaCount;
            var relationshipSatisfaction = Math.Clamp(1 - areas.RelationshipPenalty, 0, 1);
            var score = placementRatio * 60 + areas.AverageSuitability * 25 + relationshipSatisfaction * 15;
            if (generatedStrategy is not null)
            {
                var objective = generatedStrategy.ObjectiveWeights;
                var totalWeight = objective.AreaCompliance + objective.SiteSuitability + objective.RelationshipSatisfaction;
                score = totalWeight <= 0 ? 0 : 100 * (placementRatio * objective.AreaCompliance
                    + areas.AverageSuitability * objective.SiteSuitability
                    + relationshipSatisfaction * objective.RelationshipSatisfaction) / totalWeight;
            }
            scenarios.Add(new LayoutScenarioResult
            {
                Strategy = generatedStrategy?.StrategyId ?? strategy.ToString(), GeneratedStrategy = generatedStrategy, Seed = actualSeed,
                AreaSizingMode = allocation.Mode, Areas = areas, AreaAnchors = areaAnchors, Nodes = nodes, Routes = routes,
                SharedTerritories = sharedTerritories, LandscapeOverlays = landscapeOverlays,
                RelationshipLines = relationshipLines, MorphologyAxes = morphologyAxes, BarahaCandidates = barahaCandidates,
                Warnings = warnings, Score = score, SolverDiagnostics = solved.Diagnostics
            });
        }
        var best = scenarios
            .OrderByDescending(scenario => scenario.Score)
            .ThenBy(scenario => scenario.Strategy, StringComparer.Ordinal)
            .First();
        return new PlanningResult { Scenarios = scenarios, Best = best };
    }

    public static PlanningResult GenerateCandidates(IReadOnlyList<Point2> boundary, DesignPackage package,
        int seed, StrategyGenerationSettings? settings = null, StrategyObjectiveWeights? weights = null)
    {
        settings ??= new();
        var errors = DesignPackageValidator.Validate(package).Where(m => m.IsError).ToList();
        if (errors.Count > 0) throw new ArgumentException(string.Join("; ", errors.Select(e => e.Message)), nameof(package));
        ValidateGeneratedNumericProvenance(package);
        if (settings.PlacementsPerStrategy < 1 || settings.PlacementsPerStrategy > 10 ||
            !double.IsFinite(settings.MinimumCentreDisplacement) || settings.MinimumCentreDisplacement < 0 || settings.MinimumCentreDisplacement > 1)
            throw new ArgumentOutOfRangeException(nameof(settings));
        var generated = StrategyGenerator.GenerateStrategyCandidates(package, boundary, seed, settings, weights);
        var all = new List<LayoutScenarioResult>();
        foreach (var strategy in generated)
            for (var i = 0; i < settings.PlacementsPerStrategy; i++)
            {
                var placementStrategy = strategy with { Seed = unchecked(strategy.Seed + i * 1009) };
                var candidate = Generate(boundary, package, placementStrategy.Seed, generatedStrategy: placementStrategy).Best;
                if (candidate.SolverDiagnostics?.Valid != true || candidate.Areas.Placements.Count == 0) continue;
                if (all.Any(existing => IsDuplicate(existing, candidate, boundary, settings.MinimumCentreDisplacement))) continue;
                all.Add(candidate);
            }
        if (all.Count == 0) throw new InvalidOperationException("No valid, distinct scenario satisfies the package constraints.");
        var ranked = all.OrderByDescending(s => s.Score).ThenBy(s => s.Strategy, StringComparer.Ordinal).ToList();
        return new PlanningResult { Scenarios = ranked, Best = ranked[0] };
    }

    private static void ValidateGeneratedNumericProvenance(DesignPackage package)
    {
        var unsupportedNumeric = package.Relationships.Where(r => r.Accepted && r.NumericValue.HasValue &&
            (r.Authority.Equals("accepted_rule", StringComparison.OrdinalIgnoreCase)
                ? string.IsNullOrWhiteSpace(r.SourceProvenance)
                : !r.Authority.Contains("designer_approved", StringComparison.OrdinalIgnoreCase)))
            .Select(r => r.Id).ToList();
        if (unsupportedNumeric.Count > 0)
            throw new ArgumentException($"Numeric relationship provenance or designer approval is missing: {string.Join(", ", unsupportedNumeric)}.", nameof(package));
    }

    private static bool IsDuplicate(LayoutScenarioResult a, LayoutScenarioResult b, IReadOnlyList<Point2> boundary, double threshold)
    {
        var scale = Math.Sqrt(Math.Abs(PolygonMath.SignedArea(boundary)));
        var left = a.Areas.Placements.ToDictionary(p => p.ProgramId, p => p.Center, StringComparer.Ordinal);
        var right = b.Areas.Placements.ToDictionary(p => p.ProgramId, p => p.Center, StringComparer.Ordinal);
        var shared = left.Keys.Intersect(right.Keys, StringComparer.Ordinal).ToList();
        if (shared.Count == 0 || left.Count != right.Count) return false;
        var displacement = shared.Average(id => PolygonMath.Distance(left[id], right[id])) / Math.Max(1, scale);
        return displacement < threshold;
    }

    private static IReadOnlyList<LayoutStrategy> ParseStrategies(string strategyName)
    {
        if (string.Equals(strategyName, "AUTO", StringComparison.OrdinalIgnoreCase))
            return [LayoutStrategy.Balanced, LayoutStrategy.Suitability, LayoutStrategy.Connectivity];
        return Enum.TryParse<LayoutStrategy>(strategyName, true, out var parsed)
            ? [parsed]
            : [LayoutStrategy.Balanced];
    }
}
