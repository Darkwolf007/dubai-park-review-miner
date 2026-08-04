namespace ParkDesign.SpacePlanner.Core.Models;

public readonly record struct Point2(double X, double Y);

public sealed record BubblePlacement(
    string ProgramId,
    string ProgramName,
    Point2 Center,
    double Radius,
    double TargetAreaM2,
    string LocationZone);

public sealed class DistributionResult
{
    public List<BubblePlacement> Placements { get; } = [];
    public List<string> Warnings { get; } = [];
    public double BoundaryAreaM2 { get; init; }
    public double RequestedProgramAreaM2 { get; init; }
}
