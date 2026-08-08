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
        var unresolvedAreaPrograms = package.Programs.Where(program => program.TargetAreaM2 is null or <= 0).ToList();
        foreach (var strategy in strategies)
        {
            var areas = BubbleDistributor.Distribute(boundary, allocation.Programs, seed, grid: package.Grid, relationships: package.Relationships, strategy: strategy);
            var warnings = new List<string>(allocation.Warnings);
            warnings.AddRange(areas.Warnings);
            var allPointPrograms = unresolvedAreaPrograms.Concat(package.NodePrograms).ToList();
            var placedPoints = NodePlacer.Place(boundary, package.Grid, allPointPrograms, areas.Placements, package.Relationships, includeOptional: true, seed: seed, warnings: warnings);
            var unresolvedIds = unresolvedAreaPrograms.Select(program => program.Id).ToHashSet(StringComparer.Ordinal);
            var areaAnchors = placedPoints.Where(point => unresolvedIds.Contains(point.ProgramId)).ToList();
            var nodes = placedPoints.Where(point => !unresolvedIds.Contains(point.ProgramId)).ToList();
            var (routes, relationshipLines) = RouteGenerator.Generate(boundary, package.RoutePrograms, areas.Placements, areaAnchors, nodes, package.Relationships, includeOptional: true, warnings);
            var resolvedAreaCount = allocation.Programs.Count;
            var placementRatio = resolvedAreaCount == 0 ? 0 : (double)areas.Placements.Count / resolvedAreaCount;
            var relationshipSatisfaction = Math.Clamp(1 - areas.RelationshipPenalty, 0, 1);
            var score = placementRatio * 60 + areas.AverageSuitability * 25 + relationshipSatisfaction * 15;
            scenarios.Add(new LayoutScenarioResult
            {
                Strategy = strategy.ToString(), AreaSizingMode = allocation.Mode, Areas = areas, AreaAnchors = areaAnchors, Nodes = nodes, Routes = routes,
                RelationshipLines = relationshipLines, Warnings = warnings, Score = score
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
