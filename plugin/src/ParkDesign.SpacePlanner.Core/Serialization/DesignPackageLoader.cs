using System.Text.Json;
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
            throw new ArgumentException("A design-package JSON path is required.", nameof(path));
        return LoadJson(File.ReadAllText(path));
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
        package.Relationships ??= [];
        package.Unresolved ??= [];

        foreach (var program in package.Programs)
        {
            if (string.IsNullOrWhiteSpace(program.Name)) program.Name = program.Id;
            if (string.IsNullOrWhiteSpace(program.LocationZone)) program.LocationZone = "INNER_BUFFER";
        }
    }

    private static string? ReadString(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static double? ReadDouble(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;
}
