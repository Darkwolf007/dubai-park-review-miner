using System.Text.Json.Serialization;

namespace ParkDesign.SpacePlanner.Core.Models;

public sealed class AccessCandidateDefinition
{
    [JsonPropertyName("candidate_id")]
    public string CandidateId { get; set; } = string.Empty;

    [JsonPropertyName("edge_id")]
    public string EdgeId { get; set; } = string.Empty;

    [JsonPropertyName("boundary_parameter")]
    public double BoundaryParameter { get; set; }

    [JsonPropertyName("coordinates")]
    public AccessCoordinates Coordinates { get; set; } = new();

    [JsonPropertyName("eligible_roles")]
    public AccessEligibleRoles EligibleRoles { get; set; } = new();

    [JsonPropertyName("hard_exclusions")]
    public List<string> HardExclusions { get; set; } = [];

    [JsonPropertyName("metrics_raw")]
    public AccessRawMetrics MetricsRaw { get; set; } = new();

    [JsonPropertyName("metrics_normalized")]
    public AccessNormalizedMetrics MetricsNormalized { get; set; } = new();

    [JsonPropertyName("evidence_status")]
    public Dictionary<string, string> EvidenceStatus { get; set; } = [];
}

public sealed class AccessCoordinates
{
    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }

    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("crs")]
    public string Crs { get; set; } = "EPSG:32640";
}

public sealed class AccessEligibleRoles
{
    [JsonPropertyName("main_entrance")]
    public bool MainEntrance { get; set; }

    [JsonPropertyName("secondary_entrance")]
    public bool SecondaryEntrance { get; set; }

    [JsonPropertyName("drop_off")]
    public bool DropOff { get; set; }

    [JsonPropertyName("service_entrance")]
    public bool ServiceEntrance { get; set; }
}

public sealed class AccessRawMetrics
{
    [JsonPropertyName("population_pull")]
    public double PopulationPull { get; set; }

    [JsonPropertyName("population_within_catchment")]
    public double PopulationWithinCatchment { get; set; }

    [JsonPropertyName("school_generators_within_catchment")]
    public int SchoolGeneratorsWithinCatchment { get; set; }

    [JsonPropertyName("building_generators_within_catchment")]
    public int BuildingGeneratorsWithinCatchment { get; set; }

    [JsonPropertyName("intersection_count_within_catchment")]
    public double IntersectionCountWithinCatchment { get; set; }

    [JsonPropertyName("average_barrier_score")]
    public double? AverageBarrierScore { get; set; }

    [JsonPropertyName("nearest_bus_stop_m")]
    public double? NearestBusStopM { get; set; }

    [JsonPropertyName("nearest_road_m")]
    public double? NearestRoadM { get; set; }

    [JsonPropertyName("nearest_school_boundary_m")]
    public double? NearestSchoolBoundaryM { get; set; }

    [JsonPropertyName("nearest_building_boundary_m")]
    public double? NearestBuildingBoundaryM { get; set; }
}

public sealed class AccessNormalizedMetrics
{
    [JsonPropertyName("population_pull")]
    public double PopulationPull { get; set; }

    [JsonPropertyName("transit_access")]
    public double TransitAccess { get; set; }

    [JsonPropertyName("intersection_connectivity")]
    public double IntersectionConnectivity { get; set; }

    [JsonPropertyName("road_access")]
    public double RoadAccess { get; set; }

    [JsonPropertyName("low_barrier_access")]
    public double LowBarrierAccess { get; set; }
}

public sealed class AccessCandidatePairDefinition
{
    [JsonPropertyName("candidate_a")]
    public string CandidateA { get; set; } = string.Empty;

    [JsonPropertyName("candidate_b")]
    public string CandidateB { get; set; } = string.Empty;

    [JsonPropertyName("distance_m")]
    public double DistanceM { get; set; }

    [JsonPropertyName("same_edge")]
    public bool SameEdge { get; set; }

    [JsonPropertyName("catchment_overlap_ratio")]
    public double CatchmentOverlapRatio { get; set; }

    [JsonPropertyName("additional_population_served_by_a")]
    public double? AdditionalPopulationServedByA { get; set; }

    [JsonPropertyName("additional_population_served_by_b")]
    public double AdditionalPopulationServedByB { get; set; }

    [JsonPropertyName("combined_population_served")]
    public double CombinedPopulationServed { get; set; }
}

public sealed class MovementRequirementsDefinition
{
    [JsonPropertyName("loops_connect_both_public_entrances")]
    public bool LoopsConnectBothPublicEntrances { get; set; }

    [JsonPropertyName("walking")]
    public WalkingRequirements Walking { get; set; } = new();

    [JsonPropertyName("jogging")]
    public RouteRequirements Jogging { get; set; } = new();

    [JsonPropertyName("exercise_cycling")]
    public CyclingRequirements ExerciseCycling { get; set; } = new();

    [JsonPropertyName("service")]
    public ServiceRequirements Service { get; set; } = new();
}

public class RouteRequirements
{
    [JsonPropertyName("route_type")]
    public string RouteType { get; set; } = string.Empty;

    [JsonPropertyName("length_objective")]
    public string LengthObjective { get; set; } = string.Empty;

    [JsonPropertyName("target_length_m")]
    public double? TargetLengthM { get; set; }

    [JsonPropertyName("width_m")]
    public double? WidthM { get; set; }

    [JsonPropertyName("maximum_slope_percent")]
    public double? MaximumSlopePercent { get; set; }
}

public sealed class WalkingRequirements : RouteRequirements
{
    [JsonPropertyName("accessibility_scope")]
    public string AccessibilityScope { get; set; } = string.Empty;

    [JsonPropertyName("may_share_with_jogging")]
    public bool MayShareWithJogging { get; set; }
}

public sealed class CyclingRequirements : RouteRequirements
{
    [JsonPropertyName("program_id")]
    public string ProgramId { get; set; } = string.Empty;

    [JsonPropertyName("pedestrian_sharing")]
    public string PedestrianSharing { get; set; } = string.Empty;

    [JsonPropertyName("minimum_turning_radius_m")]
    public double? MinimumTurningRadiusM { get; set; }
}

public sealed class ServiceRequirements
{
    [JsonPropertyName("route_type")]
    public string RouteType { get; set; } = string.Empty;

    [JsonPropertyName("entrance_count")]
    public int EntranceCount { get; set; } = 1;

    [JsonPropertyName("must_connect_program_id")]
    public string MustConnectProgramId { get; set; } = "operationsArea";

    [JsonPropertyName("target_length_m")]
    public double? TargetLengthM { get; set; }

    [JsonPropertyName("width_m")]
    public double? WidthM { get; set; }

    [JsonPropertyName("may_share_public_paths")]
    public bool MaySharePublicPaths { get; set; }
}

public sealed class TerrainRequirementsDefinition
{
    [JsonPropertyName("authoritative_input")]
    public string AuthoritativeInput { get; set; } = string.Empty;

    [JsonPropertyName("optimizer_may_modify_terrain")]
    public bool OptimizerMayModifyTerrain { get; set; }

    [JsonPropertyName("required_comparison")]
    public List<string> RequiredComparison { get; set; } = [];
}

public sealed class MasterplanSettingsDefinition
{
    [JsonPropertyName("operationsAreaM2")]
    public double? OperationsAreaM2 { get; set; }

    [JsonPropertyName("dropOffAreaM2")]
    public double? DropOffAreaM2 { get; set; }

    [JsonPropertyName("candidateSpacingM")]
    public double CandidateSpacingM { get; set; } = 10;

    [JsonPropertyName("accessCatchmentRadiusM")]
    public double AccessCatchmentRadiusM { get; set; } = 800;

    [JsonPropertyName("roadEdgeMaxDistanceM")]
    public double RoadEdgeMaxDistanceM { get; set; } = 25;

    [JsonPropertyName("allPedestrianRoutesAccessible")]
    public bool AllPedestrianRoutesAccessible { get; set; }

    [JsonPropertyName("allowWalkingJoggingSharing")]
    public bool AllowWalkingJoggingSharing { get; set; } = true;

    [JsonPropertyName("allowServicePublicPathSharing")]
    public bool AllowServicePublicPathSharing { get; set; }
}
