using System.Text.Json;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Serialization;

public static class CadGridGeoJsonLoader
{
    public static GridDefinition LoadFile(string path, GridDefinition? scoreSource = null)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A CAD grid UTM GeoJSON path is required.", nameof(path));
        path = path.Trim().Trim('"');
        if (!File.Exists(path)) throw new FileNotFoundException("CAD grid GeoJSON does not exist.", path);
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (!root.TryGetProperty("features", out var features) || features.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("CAD grid GeoJSON has no features array.");

        var cells = new List<GridCell>();
        foreach (var feature in features.EnumerateArray())
        {
            if (!feature.TryGetProperty("geometry", out var geometry)
                || !geometry.TryGetProperty("type", out var type)
                || type.GetString() != "Polygon"
                || !geometry.TryGetProperty("coordinates", out var coordinates)
                || coordinates.GetArrayLength() == 0)
                continue;
            var ring = coordinates[0].EnumerateArray()
                .Where(coordinate => coordinate.ValueKind == JsonValueKind.Array && coordinate.GetArrayLength() >= 2)
                .Select(coordinate => new Point2(coordinate[0].GetDouble(), coordinate[1].GetDouble()))
                .ToList();
            if (ring.Count < 4) continue;
            if (ring[0] == ring[^1]) ring.RemoveAt(ring.Count - 1);
            if (ring.Count < 3) continue;
            if (ring.Any(point => Math.Abs(point.X) <= 180 && Math.Abs(point.Y) <= 90))
                throw new InvalidDataException("CAD Grid GeoJSON appears to be EPSG:4326. ParkBubbles requires the *_utm.geojson EPSG:32640 file.");
            var centroid = PolygonMath.Centroid(ring);
            var properties = feature.TryGetProperty("properties", out var propertyElement) ? propertyElement : default;
            var id = ReadString(properties, "cell_id")
                ?? (feature.TryGetProperty("id", out var idElement) ? idElement.ToString() : null)
                ?? $"cad-grid-{cells.Count + 1:0000}";
            var nearest = scoreSource?.Cells.Count > 0
                ? scoreSource.Cells.OrderBy(item => PolygonMath.Distance(centroid, new Point2(item.X, item.Y))).First()
                : null;
            cells.Add(new GridCell
            {
                Id = id,
                X = centroid.X,
                Y = centroid.Y,
                Constraint = nearest?.Constraint ?? false,
                Scores = nearest is null ? [] : new Dictionary<string, double?>(nearest.Scores, StringComparer.Ordinal),
                ProgramConstraints = nearest is null ? [] : new Dictionary<string, string>(nearest.ProgramConstraints, StringComparer.Ordinal),
                Ring = ring,
                AreaM2 = ReadDouble(properties, "area_m2") ?? Math.Abs(PolygonMath.SignedArea(ring)),
                SourceLayer = ReadString(properties, "source_layer"),
                GridAuthority = ReadString(properties, "analysis_grid_authority") ?? "designer_cad"
            });
        }
        if (cells.Count == 0) throw new InvalidDataException("CAD Grid GeoJSON contains no valid EPSG:32640 Polygon cells.");
        return new GridDefinition { Cells = cells };
    }

    private static string? ReadString(JsonElement item, string name) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static double? ReadDouble(JsonElement item, string name) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;
}
