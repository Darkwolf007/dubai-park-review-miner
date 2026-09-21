namespace ParkDesign.SpacePlanner.Core.Models;

public sealed record LineSegment2(string Id, Point2 A, Point2 B, IReadOnlyList<string>? Roles = null);

public sealed record PolygonZone(string Id, IReadOnlyList<Point2> Ring, double Priority = 0.5);

public sealed record RectanglePlacement(
    string ProgramId,
    string ProgramName,
    Point2 Center,
    double WidthM,
    double HeightM,
    double RotationDegrees,
    double TargetUsableAreaM2,
    double GrossAreaM2,
    double InternalPathAreaM2 = 0,
    string PlacementBasis = "packed",
    string? CandidateZoneId = null,
    double? ApprovedTargetUsableAreaM2 = null)
{
    public double NetUsableAreaM2 => Math.Max(0, GrossAreaM2 - InternalPathAreaM2);
    public IReadOnlyList<Point2> Corners => RectangleGeometry.Corners(Center, WidthM, HeightM, RotationDegrees);
}

public sealed record PackingProgram(
    string Id,
    string Name,
    double TargetUsableAreaM2,
    double Priority,
    double AspectRatioMin = 0.75,
    double AspectRatioMax = 1.3333333333,
    bool Required = true,
    PlacementRulesDefinition? PlacementRules = null,
    double? ApprovedTargetUsableAreaM2 = null,
    Point2? PreferredCenter = null);

public sealed class ConstrainedPackingInput
{
    public IReadOnlyList<Point2> Boundary { get; init; } = [];
    public IReadOnlyList<PackingProgram> Programs { get; init; } = [];
    public IReadOnlyList<LineSegment2> PublicEntranceEdges { get; init; } = [];
    public IReadOnlyList<PolygonZone> OperationsCandidateZones { get; init; } = [];
    public IReadOnlyList<Point2> ParkingBay { get; init; } = [];
}

public sealed record ConstrainedPackingOptions(
    int MasterSeed = 1,
    int AlternativeCount = 5,
    bool AllowClippedShapes = false,
    double SecondaryEntrancePlazaAreaM2 = 150,
    double MinimumArrivalSharedEdgeM = 8,
    double NetAreaToleranceRatio = 0.02,
    double WalkingWidthM = 1.5,
    double CyclingWidthM = 2.5,
    double ServiceWidthM = 3,
    double GrossAreaReserveRatio = 0.08,
    int CandidateSamples = 1400,
    int FeasibleCandidateLimit = 40);

public sealed class PackedLayoutAlternative
{
    public int AlternativeIndex { get; init; }
    public int Seed { get; init; }
    public List<RectanglePlacement> Rectangles { get; init; } = [];
    public Point2 MainEntrance { get; init; }
    public Point2 SecondaryEntrance { get; init; }
    public Point2 ServiceEntrance { get; init; }
    public string MainEntranceEdgeId { get; init; } = string.Empty;
    public string SecondaryEntranceEdgeId { get; init; } = string.Empty;
    public string? OperationsCandidateZoneId { get; init; }
    public double Score { get; set; }
    public bool Valid { get; set; }
    public List<string> Diagnostics { get; init; } = [];
}

public sealed class ConstrainedPackingResult
{
    public List<PackedLayoutAlternative> Alternatives { get; init; } = [];
    public PackedLayoutAlternative? Best => Alternatives.OrderByDescending(item => item.Valid).ThenByDescending(item => item.Score).FirstOrDefault();
}

public sealed record SpaceCrossingScore(
    string ProgramId,
    string Mode,
    string Policy,
    double Score,
    bool Allowed,
    double CorridorWidthM,
    string Basis);

public sealed record RubberBandObstacle(string Id, IReadOnlyList<Point2> Ring);

public sealed record RubberBandPathResult(bool Found, IReadOnlyList<Point2> Points,
    double LengthM, string Status, IReadOnlyList<string> TouchedObstacleIds);

public static class RectangleGeometry
{
    public static IReadOnlyList<Point2> Corners(Point2 center, double width, double height, double rotationDegrees)
    {
        var radians = rotationDegrees * Math.PI / 180d;
        var cosine = Math.Cos(radians);
        var sine = Math.Sin(radians);
        Point2 Rotate(double x, double y) => new(center.X + x * cosine - y * sine, center.Y + x * sine + y * cosine);
        return [Rotate(-width / 2, -height / 2), Rotate(width / 2, -height / 2), Rotate(width / 2, height / 2), Rotate(-width / 2, height / 2)];
    }
}
