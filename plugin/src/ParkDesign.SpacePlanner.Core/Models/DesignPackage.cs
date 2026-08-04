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

    [JsonPropertyName("relationships")]
    public List<RelationshipDefinition> Relationships { get; set; } = [];

    [JsonPropertyName("unresolved")]
    public List<string> Unresolved { get; set; } = [];

    [JsonIgnore]
    public bool AdaptedFromLegacyManifest { get; set; }
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
    public string LocationZone { get; set; } = "INNER_BUFFER";

    [JsonPropertyName("priority")]
    public double Priority { get; set; } = 0.5;

    [JsonPropertyName("selected")]
    public bool Selected { get; set; } = true;

    [JsonPropertyName("suitability_field")]
    public string? SuitabilityField { get; set; }

    [JsonPropertyName("area_status")]
    public string AreaStatus { get; set; } = "designer_approved";
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
}
