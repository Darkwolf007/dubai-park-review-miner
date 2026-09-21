using System.Text.Json.Serialization;

namespace ParkDesign.SpacePlanner.Core.Models;

public sealed class DesignPackage
{
    [JsonPropertyName("schema_version")]
    public string SchemaVersion { get; set; } = "1.0.0";

    [JsonPropertyName("project")]
    public ProjectDefinition Project { get; set; } = new();

    [JsonPropertyName("coordinate_system")]
    public CoordinateSystemDefinition CoordinateSystem { get; set; } = new();

    [JsonPropertyName("grid")]
    public GridDefinition Grid { get; set; } = new();

    [JsonPropertyName("programs")]
    public List<ProgramDefinition> Programs { get; set; } = [];

    [JsonIgnore]
    public List<ProgramDefinition> NodePrograms { get; set; } = [];

    [JsonIgnore]
    public List<ProgramDefinition> RoutePrograms { get; set; } = [];

    [JsonPropertyName("relationships")]
    public List<RelationshipDefinition> Relationships { get; set; } = [];

    [JsonPropertyName("unresolved")]
    public List<string> Unresolved { get; set; } = [];

    [JsonIgnore]
    public bool AdaptedFromLegacyManifest { get; set; }

    [JsonIgnore]
    public List<Point2> PackageBoundary { get; set; } = [];

    [JsonIgnore]
    public List<BoundarySegmentDefinition> BoundarySegments { get; set; } = [];

    [JsonIgnore]
    public List<PlacementZoneDefinition> PlacementZones { get; set; } = [];

    [JsonIgnore]
    public List<AccessCandidateDefinition> AccessCandidates { get; set; } = [];

    [JsonIgnore]
    public List<AccessCandidatePairDefinition> AccessCandidatePairs { get; set; } = [];

    [JsonIgnore]
    public MovementRequirementsDefinition MovementRequirements { get; set; } = new();

    [JsonIgnore]
    public TerrainRequirementsDefinition TerrainRequirements { get; set; } = new();

    [JsonIgnore]
    public MasterplanSettingsDefinition MasterplanSettings { get; set; } = new();

    [JsonIgnore]
    public AreaReconciliationDefinition AreaReconciliation { get; set; } = new();

    [JsonIgnore]
    public DesignEstimateDefinition DesignEstimate { get; set; } = new();

    [JsonIgnore]
    public ClimateMorphologyDefinition ClimateMorphology { get; set; } = new();

    [JsonIgnore]
    public PlantingStrategyDefinition PlantingStrategy { get; set; } = new();

    [JsonIgnore]
    public List<UserGroupDefinition> UserGroups { get; set; } = [];

    [JsonIgnore]
    public List<UserProgramSuitabilityDefinition> UserProgramSuitability { get; set; } = [];

    [JsonIgnore]
    public List<ParametricRelationshipDefinition> ParametricRelationships { get; set; } = [];

    [JsonIgnore]
    public List<MovementDemandDefinition> MovementDemands { get; set; } = [];
}

public sealed class BoundarySegmentDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
    [JsonPropertyName("roles")]
    public List<string> Roles { get; set; } = [];
    [JsonPropertyName("authority")]
    public string Authority { get; set; } = string.Empty;
    [JsonPropertyName("coordinates")]
    public List<List<double>> Coordinates { get; set; } = [];
}

public sealed class PlacementZoneDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
    [JsonPropertyName("type")]
    public string Type { get; set; } = "candidate_zone";
    [JsonPropertyName("priority")]
    public double Priority { get; set; } = .5;
    [JsonPropertyName("authority")]
    public string Authority { get; set; } = string.Empty;
    [JsonPropertyName("geometry")]
    public PolygonGeometryDefinition Geometry { get; set; } = new();
}

public sealed class PolygonGeometryDefinition
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "Polygon";
    [JsonPropertyName("coordinates")]
    public List<List<List<double>>> Coordinates { get; set; } = [];
}

public sealed class MovementDemandDefinition
{
    [JsonPropertyName("origin")]
    public string Origin { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string Destination { get; set; } = string.Empty;

    [JsonPropertyName("weight")]
    public double Weight { get; set; }

    [JsonPropertyName("persona_ids")]
    public List<string> PersonaIds { get; set; } = [];

    [JsonPropertyName("journey_ids")]
    public List<string> JourneyIds { get; set; } = [];
}

public sealed class ProjectDefinition
{
    [JsonPropertyName("site_name")]
    public string SiteName { get; set; } = "Unknown site";
}

public sealed class CoordinateSystemDefinition
{
    [JsonPropertyName("crs")]
    public string Crs { get; set; } = "EPSG:32640";

    [JsonPropertyName("units")]
    public string Units { get; set; } = "meters";
}

public sealed class GridDefinition
{
    [JsonPropertyName("cells")]
    public List<GridCell> Cells { get; set; } = [];
}

public sealed class GridCell
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonPropertyName("constraint")]
    public bool Constraint { get; set; }

    [JsonPropertyName("scores")]
    public Dictionary<string, double?> Scores { get; set; } = [];

    [JsonPropertyName("program_constraints")]
    public Dictionary<string, string> ProgramConstraints { get; set; } = [];

    [JsonIgnore]
    public List<Point2> Ring { get; set; } = [];

    [JsonIgnore]
    public double? AreaM2 { get; set; }

    [JsonIgnore]
    public string? SourceLayer { get; set; }

    [JsonIgnore]
    public string GridAuthority { get; set; } = "package_generated";
}

public sealed class ProgramDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("target_area_m2")]
    public double? TargetAreaM2 { get; set; }

    [JsonPropertyName("minimum_area_m2")]
    public double? MinimumAreaM2 { get; set; }

    [JsonPropertyName("maximum_area_m2")]
    public double? MaximumAreaM2 { get; set; }

    [JsonPropertyName("location_zone")]
    public string LocationZone { get; set; } = "UNSPECIFIED";

    [JsonPropertyName("geometry_type")]
    public string GeometryType { get; set; } = "area";

    [JsonPropertyName("priority")]
    public double Priority { get; set; } = 0.5;

    [JsonPropertyName("selected")]
    public bool Selected { get; set; } = true;

    [JsonPropertyName("mandatory")]
    public bool Mandatory { get; set; } = true;

    [JsonPropertyName("spatial_mode")]
    public string SpatialMode { get; set; } = "exclusive";

    [JsonPropertyName("fragmentation_policy")]
    public string FragmentationPolicy { get; set; } = "single_primary_territory";

    [JsonPropertyName("decision_authority")]
    public string DecisionAuthority { get; set; } = string.Empty;

    [JsonPropertyName("synthesis_selected")]
    public bool SynthesisSelected { get; set; }

    [JsonPropertyName("suitability_field")]
    public string? SuitabilityField { get; set; }

    [JsonPropertyName("area_status")]
    public string AreaStatus { get; set; } = "designer_approved";

    [JsonPropertyName("representation_status")]
    public string RepresentationStatus { get; set; } = string.Empty;

    [JsonPropertyName("placement_status")]
    public string PlacementStatus { get; set; } = string.Empty;

    [JsonPropertyName("attractors")]
    public List<string> Attractors { get; set; } = [];

    [JsonPropertyName("repellers")]
    public List<string> Repellers { get; set; } = [];

    [JsonPropertyName("constraints")]
    public List<string> Constraints { get; set; } = [];

    [JsonPropertyName("category")]
    public string Category { get; set; } = string.Empty;

    [JsonPropertyName("primary_users")]
    public List<string> PrimaryUsers { get; set; } = [];

    [JsonPropertyName("evidence_sources")]
    public List<string> EvidenceSources { get; set; } = [];

    [JsonPropertyName("evidence")]
    public List<string> Evidence { get; set; } = [];

    [JsonPropertyName("scores")]
    public Dictionary<string, double?> Scores { get; set; } = [];

    [JsonPropertyName("ontology")]
    public ProgramOntologyDefinition Ontology { get; set; } = new();

    [JsonPropertyName("spatial_behavior")]
    public string SpatialBehavior { get; set; } = string.Empty;

    [JsonPropertyName("user_group_ids")]
    public List<string> UserGroupIds { get; set; } = [];

    [JsonPropertyName("temporal_profile")]
    public Dictionary<string, double> TemporalProfile { get; set; } = [];

    [JsonPropertyName("seasonal_profile")]
    public Dictionary<string, double> SeasonalProfile { get; set; } = [];

    [JsonPropertyName("performance_attributes")]
    public Dictionary<string, double> PerformanceAttributes { get; set; } = [];

    [JsonPropertyName("commercial")]
    public Dictionary<string, double> Commercial { get; set; } = [];

    [JsonPropertyName("dune_compatibility")]
    public Dictionary<string, double> DuneCompatibility { get; set; } = [];

    [JsonPropertyName("path_dune_operations")]
    public List<string> PathDuneOperations { get; set; } = [];

    [JsonPropertyName("route_topology")]
    public string? RouteTopology { get; set; }

    [JsonPropertyName("target_length_m")]
    public double? TargetLengthM { get; set; }

    [JsonPropertyName("target_width_m")]
    public double? TargetWidthM { get; set; }

    [JsonPropertyName("coverage_target_percent")]
    public double? CoverageTargetPercent { get; set; }

    [JsonPropertyName("target_usable_area_m2")]
    public double? TargetUsableAreaM2 { get; set; }

    [JsonPropertyName("placement_rules")]
    public PlacementRulesDefinition PlacementRules { get; set; } = new();

    [JsonPropertyName("circulation_profile")]
    public ProgramCirculationProfile CirculationProfile { get; set; } = new();
}

public sealed class PlacementRulesDefinition
{
    [JsonPropertyName("hard")]
    public HardPlacementRules Hard { get; set; } = new();

    [JsonPropertyName("soft")]
    public SoftPlacementRules Soft { get; set; } = new();
}

public sealed class HardPlacementRules
{
    [JsonPropertyName("must_touch_boundary")]
    public bool MustTouchBoundary { get; set; }
    [JsonPropertyName("allowed_boundary_segment_ids")]
    public List<string> AllowedBoundarySegmentIds { get; set; } = [];
    [JsonPropertyName("allowed_boundary_roles")]
    public List<string> AllowedBoundaryRoles { get; set; } = [];
    [JsonPropertyName("allowed_zone_ids")]
    public List<string> AllowedZoneIds { get; set; } = [];
    [JsonPropertyName("must_be_adjacent_to")]
    public List<string> MustBeAdjacentTo { get; set; } = [];
    [JsonPropertyName("maximum_boundary_setback_m")]
    public double? MaximumBoundarySetbackM { get; set; }
    [JsonPropertyName("maximum_adjacency_gap_m")]
    public double? MaximumAdjacencyGapM { get; set; }
    [JsonPropertyName("minimum_shared_edge_m")]
    public double? MinimumSharedEdgeM { get; set; }
}

public sealed class SoftPlacementRules
{
    [JsonPropertyName("preferred_entrance_id")]
    public string? PreferredEntranceId { get; set; }
    [JsonPropertyName("minimize_distance_to_entrance")]
    public bool MinimizeDistanceToEntrance { get; set; }
    [JsonPropertyName("minimize_service_route_length")]
    public bool MinimizeServiceRouteLength { get; set; }
    [JsonPropertyName("avoid_public_arrival")]
    public bool AvoidPublicArrival { get; set; }
    [JsonPropertyName("orientation")]
    public string Orientation { get; set; } = "either";
    [JsonPropertyName("zone_scores")]
    public Dictionary<string, double> ZoneScores { get; set; } = [];
}

public sealed class ProgramCirculationProfile
{
    [JsonPropertyName("walking")]
    public ModeCrossingRule Walking { get; set; } = new() { CrossingPolicy = "allowed", MinimumClearWidthM = 1.5 };
    [JsonPropertyName("cycling")]
    public ModeCrossingRule Cycling { get; set; } = new() { CrossingPolicy = "controlled_only", MinimumClearWidthM = 2.5 };
    [JsonPropertyName("service")]
    public ModeCrossingRule Service { get; set; } = new() { CrossingPolicy = "forbidden", MinimumClearWidthM = 3 };
}

public sealed class ModeCrossingRule
{
    [JsonPropertyName("crossing_policy")]
    public string CrossingPolicy { get; set; } = "forbidden";
    [JsonPropertyName("designer_score")]
    public double? DesignerScore { get; set; }
    [JsonPropertyName("minimum_clear_width_m")]
    public double? MinimumClearWidthM { get; set; }
    [JsonPropertyName("minimum_turning_radius_m")]
    public double? MinimumTurningRadiusM { get; set; }
}

public sealed class ProgramOntologyDefinition
{
    [JsonPropertyName("program_class")]
    public string ProgramClass { get; set; } = string.Empty;
    [JsonPropertyName("space_class")]
    public string? SpaceClass { get; set; }
    [JsonPropertyName("common_class")]
    public string? CommonClass { get; set; }
}

public sealed class UserGroupDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    [JsonPropertyName("needs")]
    public Dictionary<string, double> Needs { get; set; } = [];
    [JsonPropertyName("peakPeriods")]
    public List<string> PeakPeriods { get; set; } = [];
    [JsonPropertyName("seasonalSensitivity")]
    public Dictionary<string, double> SeasonalSensitivity { get; set; } = [];
}

public sealed class UserProgramSuitabilityDefinition
{
    [JsonPropertyName("userGroupId")]
    public string UserGroupId { get; set; } = string.Empty;
    [JsonPropertyName("programId")]
    public string ProgramId { get; set; } = string.Empty;
    [JsonPropertyName("weight")]
    public double Weight { get; set; }
    [JsonPropertyName("components")]
    public Dictionary<string, double> Components { get; set; } = [];
    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;
}

public sealed class ParametricRelationshipDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;
    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;
    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;
    [JsonPropertyName("score")]
    public double Score { get; set; }
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;
}

public sealed class RelationshipDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "preferred";

    [JsonPropertyName("mandatory")]
    public bool Mandatory { get; set; }

    [JsonPropertyName("accepted")]
    public bool Accepted { get; set; }

    [JsonPropertyName("graph_layer")]
    public string GraphLayer { get; set; } = "functional";

    [JsonPropertyName("directed")]
    public bool Directed { get; set; }

    [JsonPropertyName("numeric_value")]
    public double? NumericValue { get; set; }

    [JsonPropertyName("numeric_unit")]
    public string? NumericUnit { get; set; }

    [JsonPropertyName("numeric_parameter")]
    public string? NumericParameter { get; set; }

    [JsonPropertyName("authority")]
    public string Authority { get; set; } = "accepted_rule";

    [JsonPropertyName("confidence")]
    public double? Confidence { get; set; }

    [JsonPropertyName("source_provenance")]
    public string? SourceProvenance { get; set; }

    [JsonPropertyName("compatibility_score")]
    public double? CompatibilityScore { get; set; }

    [JsonPropertyName("overlap_mode")]
    public string? OverlapMode { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}
