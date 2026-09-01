using System.Text.Json.Serialization;

namespace ParkDesign.SpacePlanner.Core.Models;

public sealed class ClimateMorphologyDefinition
{
    [JsonPropertyName("authority")]
    public string Authority { get; set; } = string.Empty;

    [JsonPropertyName("site_axes")]
    public SiteAxesDefinition SiteAxes { get; set; } = new();

    [JsonPropertyName("baraha_rules")]
    public BarahaRulesDefinition BarahaRules { get; set; } = new();

    [JsonPropertyName("terrain_rules")]
    public MorphologyTerrainRulesDefinition TerrainRules { get; set; } = new();

    [JsonPropertyName("coordinate_transform")]
    public ObjCoordinateTransformDefinition CoordinateTransform { get; set; } = new();
}

public sealed class SiteAxesDefinition
{
    [JsonPropertyName("principal_long_axis_azimuth_deg_from_north")]
    public double PrincipalLongAxisAzimuthDegFromNorth { get; set; }

    [JsonPropertyName("primary_sikka")]
    public MorphologyAxisDefinition PrimarySikka { get; set; } = new();

    [JsonPropertyName("ventilation_cuts")]
    public List<MorphologyAxisDefinition> VentilationCuts { get; set; } = [];
}

public sealed class MorphologyAxisDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("azimuth_deg_from_north")]
    public double AzimuthDegFromNorth { get; set; }

    [JsonPropertyName("offset_m")]
    public double OffsetM { get; set; }

    [JsonPropertyName("basis")]
    public string Basis { get; set; } = string.Empty;
}

public sealed class BarahaRulesDefinition
{
    [JsonPropertyName("generator")]
    public string Generator { get; set; } = "movement_route_intersection";

    [JsonPropertyName("minimum_distinct_routes")]
    public int MinimumDistinctRoutes { get; set; } = 2;

    [JsonPropertyName("cluster_distance_m")]
    public double ClusterDistanceM { get; set; } = 6;

    [JsonPropertyName("minimum_radius_m")]
    public double MinimumRadiusM { get; set; } = 6;

    [JsonPropertyName("maximum_radius_m")]
    public double MaximumRadiusM { get; set; } = 14;

    [JsonPropertyName("social_program_ids")]
    public List<string> SocialProgramIds { get; set; } = [];

    [JsonPropertyName("designer_review_required")]
    public bool DesignerReviewRequired { get; set; } = true;
}

public sealed class MorphologyTerrainRulesDefinition
{
    [JsonPropertyName("existing_ground_character")]
    public string ExistingGroundCharacter { get; set; } = string.Empty;

    [JsonPropertyName("observed_relief_m")]
    public double? ObservedReliefM { get; set; }

    [JsonPropertyName("preferred_landscape_ridge_height_m")]
    public NumericRangeDefinition PreferredLandscapeRidgeHeightM { get; set; } = new();

    [JsonPropertyName("architectural_ridge_height_m")]
    public NumericRangeDefinition ArchitecturalRidgeHeightM { get; set; } = new();

    [JsonPropertyName("hollow_policy")]
    public string HollowPolicy { get; set; } = string.Empty;

    [JsonPropertyName("cut_fill_balance_required")]
    public bool CutFillBalanceRequired { get; set; }
}

public sealed class NumericRangeDefinition
{
    [JsonPropertyName("minimum")]
    public double Minimum { get; set; }

    [JsonPropertyName("maximum")]
    public double Maximum { get; set; }
}

public sealed class ObjCoordinateTransformDefinition
{
    [JsonPropertyName("obj_axis_convention")]
    public string ObjAxisConvention { get; set; } = string.Empty;

    [JsonPropertyName("utm_easting")]
    public string UtmEasting { get; set; } = string.Empty;

    [JsonPropertyName("utm_northing")]
    public string UtmNorthing { get; set; } = string.Empty;

    [JsonPropertyName("elevation")]
    public string Elevation { get; set; } = string.Empty;
}

public sealed class PlantingStrategyDefinition
{
    [JsonPropertyName("source_file")]
    public string SourceFile { get; set; } = string.Empty;

    [JsonPropertyName("source_authority")]
    public string SourceAuthority { get; set; } = string.Empty;

    [JsonPropertyName("automation_policy")]
    public string AutomationPolicy { get; set; } = string.Empty;

    [JsonPropertyName("hydrozones")]
    public List<HydrozoneDefinition> Hydrozones { get; set; } = [];

    [JsonPropertyName("optimization_objectives")]
    public List<string> OptimizationObjectives { get; set; } = [];

    [JsonPropertyName("required_unverified_fields")]
    public List<string> RequiredUnverifiedFields { get; set; } = [];
}

public sealed class HydrozoneDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("water_demand")]
    public string WaterDemand { get; set; } = string.Empty;

    [JsonPropertyName("morphology")]
    public string Morphology { get; set; } = string.Empty;
}

public sealed record MorphologyAxisPlacement(string Id, string Role, IReadOnlyList<Point2> Points,
    double AzimuthDegFromNorth, string Basis);

public sealed record BarahaCandidate(Point2 Point, double RadiusM, IReadOnlyList<string> RouteProgramIds,
    double Score, string Basis);
