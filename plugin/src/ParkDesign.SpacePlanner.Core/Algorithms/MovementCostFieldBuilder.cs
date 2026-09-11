using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class MovementCostFieldBuilder
{
    public static MovementCostField Build(
        IReadOnlyList<Point2> siteBoundary,
        IReadOnlyList<SpaceRegion> regions,
        CirculationCostSettings? settings = null)
    {
        settings ??= new();
        if (settings.CellSizeM <= 0) throw new ArgumentOutOfRangeException(nameof(settings), "Cell size must be positive.");
        var errors = SpaceRegionValidator.Validate(siteBoundary, regions);
        if (errors.Count > 0) throw new ArgumentException(string.Join(Environment.NewLine, errors));

        var minX = siteBoundary.Min(point => point.X);
        var minY = siteBoundary.Min(point => point.Y);
        var maxX = siteBoundary.Max(point => point.X);
        var maxY = siteBoundary.Max(point => point.Y);
        var columns = Math.Max(1, (int)Math.Ceiling((maxX - minX) / settings.CellSizeM));
        var rows = Math.Max(1, (int)Math.Ceiling((maxY - minY) / settings.CellSizeM));
        var rings = regions.Select(region => (Region: region, Ring: (IReadOnlyList<Point2>)SpaceRegionValidator.NormalizeRing(region.Ring))).ToList();
        var cells = new List<MovementCostCell>(columns * rows);

        for (var row = 0; row < rows; row++)
        for (var column = 0; column < columns; column++)
        {
            var center = new Point2(
                minX + (column + 0.5) * settings.CellSizeM,
                minY + (row + 0.5) * settings.CellSizeM);
            var insideSite = PolygonMath.Contains(siteBoundary, center)
                || PolygonMath.DistanceToBoundary(siteBoundary, center) <= 1e-9;
            var containing = rings.Where(item => PolygonMath.Contains(item.Ring, center))
                .OrderByDescending(item => RestrictionRank(item.Region.Behavior))
                .ThenByDescending(item => item.Region.Priority)
                .ThenBy(item => item.Region.ProgramId, StringComparer.Ordinal)
                .Select(item => item.Region)
                .FirstOrDefault();

            var traversable = insideSite && containing?.Behavior is not SpaceCirculationBehavior.HardBarrier
                and not SpaceCirculationBehavior.DestinationOnly;
            var cost = settings.DistanceWeight;
            if (containing?.Behavior == SpaceCirculationBehavior.PermeableLandscape)
                cost += settings.PermeabilityWeight;
            else if (containing?.Behavior == SpaceCirculationBehavior.PreferredCorridor)
                cost -= settings.PreferredCorridorBenefit;
            cost = Math.Max(0.05, cost);

            cells.Add(new(
                row * columns + column,
                column,
                row,
                center,
                traversable,
                cost,
                containing?.ProgramId,
                containing?.Behavior));
        }

        return new MovementCostField
        {
            OriginX = minX,
            OriginY = minY,
            CellSizeM = settings.CellSizeM,
            ColumnCount = columns,
            RowCount = rows,
            Cells = cells
        };
    }

    private static int RestrictionRank(SpaceCirculationBehavior behavior) => behavior switch
    {
        SpaceCirculationBehavior.HardBarrier => 4,
        SpaceCirculationBehavior.DestinationOnly => 3,
        SpaceCirculationBehavior.PermeableLandscape => 2,
        SpaceCirculationBehavior.PreferredCorridor => 1,
        _ => 0
    };
}
