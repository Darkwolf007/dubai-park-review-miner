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
    public List<AccessCandidateDefinition> AccessCandidates { get; set; } = [];

    [JsonIgnore]
    public List<AccessCandidatePairDefinition> AccessCandidatePairs { get; set; } = [];

    [JsonIgnore]
    public MovementRequirementsDefinition MovementRequirements { get; set; } = new();

    [JsonIgnore]
    public TerrainRequirementsDefinition TerrainRequirements { get; set; } = new();

    [JsonIgnore]
    public MasterplanSettingsDefinition MasterplanSettings { get; set; } = new();
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

    [JsonPropertyName("suitability_field")]
    public string? SuitabilityField { get; set; }

    [JsonPropertyName("area_status")]
    public string AreaStatus { get; set; } = "designer_approved";

    [JsonPropertyName("attractors")]
    public List<string> Attractors { get; set; } = [];

    [JsonPropertyName("repellers")]
    public List<string> Repellers { get; set; } = [];

    [JsonPropertyName("constraints")]
    public List<string> Constraints { get; set; } = [];
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
}
