using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>
/// Fast O(n log n) guillotine treemap used as a proposal generator. Proposals
/// are still checked by the constrained packer against the real site polygon,
/// locked rectangles and per-program aspect limits.
/// </summary>
internal static class SpatialTreemapSeeder
{
    private sealed class Item
    {
        public required PackingProgram Program { get; init; }
        public required Point2 Anchor { get; init; }
        public required double Area { get; init; }
        public LocalRect Rectangle { get; set; }
    }

    private readonly record struct LocalRect(double X, double Y, double Width, double Height);

    public static IReadOnlyDictionary<string, RectanglePlacement> Seed(
        IReadOnlyList<Point2> boundary, IReadOnlyList<PackingProgram> programs, double reserve, int seed)
    {
        if (programs.Count == 0) return new Dictionary<string, RectanglePlacement>();
        var origin = PolygonMath.Centroid(boundary);
        var longest = Enumerable.Range(0, boundary.Count).Select(index =>
        {
            var a = boundary[index]; var b = boundary[(index + 1) % boundary.Count];
            return (A: a, B: b, Length: PolygonMath.Distance(a, b));
        }).OrderByDescending(item => item.Length).First();
        var length = Math.Max(1e-9, longest.Length);
        var xAxis = new Point2((longest.B.X - longest.A.X) / length, (longest.B.Y - longest.A.Y) / length);
        var yAxis = new Point2(-xAxis.Y, xAxis.X);
        Point2 ToLocal(Point2 point)
        {
            var dx = point.X - origin.X; var dy = point.Y - origin.Y;
            return new(dx * xAxis.X + dy * xAxis.Y, dx * yAxis.X + dy * yAxis.Y);
        }
        Point2 ToWorld(Point2 point) => new(origin.X + point.X * xAxis.X + point.Y * yAxis.X,
            origin.Y + point.X * xAxis.Y + point.Y * yAxis.Y);

        var localBoundary = boundary.Select(ToLocal).ToList();
        var minX = localBoundary.Min(point => point.X); var maxX = localBoundary.Max(point => point.X);
        var minY = localBoundary.Min(point => point.Y); var maxY = localBoundary.Max(point => point.Y);
        var boxWidth = maxX - minX; var boxHeight = maxY - minY;
        var totalArea = programs.Sum(program => program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve));
        if (boxWidth <= 1e-6 || boxHeight <= 1e-6 || totalArea <= 1e-6 || totalArea > boxWidth * boxHeight)
            return new Dictionary<string, RectanglePlacement>();

        var ratio = boxWidth / boxHeight;
        var width = Math.Sqrt(totalArea * ratio);
        var height = totalArea / width;
        if (width > boxWidth) { width = boxWidth; height = totalArea / width; }
        if (height > boxHeight) { height = boxHeight; width = totalArea / height; }
        var container = new LocalRect((minX + maxX - width) / 2, (minY + maxY - height) / 2, width, height);
        var items = programs.Select((program, index) =>
        {
            var fallback = new Point2(container.X + Halton(index + 1 + Math.Abs(seed % 97), 2) * container.Width,
                container.Y + Halton(index + 1 + Math.Abs(seed % 89), 3) * container.Height);
            return new Item
            {
                Program = program,
                Anchor = program.PreferredCenter is { } preferred ? ToLocal(preferred) : fallback,
                Area = program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve)
            };
        }).ToList();

        Solve(items, container, .75, new Random(seed));
        var angle = Math.Atan2(xAxis.Y, xAxis.X) * 180 / Math.PI;
        return items.ToDictionary(item => item.Program.Id, item =>
        {
            var rectangle = item.Rectangle;
            var center = ToWorld(new Point2(rectangle.X + rectangle.Width / 2, rectangle.Y + rectangle.Height / 2));
            return new RectanglePlacement(item.Program.Id, item.Program.Name, center, rectangle.Width, rectangle.Height,
                angle, item.Program.TargetUsableAreaM2, item.Area, PlacementBasis: "fast_treemap_seed",
                ApprovedTargetUsableAreaM2: item.Program.ApprovedTargetUsableAreaM2);
        }, StringComparer.Ordinal);
    }

    private static void Solve(List<Item> items, LocalRect rectangle, double minimumAspect, Random random)
    {
        if (items.Count == 1) { items[0].Rectangle = rectangle; return; }
        var spreadX = items.Max(item => item.Anchor.X) - items.Min(item => item.Anchor.X);
        var spreadY = items.Max(item => item.Anchor.Y) - items.Min(item => item.Anchor.Y);
        var minimumSpread = Math.Min(spreadX, spreadY);
        var directionRatio = minimumSpread < 1e-4 ? (Math.Max(spreadX, spreadY) > 0 ? double.MaxValue : 1) : Math.Max(spreadX, spreadY) / minimumSpread;
        var vertical = directionRatio > 1.35 ? spreadX > spreadY : random.NextDouble() < rectangle.Width / (rectangle.Width + rectangle.Height);
        var sorted = vertical
            ? items.OrderBy(item => item.Anchor.X).ThenBy(item => item.Anchor.Y).ToList()
            : items.OrderBy(item => item.Anchor.Y).ThenBy(item => item.Anchor.X).ToList();
        var total = sorted.Sum(item => item.Area); var half = total / 2; var cumulative = 0d; var best = double.MaxValue;
        for (var index = 1; index < sorted.Count; index++) { cumulative += sorted[index - 1].Area; best = Math.Min(best, Math.Abs(cumulative - half)); }
        cumulative = 0;
        var possible = new List<int>();
        for (var index = 1; index < sorted.Count; index++)
        {
            cumulative += sorted[index - 1].Area;
            if (Math.Abs(cumulative - half) <= best + total * .15) possible.Add(index);
        }
        var split = possible.Count > 0 ? possible[random.Next(possible.Count)] : Math.Max(1, sorted.Count / 2);
        var first = sorted.Take(split).ToList(); var second = sorted.Skip(split).ToList();
        var portion = Math.Clamp(first.Sum(item => item.Area) / total, .0001, .9999);
        var verticalQuality = Math.Min(Aspect(rectangle.Width * portion, rectangle.Height), Aspect(rectangle.Width * (1 - portion), rectangle.Height));
        var horizontalQuality = Math.Min(Aspect(rectangle.Width, rectangle.Height * portion), Aspect(rectangle.Width, rectangle.Height * (1 - portion)));
        if (vertical && verticalQuality < minimumAspect && horizontalQuality > verticalQuality) vertical = false;
        else if (!vertical && horizontalQuality < minimumAspect && verticalQuality > horizontalQuality) vertical = true;
        LocalRect a; LocalRect b;
        if (vertical)
        {
            var firstWidth = rectangle.Width * portion;
            a = new(rectangle.X, rectangle.Y, firstWidth, rectangle.Height);
            b = new(rectangle.X + firstWidth, rectangle.Y, rectangle.Width - firstWidth, rectangle.Height);
        }
        else
        {
            var firstHeight = rectangle.Height * portion;
            a = new(rectangle.X, rectangle.Y, rectangle.Width, firstHeight);
            b = new(rectangle.X, rectangle.Y + firstHeight, rectangle.Width, rectangle.Height - firstHeight);
        }
        Solve(first, a, minimumAspect, random); Solve(second, b, minimumAspect, random);
    }

    private static double Aspect(double width, double height) => Math.Min(width, height) / Math.Max(width, height);

    private static double Halton(int index, int numberBase)
    {
        var result = 0d; var fraction = 1d / numberBase;
        while (index > 0) { result += fraction * (index % numberBase); index /= numberBase; fraction /= numberBase; }
        return result;
    }
}
