namespace ParkDesign.SpacePlanner.Core.Models;

public enum GeometryRole { Area, Node, Route, System }
public enum RelationshipAuthority { AcceptedRule, DesignerApproved, Advisory }
public enum AreaConstraintMode { Free, Pinned, BoundaryEdgeConstrained }

public sealed record SpatialRelationshipNode(string Id, string Name, string ProgramType, GeometryRole GeometryRole,
    double Priority, bool Selected, string Category);

public sealed record NumericSpatialConstraint(string Parameter, double ValueMetres);

public sealed record EdgeWeightComponents(double BaseStrength, double SourcePriority, double TargetPriorityAdjustment,
    double ConfidenceAdjustment, double Weight);

public sealed class SpatialRelationshipEdge
{
    public string Id { get; init; } = string.Empty;
    public string SourceId { get; init; } = string.Empty;
    public string TargetId { get; init; } = string.Empty;
    public string RelationshipType { get; init; } = "other";
    public RelationshipAuthority Authority { get; init; }
    public bool Mandatory { get; init; }
    public bool HardConstraint { get; init; }
    public bool Directed { get; init; }
    public double Weight { get; init; }
    public NumericSpatialConstraint? NumericConstraint { get; init; }
    public double? Confidence { get; init; }
    public double? CompatibilityScore { get; init; }
    public string? OverlapMode { get; init; }
    public EdgeWeightComponents? WeightComponents { get; init; }
    public List<string> Provenance { get; init; } = [];
}

public sealed class SpatialRelationshipGraph
{
    public List<SpatialRelationshipNode> Nodes { get; init; } = [];
    public List<SpatialRelationshipEdge> Edges { get; init; } = [];
}

public sealed record ConflictRecord(string Source, string Target, string AdvisoryRelationship,
    string AcceptedRelationship, string Resolution, string Reason);

public sealed class SpatialRelationshipStatistics
{
    public int NodeCount { get; init; }
    public int EdgeCount { get; init; }
    public int AcceptedEdgeCount { get; init; }
    public int DesignerApprovedEdgeCount { get; init; }
    public int AdvisoryEdgeCount { get; init; }
    public int PreferredPairs { get; init; }
    public int AvoidPairs { get; init; }
    public int OverlapPairs { get; init; }
    public int MandatoryConstraints { get; init; }
    public int NumericConstraints { get; init; }
    public int UnresolvedReferences { get; init; }
}

public sealed class SpatialRelationshipCompilationResult
{
    public SpatialRelationshipGraph Graph { get; init; } = new();
    public List<ConflictRecord> Conflicts { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
    public SpatialRelationshipStatistics Statistics { get; init; } = new();
}

public sealed record AreaAgent(string ProgramId, string ProgramName, Point2 Position, double TargetAreaM2,
    double? MinimumAreaM2, double? MaximumAreaM2, double EffectiveAreaM2, double Radius, double Priority,
    bool Selected, string? SuitabilityField, AreaConstraintMode ConstraintMode = AreaConstraintMode.Free,
    string SpatialMode = "exclusive");

public sealed record EnergyBreakdown(double Total, double Suitability, double Overlap, double Boundary,
    double Preferred, double Avoid, double Accepted, double Area);
public sealed record ProgramSolverDiagnostic(string ProgramId, Point2 Position, double Suitability,
    double MovementDistance, double RelationshipPenalty);
public sealed record EdgeSolverDiagnostic(string EdgeId, double ActualDistance, bool Satisfied,
    bool AcceptedRulePassed, bool? NumericRulePassed);

public sealed class AreaSolverDiagnostics
{
    public EnergyBreakdown Energy { get; init; } = new(0, 0, 0, 0, 0, 0, 0, 0);
    public int IterationCount { get; init; }
    public bool Converged { get; init; }
    public bool Valid { get; init; }
    public double AverageSuitability { get; init; }
    public double RelationshipSatisfactionRatio { get; init; }
    public int HardViolationCount { get; init; }
    public List<ProgramSolverDiagnostic> Programs { get; init; } = [];
    public List<EdgeSolverDiagnostic> Edges { get; init; } = [];
}

public sealed class AreaSolverResult
{
    public List<AreaAgent> Agents { get; init; } = [];
    public AreaSolverDiagnostics Diagnostics { get; init; } = new();
}
