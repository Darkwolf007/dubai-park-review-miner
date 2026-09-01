using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class NodePlacer
{
    public static List<NodePlacement> Place(
        IReadOnlyList<Point2> boundary,
        GridDefinition grid,
        IEnumerable<ProgramDefinition> programs,
        IEnumerable<BubblePlacement> areas,
        IEnumerable<RelationshipDefinition> relationships,
        bool includeOptional,
        int seed,
        List<string> warnings)
    {
        var result = new List<NodePlacement>();
        var selected = programs
            .Where(program => program.Selected || includeOptional)
            .OrderByDescending(program => program.Priority)
            .ThenBy(program => program.Id, StringComparer.Ordinal)
            .ToList();
        if (selected.Count == 0) return result;
        if (grid.Cells.Count == 0)
        {
            warnings.Add("Node placement skipped because the package contains no suitability grid.");
            return result;
        }

        var occupiedCells = new HashSet<string>(StringComparer.Ordinal);
        var anchors = areas.ToDictionary(item => item.ProgramId, item => item.Center);
        var siteScale = Math.Sqrt(Math.Abs(PolygonMath.SignedArea(boundary)));
        foreach (var program in selected)
        {
            var candidates = grid.Cells
                .Select(cell => (Cell: cell, Point: new Point2(cell.X, cell.Y), Suitability: SpatialScoring.CellSuitability(cell, program)))
                .Where(item => item.Suitability is not null && !occupiedCells.Contains(item.Cell.Id) && PolygonMath.Contains(boundary, item.Point))
                .Select(item =>
                {
                    var penalty = SpatialScoring.RelationshipPenalty(program.Id, item.Point, anchors, relationships, siteScale,
                        out var hardViolation, includeAdvisory: true);
                    var nearestNodeDistance = result.Count == 0
                        ? siteScale * 0.35
                        : result.Min(node => PolygonMath.Distance(node.Point, item.Point));
                    var distribution = Math.Clamp(nearestNodeDistance / Math.Max(1, siteScale * 0.55), 0, 1);
                    var spatialRole = SpatialRoleScore(program.Id, boundary, item.Point, siteScale);
                    var score = 0.45 * item.Suitability!.Value
                        - 0.35 * penalty
                        + 0.45 * distribution
                        + 0.15 * spatialRole
                        + SpatialScoring.SeedNoise(seed, program.Id, item.Cell.Id) * 0.03;
                    return (item.Cell, item.Point, Suitability: item.Suitability.Value, Score: score, HardViolation: hardViolation);
                })
                .Where(item => !item.HardViolation)
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.Cell.Id, StringComparer.Ordinal)
                .ToList();

            if (candidates.Count == 0)
            {
                warnings.Add($"Could not place node {program.Name} on an eligible grid cell.");
                continue;
            }
            var best = candidates[0];
            occupiedCells.Add(best.Cell.Id);
            result.Add(new NodePlacement(program.Id, program.Name, best.Point, best.Suitability));
            anchors[program.Id] = best.Point;
        }
        return result;
    }

    private static double SpatialRoleScore(string programId, IReadOnlyList<Point2> boundary, Point2 point, double siteScale)
    {
        var edgeProximity = 1 - Math.Clamp(PolygonMath.DistanceToBoundary(boundary, point) / Math.Max(1, siteScale * 0.3), 0, 1);
        return programId switch
        {
            "secondaryEntrances" or "bicycleParking" => edgeProximity,
            "safetyPoint" or "smartMonitoring" or "wayfindingNodes" => 0.35 + 0.65 * edgeProximity,
            _ => 0.5
        };
    }
}
