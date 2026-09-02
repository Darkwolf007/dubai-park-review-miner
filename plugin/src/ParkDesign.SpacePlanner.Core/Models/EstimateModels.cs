using System.Text.Json.Serialization;

namespace ParkDesign.SpacePlanner.Core.Models;

public sealed class AreaReconciliationDefinition
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "unavailable";

    [JsonPropertyName("brief_gross_area_m2")]
    public double? BriefGrossAreaM2 { get; set; }

    [JsonPropertyName("measured_boundary_area_m2")]
    public double? MeasuredBoundaryAreaM2 { get; set; }

    [JsonPropertyName("exclusive_program_area_m2")]
    public double? ExclusiveProgramAreaM2 { get; set; }

    [JsonPropertyName("operations_area_m2")]
    public double? OperationsAreaM2 { get; set; }

    [JsonPropertyName("drop_off_area_m2")]
    public double? DropOffAreaM2 { get; set; }

    [JsonPropertyName("circulation_area_m2")]
    public double? CirculationAreaM2 { get; set; }

    [JsonPropertyName("exclusive_committed_area_m2")]
    public double? ExclusiveCommittedAreaM2 { get; set; }

    [JsonPropertyName("remaining_area_m2")]
    public double? RemainingAreaM2 { get; set; }

    [JsonPropertyName("shared_demand_area_m2")]
    public double? SharedDemandAreaM2 { get; set; }

    [JsonPropertyName("coverage_targets")]
    public List<CoverageTargetDefinition> CoverageTargets { get; set; } = [];
}

public sealed class CoverageTargetDefinition
{
    [JsonPropertyName("program_id")]
    public string ProgramId { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

    [JsonPropertyName("percent")]
    public double Percent { get; set; }

    [JsonPropertyName("equivalent_area_m2")]
    public double EquivalentAreaM2 { get; set; }
}

public sealed class DesignEstimateDefinition
{
    [JsonPropertyName("estimate_nature")]
    public string EstimateNature { get; set; } = "unavailable";

    [JsonPropertyName("scores_0_to_100")]
    public EstimateScoresDefinition Scores { get; set; } = new();

    [JsonPropertyName("paths")]
    public PathEstimateDefinition Paths { get; set; } = new();

    [JsonPropertyName("spaces")]
    public SpaceEstimateDefinition Spaces { get; set; } = new();

    [JsonPropertyName("adjacency")]
    public AdjacencyEstimateDefinition Adjacency { get; set; } = new();

    [JsonPropertyName("plants")]
    public PlantEstimateDefinition Plants { get; set; } = new();

    [JsonPropertyName("budget")]
    public BudgetEstimateDefinition Budget { get; set; } = new();
}

public sealed class SpaceEstimateDefinition
{
    [JsonPropertyName("total_space_program_count")] public int TotalSpaceProgramCount { get; set; }
    [JsonPropertyName("area_program_count")] public int AreaProgramCount { get; set; }
    [JsonPropertyName("required_exclusive_count")] public int RequiredExclusiveCount { get; set; }
    [JsonPropertyName("shared_program_count")] public int SharedProgramCount { get; set; }
    [JsonPropertyName("overlay_program_count")] public int OverlayProgramCount { get; set; }
    [JsonPropertyName("approximate_exclusive_area_m2")] public double? ApproximateExclusiveAreaM2 { get; set; }
    [JsonPropertyName("shared_nominal_area_m2")] public double? SharedNominalAreaM2 { get; set; }
    [JsonPropertyName("approximate_cost_aed")] public double? ApproximateCostAed { get; set; }
}

public sealed class AdjacencyEstimateDefinition
{
    [JsonPropertyName("relationship_count")] public int RelationshipCount { get; set; }
    [JsonPropertyName("weighted_relationship_count")] public int WeightedRelationshipCount { get; set; }
    [JsonPropertyName("mandatory_relationship_count")] public int MandatoryRelationshipCount { get; set; }
    [JsonPropertyName("approximate_count_by_type")]
    public Dictionary<string, int> ApproximateCountByType { get; set; } = [];
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
}

public sealed class EstimateScoresDefinition
{
    [JsonPropertyName("spaces")] public double? Spaces { get; set; }
    [JsonPropertyName("paths")] public double? Paths { get; set; }
    [JsonPropertyName("adjacency")] public double? Adjacency { get; set; }
    [JsonPropertyName("plants")] public double? Plants { get; set; }
    [JsonPropertyName("overall_readiness")] public double? OverallReadiness { get; set; }
}

public sealed class PathEstimateDefinition
{
    [JsonPropertyName("systems")]
    public List<PathSystemEstimateDefinition> Systems { get; set; } = [];

    [JsonPropertyName("known_approximate_length_m")]
    public double? KnownApproximateLengthM { get; set; }

    [JsonPropertyName("approximate_cost_aed")]
    public double? ApproximateCostAed { get; set; }
}

public sealed class PathSystemEstimateDefinition
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("count")] public int Count { get; set; }
    [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
    [JsonPropertyName("length")] public double? LengthM { get; set; }
    [JsonPropertyName("width")] public double? WidthM { get; set; }
    [JsonPropertyName("approximate_area_m2")] public double? ApproximateAreaM2 { get; set; }
    [JsonPropertyName("approximate_cost_aed")] public double? ApproximateCostAed { get; set; }
}

public sealed class PlantEstimateDefinition
{
    [JsonPropertyName("approximate_tree_count")] public int? ApproximateTreeCount { get; set; }
    [JsonPropertyName("tree_canopy_area_m2")] public double? TreeCanopyAreaM2 { get; set; }
    [JsonPropertyName("native_planting_area_m2")] public double? NativePlantingAreaM2 { get; set; }
    [JsonPropertyName("approximate_tree_cost_aed")] public double? ApproximateTreeCostAed { get; set; }
    [JsonPropertyName("approximate_native_planting_cost_aed")] public double? ApproximateNativePlantingCostAed { get; set; }
}

public sealed class BudgetEstimateDefinition
{
    [JsonPropertyName("scenario_target_aed")] public double? ScenarioTargetAed { get; set; }
    [JsonPropertyName("contingency_percent")] public double? ContingencyPercent { get; set; }
    [JsonPropertyName("known_cost_subtotal_aed")] public double? KnownCostSubtotalAed { get; set; }
    [JsonPropertyName("known_cost_with_contingency_aed")] public double? KnownCostWithContingencyAed { get; set; }
    [JsonPropertyName("estimate_status")] public string EstimateStatus { get; set; } = "unavailable";
    [JsonPropertyName("target_status")] public string TargetStatus { get; set; } = "unavailable";
}
