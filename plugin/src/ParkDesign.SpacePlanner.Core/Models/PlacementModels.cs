namespace ParkDesign.SpacePlanner.Core.Models;

public readonly record struct Point2(double X, double Y);

public sealed record BubblePlacement(
    string ProgramId,
    string ProgramName,
    Point2 Center,
    double Radius,
    double TargetAreaM2,
    string LocationZone,
    double SuitabilityScore = 0,
    double RelationshipPenalty = 0);

public sealed record NodePlacement(
    string ProgramId,
    string ProgramName,
    Point2 Point,
    double SuitabilityScore);

public sealed record RoutePlacement(
    string ProgramId,
    string ProgramName,
    IReadOnlyList<Point2> Points,
    bool Closed,
    string Basis);

public sealed record RelationshipLine(
    string RelationshipId,
    string SourceId,
    string TargetId,
    Point2 Source,
    Point2 Target,
    string RelationshipType,
    bool Mandatory);

public sealed class DistributionResult
{
    public List<BubblePlacement> Placements { get; } = [];
    public List<string> Warnings { get; } = [];
    public double BoundaryAreaM2 { get; init; }
    public double RequestedProgramAreaM2 { get; init; }
    public double AverageSuitability { get; set; }
    public double RelationshipPenalty { get; set; }
}

public sealed class LayoutScenarioResult
{
    public string Strategy { get; init; } = "Balanced";
    public string AreaSizingMode { get; init; } = "exported_targets";
    public DistributionResult Areas { get; init; } = new();
    public List<NodePlacement> AreaAnchors { get; init; } = [];
    public List<NodePlacement> Nodes { get; init; } = [];
    public List<RoutePlacement> Routes { get; init; } = [];
    public List<RelationshipLine> RelationshipLines { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
    public double Score { get; set; }
}

public sealed class PlanningResult
{
    public List<LayoutScenarioResult> Scenarios { get; init; } = [];
    public LayoutScenarioResult Best { get; init; } = new();
}
