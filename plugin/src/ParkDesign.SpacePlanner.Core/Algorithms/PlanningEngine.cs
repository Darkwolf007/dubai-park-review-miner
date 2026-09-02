using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Geometry;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class PlanningEngine
{
    public static PlanningResult Generate(
        IReadOnlyList<Point2> boundary,
        DesignPackage package,
        int seed,
        string strategyName = "AUTO",
        bool includeOptionalNodesAndRoutes = false)
    {
        var strategies = ParseStrategies(strategyName);
        var scenarios = new List<LayoutScenarioResult>();
        var boundaryArea = Math.Abs(PolygonMath.SignedArea(boundary));
        var allocation = ProgramAreaAllocator.AllocateAll(package.Programs, boundaryArea);
        var compilation = SpatialRelationshipCompiler.Compile(package);
        var unresolvedAreaPrograms = package.Programs.Where(program => program.TargetAreaM2 is null or <= 0).ToList();
        foreach (var strategy in strategies)
        {
            var areas = BubbleDistributor.Distribute(boundary, allocation.Programs, seed, grid: package.Grid, relationships: package.Relationships, strategy: strategy);
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
            var placedPoints = NodePlacer.Place(boundary, package.Grid, allPointPrograms, areas.Placements, package.Relationships, includeOptional: true, seed: seed, warnings: warnings);
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
            scenarios.Add(new LayoutScenarioResult
            {
                Strategy = strategy.ToString(), AreaSizingMode = allocation.Mode, Areas = areas, AreaAnchors = areaAnchors, Nodes = nodes, Routes = routes,
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

    private static IReadOnlyList<LayoutStrategy> ParseStrategies(string strategyName)
    {
        if (string.Equals(strategyName, "AUTO", StringComparison.OrdinalIgnoreCase))
            return [LayoutStrategy.Balanced, LayoutStrategy.Suitability, LayoutStrategy.Connectivity];
        return Enum.TryParse<LayoutStrategy>(strategyName, true, out var parsed)
            ? [parsed]
            : [LayoutStrategy.Balanced];
    }
}
