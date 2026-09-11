using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class GridPathfinder
{
    private static readonly (int Dx, int Dy)[] Directions =
    [
        (1, 0), (0, 1), (-1, 0), (0, -1),
        (1, 1), (-1, 1), (-1, -1), (1, -1)
    ];

    public static GridPathResult FindPath(MovementCostField field, Point2 start, Point2 end)
    {
        if (field.Cells.Count != field.ColumnCount * field.RowCount)
            throw new ArgumentException("Movement cost field dimensions do not match its cells.", nameof(field));

        var startIndex = NearestTraversableCell(field, start);
        var endIndex = NearestTraversableCell(field, end);
        if (startIndex is null || endIndex is null)
            return new(false, [], double.PositiveInfinity, 0, "No traversable cell is available near one or both endpoints.");

        var count = field.Cells.Count;
        var cost = Enumerable.Repeat(double.PositiveInfinity, count).ToArray();
        var previous = Enumerable.Repeat(-1, count).ToArray();
        var closed = new bool[count];
        var queue = new PriorityQueue<int, (double Score, int Tie)>();
        cost[startIndex.Value] = 0;
        queue.Enqueue(startIndex.Value, (Heuristic(field.Cells[startIndex.Value].Center, field.Cells[endIndex.Value].Center), startIndex.Value));
        var visited = 0;

        while (queue.TryDequeue(out var current, out _))
        {
            if (closed[current]) continue;
            closed[current] = true;
            visited++;
            if (current == endIndex.Value) break;
            var cell = field.Cells[current];

            foreach (var (dx, dy) in Directions)
            {
                var column = cell.Column + dx;
                var row = cell.Row + dy;
                if (column < 0 || row < 0 || column >= field.ColumnCount || row >= field.RowCount) continue;
                var next = field.Cell(column, row);
                if (!next.Traversable || closed[next.Index]) continue;
                if (dx != 0 && dy != 0 && !DiagonalMoveIsClear(field, cell.Column, cell.Row, dx, dy)) continue;

                var stepLength = field.CellSizeM * (dx == 0 || dy == 0 ? 1 : Math.Sqrt(2));
                var tentative = cost[current] + stepLength * (cell.BaseCost + next.BaseCost) / 2;
                if (tentative >= cost[next.Index] - 1e-9) continue;
                cost[next.Index] = tentative;
                previous[next.Index] = current;
                var score = tentative + Heuristic(next.Center, field.Cells[endIndex.Value].Center);
                queue.Enqueue(next.Index, (score, next.Index));
            }
        }

        if (!closed[endIndex.Value])
            return new(false, [], double.PositiveInfinity, visited, "The endpoints are disconnected by impassable cells.");

        var indexes = new List<int>();
        for (var index = endIndex.Value; index >= 0; index = previous[index])
        {
            indexes.Add(index);
            if (index == startIndex.Value) break;
        }
        indexes.Reverse();
        var points = indexes.Select(index => field.Cells[index].Center).ToList();
        if (points.Count == 0 || PolygonMath.Distance(points[0], start) > 1e-9) points.Insert(0, start);
        else points[0] = start;
        if (PolygonMath.Distance(points[^1], end) > 1e-9) points.Add(end);
        else points[^1] = end;

        return new(true, RemoveCollinear(points), cost[endIndex.Value], visited);
    }

    private static int? NearestTraversableCell(MovementCostField field, Point2 point)
    {
        var column = Math.Clamp((int)Math.Floor((point.X - field.OriginX) / field.CellSizeM), 0, field.ColumnCount - 1);
        var row = Math.Clamp((int)Math.Floor((point.Y - field.OriginY) / field.CellSizeM), 0, field.RowCount - 1);
        var maximumRadius = Math.Max(field.ColumnCount, field.RowCount);
        for (var radius = 0; radius <= maximumRadius; radius++)
        {
            var candidates = new List<MovementCostCell>();
            for (var y = Math.Max(0, row - radius); y <= Math.Min(field.RowCount - 1, row + radius); y++)
            for (var x = Math.Max(0, column - radius); x <= Math.Min(field.ColumnCount - 1, column + radius); x++)
            {
                if (Math.Max(Math.Abs(x - column), Math.Abs(y - row)) != radius) continue;
                var cell = field.Cell(x, y);
                if (cell.Traversable) candidates.Add(cell);
            }
            if (candidates.Count > 0)
                return candidates.OrderBy(cell => PolygonMath.Distance(cell.Center, point))
                    .ThenBy(cell => cell.Index).First().Index;
        }
        return null;
    }

    private static bool DiagonalMoveIsClear(MovementCostField field, int column, int row, int dx, int dy) =>
        field.Cell(column + dx, row).Traversable && field.Cell(column, row + dy).Traversable;

    private static double Heuristic(Point2 a, Point2 b) => PolygonMath.Distance(a, b);

    private static IReadOnlyList<Point2> RemoveCollinear(IReadOnlyList<Point2> points)
    {
        if (points.Count <= 2) return points;
        var result = new List<Point2> { points[0] };
        for (var index = 1; index < points.Count - 1; index++)
        {
            var a = result[^1];
            var b = points[index];
            var c = points[index + 1];
            var cross = (b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X);
            if (Math.Abs(cross) > 1e-9) result.Add(b);
        }
        result.Add(points[^1]);
        return result;
    }
}
