using System.Text.Json.Serialization;

namespace ParkDesign.SpacePlanner.Core.Models;

public enum SpaceCirculationBehavior
{
    HardBarrier,
    DestinationOnly,
    PermeableLandscape,
    PreferredCorridor
}

public enum SiteEntranceType
{
    Main,
    Secondary,
    Service
}

public sealed record SpaceRegion(
    string ProgramId,
    string ProgramName,
    IReadOnlyList<Point2> Ring,
    SpaceCirculationBehavior Behavior,
    double Priority = 0.5,
    int? AccessPointCount = null,
    bool PreviewOnly = false,
    bool PublicAccess = true,
    bool RequiresService = false);

public sealed record SiteEntrance(
    string Id,
    Point2 Point,
    SiteEntranceType Type,
    double DemandWeight = 1,
    bool Accessible = true,
    bool AllowsService = false);

public sealed record ExplicitAccessPoint(
    string Id,
    string ProgramId,
    Point2 Point,
    string AccessType = "public",
    double Priority = 1,
    bool Accessible = true,
    bool AllowsService = false);

public sealed record ExistingPathInput(
    string Id,
    IReadOnlyList<Point2> Points,
    string PathType,
    double AttractionWeight = 1,
    bool Retained = true);

public sealed record CirculationDestination(
    string ProgramId,
    string ProgramName,
    Point2 Point,
    bool PublicAccess = true,
    bool Accessible = true,
    bool RequiresService = false);

public sealed record CirculationCostSettings
{
    public double CellSizeM { get; init; } = 2;
    public double DistanceWeight { get; init; } = 1;
    public double PermeabilityWeight { get; init; } = 2;
    public double HeatWeight { get; init; } = 1;
    public double ShadeBenefit { get; init; } = 0.75;
    public double SlopeWeight { get; init; } = 1;
    public double ExistingPathBenefit { get; init; } = 0.5;
    public double RouteReuseBenefit { get; init; } = 0.35;
    public double PreferredCorridorBenefit { get; init; } = 0.4;
}

public sealed record CirculationHierarchySettings
{
    public double PrimaryFlowPercentile { get; init; } = 0.8;
    public double SecondaryFlowPercentile { get; init; } = 0.4;
    public double PrimaryWidthM { get; init; } = 3;
    public double SecondaryWidthM { get; init; } = 2;
    public double TertiaryWidthM { get; init; } = 1.5;
    public double ServiceWidthM { get; init; } = 4;
}

public sealed class CirculationInput
{
    public string SchemaVersion { get; init; } = "1.0.0";
    public List<SpaceRegion> Spaces { get; init; } = [];
    public List<SiteEntrance> Entrances { get; init; } = [];
    public List<ExplicitAccessPoint> ExplicitAccessPoints { get; init; } = [];
    public List<CirculationDestination> PointDestinations { get; init; } = [];
    public List<ExistingPathInput> ExistingPaths { get; init; } = [];
    public List<MovementDemandDefinition> MovementDemands { get; init; } = [];
    public string? DesignerHubProgramId { get; init; }
    public CirculationCostSettings CostSettings { get; init; } = new();
    public CirculationHierarchySettings HierarchySettings { get; init; } = new();
}

public sealed record ProgramAccessPoint(
    string Id,
    string ProgramId,
    Point2 Point,
    Point2 ApproachVector,
    string Source,
    string AccessType,
    double Score,
    bool Selected,
    bool Accessible,
    bool AllowsService);

public sealed record AccessPointGenerationSettings
{
    public double BoundaryToleranceM { get; init; } = 0.05;
    public double CandidateSpacingM { get; init; } = 30;
    public double MinimumSelectedSpacingM { get; init; } = 8;
    public int MaximumCandidatesPerSpace { get; init; } = 32;
}

public sealed class AccessPointGenerationResult
{
    public List<ProgramAccessPoint> Candidates { get; init; } = [];
    public List<ProgramAccessPoint> Selected { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
}

public sealed record MovementCostCell(
    int Index,
    int Column,
    int Row,
    Point2 Center,
    bool Traversable,
    double BaseCost,
    string? ContainingProgramId,
    SpaceCirculationBehavior? ContainingBehavior);

public sealed class MovementCostField
{
    public double OriginX { get; init; }
    public double OriginY { get; init; }
    public double CellSizeM { get; init; }
    public int ColumnCount { get; init; }
    public int RowCount { get; init; }
    public List<MovementCostCell> Cells { get; init; } = [];

    public MovementCostCell Cell(int column, int row) => Cells[row * ColumnCount + column];
}

public sealed record GridPathResult(
    bool Found,
    IReadOnlyList<Point2> Points,
    double AccumulatedCost,
    int VisitedCellCount,
    string? FailureReason = null);

public sealed class CirculationDemandAssignment
{
    public string Id { get; init; } = string.Empty;
    public string OriginId { get; init; } = string.Empty;
    public string DestinationId { get; init; } = string.Empty;
    public double Weight { get; init; }
    public string Network { get; init; } = "public";
    public bool Found { get; init; }
    public double AccumulatedCost { get; init; }
    public List<string> JourneyIds { get; init; } = [];
    public List<string> EdgeIds { get; init; } = [];
}

public sealed record CirculationNode(
    string Id,
    Point2 Point,
    string NodeType,
    string? ProgramId = null,
    string? AccessPointId = null);

public sealed class CirculationEdge
{
    public string Id { get; init; } = string.Empty;
    public string StartNodeId { get; init; } = string.Empty;
    public string EndNodeId { get; init; } = string.Empty;
    public List<Point2> Centerline { get; init; } = [];
    public string Network { get; set; } = "public";
    public string Hierarchy { get; set; } = "tertiary";
    public double LengthM { get; set; }
    public double WidthM { get; set; }
    public double TotalFlow { get; set; }
    public bool Accessible { get; set; }
    public int ReusedRouteCount { get; set; }
    public Dictionary<string, double> EnvironmentalCosts { get; init; } = [];
    public List<string> JourneyIds { get; init; } = [];
    public List<string> MovementDemandIds { get; init; } = [];
}

public sealed record CirculationPathChain(
    string Id,
    string Network,
    string Hierarchy,
    double WidthM,
    IReadOnlyList<Point2> Points,
    IReadOnlyList<string> EdgeIds,
    double MaximumFlow);

public sealed record PathRefinementSettings
{
    public int SmoothingPasses { get; init; } = 2;
    public double CornerCutRatio { get; init; } = 0.2;
    public double ValidationStepM { get; init; } = 0.5;
}

public sealed record PathRefinementResult(
    CirculationPathChain Source,
    IReadOnlyList<Point2> Points,
    string Status,
    int RawPointCount,
    int RefinedPointCount);

public sealed class CirculationAudit
{
    public List<string> DisconnectedProgramIds { get; init; } = [];
    public List<string> BlockedAccessPointIds { get; init; } = [];
    public List<string> HardBarrierIntersectionEdgeIds { get; init; } = [];
    public List<string> ExcessiveDetourDemandIds { get; init; } = [];
    public List<string> Warnings { get; init; } = [];
    [JsonIgnore]
    public bool IsValid => DisconnectedProgramIds.Count == 0
        && BlockedAccessPointIds.Count == 0
        && HardBarrierIntersectionEdgeIds.Count == 0;
}

public sealed class CirculationResult
{
    public string SchemaVersion { get; init; } = "1.0.0";
    public List<ProgramAccessPoint> AccessPoints { get; init; } = [];
    public List<CirculationNode> Nodes { get; init; } = [];
    public List<CirculationEdge> Edges { get; init; } = [];
    public List<CirculationDemandAssignment> OdAssignments { get; init; } = [];
    public List<PathRefinementResult> DisplayPaths { get; init; } = [];
    public string? HubProgramId { get; init; }
    public CirculationAudit Audit { get; init; } = new();
}
