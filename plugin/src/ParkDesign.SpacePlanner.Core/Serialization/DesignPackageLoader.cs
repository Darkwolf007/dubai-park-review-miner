using System.Text.Json;
using System.IO.Compression;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Serialization;

public static class DesignPackageLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static DesignPackage LoadFile(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("A Park Design Package ZIP, extracted folder, or JSON path is required.", nameof(path));
        path = path.Trim().Trim('"');
        if (Directory.Exists(path))
            return LoadDirectory(path);
        if (!File.Exists(path) && File.Exists(path + ".zip"))
            path += ".zip";
        if (!File.Exists(path))
            throw new FileNotFoundException("The design package path does not exist. Select the downloaded .zip file or its extracted folder.", path);
        if (string.Equals(Path.GetExtension(path), ".zip", StringComparison.OrdinalIgnoreCase))
            return LoadZip(path);
        return LoadJson(File.ReadAllText(path));
    }

    private static DesignPackage LoadZip(string path)
    {
        using var archive = ZipFile.OpenRead(path);
        return LoadPackage(name => ReadEntry(archive, name));
    }

    private static DesignPackage LoadDirectory(string path)
    {
        return LoadPackage(name =>
        {
            var filePath = Path.Combine(path, name);
            if (!File.Exists(filePath))
                throw new InvalidDataException($"The extracted design package is missing {name}.");
            return File.ReadAllText(filePath);
        });
    }

    private static DesignPackage LoadPackage(Func<string, string> readFile)
    {
        var manifestJson = readFile("manifest.json");
        var package = JsonSerializer.Deserialize<DesignPackage>(manifestJson, Options)
            ?? throw new InvalidDataException("The package manifest is empty.");

        package.PackageBoundary = ReadSiteBoundary(readFile("site.json"));
        package.Programs = ReadPrograms(readFile, "area_programs.json");
        package.NodePrograms = ReadPrograms(readFile, "node_programs.json");
        package.RoutePrograms = ReadPrograms(readFile, "route_programs.json");
        package.Grid = JsonSerializer.Deserialize<GridDefinition>(readFile("grid.json"), Options)
            ?? new GridDefinition();
        package.Relationships = ReadRelationships(readFile);
        package.Unresolved = ReadUnresolved(readFile);
        package.AccessCandidates = ReadOptionalList<AccessCandidateDefinition>(readFile, "access_candidates.json", "candidates");
        package.AccessCandidatePairs = ReadOptionalList<AccessCandidatePairDefinition>(readFile, "access_pair_metrics.json", "pairs");
        package.MovementRequirements = ReadOptionalObject(readFile, "movement_requirements.json", new MovementRequirementsDefinition());
        package.TerrainRequirements = ReadOptionalObject(readFile, "terrain_requirements.json", new TerrainRequirementsDefinition());
        package.MasterplanSettings = ReadOptionalObject(readFile, "masterplan_settings.json", new MasterplanSettingsDefinition());
        package.ClimateMorphology = ReadOptionalObject(readFile, "climate_morphology.json", new ClimateMorphologyDefinition());
        package.PlantingStrategy = ReadOptionalObject(readFile, "planting_strategy.json", new PlantingStrategyDefinition());
        package.UserGroups = ReadOptionalList<UserGroupDefinition>(readFile, "user_program_suitability.json", "user_groups");
        package.UserProgramSuitability = ReadOptionalList<UserProgramSuitabilityDefinition>(readFile, "user_program_suitability.json", "suitability");
        package.ParametricRelationships = ReadOptionalList<ParametricRelationshipDefinition>(readFile, "parametric_relationships.json", "relationships");
        Normalize(package);
        return package;
    }

    private static List<T> ReadOptionalList<T>(Func<string, string> readFile, string fileName, string propertyName)
    {
        var json = TryReadOptional(readFile, fileName);
        if (json is null) return [];
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty(propertyName, out var values) || values.ValueKind != JsonValueKind.Array)
            return [];
        return JsonSerializer.Deserialize<List<T>>(values.GetRawText(), Options) ?? [];
    }

    private static T ReadOptionalObject<T>(Func<string, string> readFile, string fileName, T fallback) where T : class
    {
        var json = TryReadOptional(readFile, fileName);
        return json is null ? fallback : JsonSerializer.Deserialize<T>(json, Options) ?? fallback;
    }

    private static string? TryReadOptional(Func<string, string> readFile, string fileName)
    {
        try
        {
            return readFile(fileName);
        }
        catch (InvalidDataException)
        {
            return null;
        }
    }

    private static List<Point2> ReadSiteBoundary(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("boundary_utm", out var geometry)
            || !geometry.TryGetProperty("coordinates", out var rings)
            || rings.ValueKind != JsonValueKind.Array
            || rings.GetArrayLength() == 0)
            throw new InvalidDataException("site.json has no boundary_utm polygon.");
        var boundary = new List<Point2>();
        foreach (var coordinate in rings[0].EnumerateArray())
        {
            if (coordinate.ValueKind != JsonValueKind.Array || coordinate.GetArrayLength() < 2) continue;
            boundary.Add(new Point2(coordinate[0].GetDouble(), coordinate[1].GetDouble()));
        }
        if (boundary.Count > 1 && boundary[0] == boundary[^1]) boundary.RemoveAt(boundary.Count - 1);
        if (boundary.Count < 3) throw new InvalidDataException("site.json boundary_utm requires at least three distinct points.");
        return boundary;
    }

    private static string ReadEntry(ZipArchive archive, string name)
    {
        var entry = archive.GetEntry(name)
            ?? throw new InvalidDataException($"The design package is missing {name}.");
        using var reader = new StreamReader(entry.Open());
        return reader.ReadToEnd();
    }

    private static List<ProgramDefinition> ReadPrograms(Func<string, string> readFile, string name)
    {
        using var document = JsonDocument.Parse(readFile(name));
        if (!document.RootElement.TryGetProperty("programs", out var programs)) return [];
        return JsonSerializer.Deserialize<List<ProgramDefinition>>(programs.GetRawText(), Options) ?? [];
    }

    private static List<RelationshipDefinition> ReadRelationships(Func<string, string> readFile)
    {
        using var document = JsonDocument.Parse(readFile("relationships.json"));
        var relationships = new List<RelationshipDefinition>();
        if (document.RootElement.TryGetProperty("accepted_rule_edges", out var edges))
        foreach (var edge in edges.EnumerateArray())
        {
            JsonElement numericConstraint = default;
            var hasNumericConstraint = edge.TryGetProperty("numeric_constraint", out numericConstraint)
                && numericConstraint.ValueKind == JsonValueKind.Object;
            relationships.Add(new RelationshipDefinition
            {
                Id = ReadString(edge, "edge_id") ?? string.Empty,
                Source = ReadString(edge, "source_node_id") ?? string.Empty,
                Target = ReadString(edge, "target_node_id") ?? string.Empty,
                Type = ReadString(edge, "relationship_type") ?? "preferred",
                Mandatory = ReadBoolean(edge, "mandatory"),
                Accepted = string.Equals(ReadString(edge, "decision"), "accepted", StringComparison.OrdinalIgnoreCase),
                GraphLayer = ReadString(edge, "graph_layer") ?? "functional",
                Directed = ReadBoolean(edge, "directed"),
                NumericValue = hasNumericConstraint ? ReadDouble(numericConstraint, "value") : null,
                NumericUnit = hasNumericConstraint ? ReadString(numericConstraint, "unit") : null,
                NumericParameter = hasNumericConstraint ? ReadString(numericConstraint, "parameter") : null,
                Authority = "accepted_rule",
                SourceProvenance = ReadString(edge, "source") ?? ReadString(edge, "provenance")
            });
        }
        if (document.RootElement.TryGetProperty("advisory_relationships", out var advisories))
        foreach (var edge in advisories.EnumerateArray())
        {
            relationships.Add(new RelationshipDefinition
            {
                Id = ReadString(edge, "edge_id") ?? ReadString(edge, "id") ?? string.Empty,
                Source = ReadString(edge, "source_node_id") ?? ReadString(edge, "source_id") ?? ReadString(edge, "source") ?? string.Empty,
                Target = ReadString(edge, "target_node_id") ?? ReadString(edge, "target_id") ?? ReadString(edge, "target") ?? string.Empty,
                Type = ReadString(edge, "relationship_type") ?? ReadString(edge, "type") ?? "preferred",
                Mandatory = ReadBoolean(edge, "mandatory"), Accepted = ReadBoolean(edge, "accepted"),
                Authority = ReadString(edge, "authority") ?? "advisory",
                GraphLayer = ReadString(edge, "graph_layer") ?? "design_intelligence",
                Directed = ReadBoolean(edge, "directed"), Confidence = ReadDouble(edge, "confidence"),
                SourceProvenance = ReadString(edge, "source_provenance") ?? ReadString(edge, "provenance"),
                CompatibilityScore = ReadDouble(edge, "compatibility_score"),
                OverlapMode = ReadString(edge, "overlap_mode"), Reason = ReadString(edge, "reason")
            });
        }
        if (document.RootElement.TryGetProperty("designer_relationships", out var designerRelationships))
        foreach (var edge in designerRelationships.EnumerateArray())
        {
            relationships.Add(new RelationshipDefinition
            {
                Id = ReadString(edge, "edge_id") ?? ReadString(edge, "id") ?? string.Empty,
                Source = ReadString(edge, "source_node_id") ?? ReadString(edge, "source") ?? string.Empty,
                Target = ReadString(edge, "target_node_id") ?? ReadString(edge, "target") ?? string.Empty,
                Type = ReadString(edge, "relationship_type") ?? ReadString(edge, "type") ?? "preferred",
                Mandatory = ReadBoolean(edge, "mandatory"), Accepted = true,
                Authority = ReadString(edge, "authority") ?? "designer_approved_competition_input",
                GraphLayer = ReadString(edge, "graph_layer") ?? "designer_intelligence",
                Directed = ReadBoolean(edge, "directed"), Confidence = ReadDouble(edge, "confidence") ?? 1,
                SourceProvenance = ReadString(edge, "source_provenance") ?? ReadString(edge, "provenance"),
                CompatibilityScore = ReadDouble(edge, "compatibility_score"),
                OverlapMode = ReadString(edge, "overlap_mode"), Reason = ReadString(edge, "reason")
            });
        }
        return relationships.Where(relationship => relationship.Accepted || relationship.Authority == "advisory").ToList();
    }

    private static List<string> ReadUnresolved(Func<string, string> readFile)
    {
        using var document = JsonDocument.Parse(readFile("unresolved.json"));
        if (!document.RootElement.TryGetProperty("rules", out var rules)) return [];
        return rules.EnumerateArray().Select(rule =>
        {
            var id = ReadString(rule, "rule_id") ?? "unknown-rule";
            var reason = ReadString(rule, "reason") ?? "unresolved";
            return $"{id}: {reason}";
        }).ToList();
    }

    public static DesignPackage LoadJson(string json)
    {
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions
        {
            AllowTrailingCommas = true,
            CommentHandling = JsonCommentHandling.Skip
        });

        var root = document.RootElement;
        if (root.TryGetProperty("program_spaces", out var legacyPrograms))
            return AdaptLegacyManifest(root, legacyPrograms);

        var package = JsonSerializer.Deserialize<DesignPackage>(json, Options)
            ?? throw new InvalidDataException("The design package is empty.");
        Normalize(package);
        return package;
    }

    private static DesignPackage AdaptLegacyManifest(JsonElement root, JsonElement programs)
    {
        var package = new DesignPackage
        {
            AdaptedFromLegacyManifest = true,
            SchemaVersion = "legacy-results-manifest",
            CoordinateSystem = new CoordinateSystemDefinition
            {
                Crs = ReadString(root, "projection") ?? "EPSG:32640",
                Units = ReadString(root, "units") ?? "meters"
            }
        };

        foreach (var item in programs.EnumerateArray())
        {
            var id = ReadString(item, "space_id") ?? string.Empty;
            package.Programs.Add(new ProgramDefinition
            {
                Id = id,
                Name = ReadString(item, "space_name") ?? id,
                TargetAreaM2 = ReadDouble(item, "target_area_m2"),
                LocationZone = ReadString(item, "location_zone") ?? "INNER_BUFFER",
                AreaStatus = "exported_legacy_assumption",
                Selected = true
            });
        }

        Normalize(package);
        return package;
    }

    private static void Normalize(DesignPackage package)
    {
        package.Project ??= new ProjectDefinition();
        package.CoordinateSystem ??= new CoordinateSystemDefinition();
        package.Grid ??= new GridDefinition();
        package.Programs ??= [];
        package.NodePrograms ??= [];
        package.RoutePrograms ??= [];
        package.Relationships ??= [];
        package.Unresolved ??= [];
        package.PackageBoundary ??= [];
        package.AccessCandidates ??= [];
        package.AccessCandidatePairs ??= [];
        package.MovementRequirements ??= new MovementRequirementsDefinition();
        package.TerrainRequirements ??= new TerrainRequirementsDefinition();
        package.MasterplanSettings ??= new MasterplanSettingsDefinition();
        package.ClimateMorphology ??= new ClimateMorphologyDefinition();
        package.PlantingStrategy ??= new PlantingStrategyDefinition();
        package.UserGroups ??= [];
        package.UserProgramSuitability ??= [];
        package.ParametricRelationships ??= [];

        foreach (var program in package.Programs)
        {
            if (string.IsNullOrWhiteSpace(program.Name)) program.Name = program.Id;
            if (string.IsNullOrWhiteSpace(program.LocationZone))
                program.LocationZone = package.AdaptedFromLegacyManifest ? "INNER_BUFFER" : "UNSPECIFIED";
            if (string.IsNullOrWhiteSpace(program.RepresentationStatus))
                program.RepresentationStatus = program.TargetAreaM2 is > 0
                    ? "quantified_area"
                    : program.SpatialMode == "overlay" ? "landscape_overlay_intent" : "area_intent_anchor";
            if (string.IsNullOrWhiteSpace(program.PlacementStatus))
                program.PlacementStatus = program.TargetAreaM2 is > 0
                    ? "place_as_area_territory"
                    : program.SpatialMode == "overlay" ? "represent_as_overlapping_landscape_system" : "represent_as_ranked_intent_anchor";
        }
    }

    private static string? ReadString(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static double? ReadDouble(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;

    private static bool ReadBoolean(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False && value.GetBoolean();
}
