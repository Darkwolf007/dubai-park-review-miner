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
                    var penalty = SpatialScoring.RelationshipPenalty(program.Id, item.Point, anchors, relationships, siteScale, out var hardViolation);
                    return (item.Cell, item.Point, Suitability: item.Suitability!.Value, Penalty: penalty, HardViolation: hardViolation);
                })
                .Where(item => !item.HardViolation)
                .OrderByDescending(item => item.Suitability - item.Penalty + SpatialScoring.SeedNoise(seed, program.Id, item.Cell.Id) * 0.05)
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
}
