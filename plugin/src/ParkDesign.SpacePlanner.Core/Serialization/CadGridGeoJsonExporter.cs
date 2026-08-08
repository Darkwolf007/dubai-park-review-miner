using System.Text.Json;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Serialization;

public static class CadGridGeoJsonExporter
{
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public static string SerializeUtm(IEnumerable<CadGridFeature> cells)
    {
        var features = cells.Select(cell => Feature(cell, cell.Ring.Select(point => new[] { point.X, point.Y }).ToArray())).ToArray();
        return JsonSerializer.Serialize(new
        {
            type = "FeatureCollection",
            name = "authoritative_cad_analysis_grid",
            crs = new { type = "name", properties = new { name = "EPSG:32640" } },
            features
        }, Options);
    }

    public static string SerializeWgs84(IEnumerable<CadGridFeature> cells)
    {
        var features = cells.Select(cell => Feature(cell, cell.Ring.Select(point =>
        {
            var geographic = CoordinateTransforms.Utm40NToWgs84(point);
            return new[] { geographic.Longitude, geographic.Latitude };
        }).ToArray())).ToArray();
        return JsonSerializer.Serialize(new
        {
            type = "FeatureCollection",
            name = "authoritative_cad_analysis_grid",
            features
        }, Options);
    }

    private static object Feature(CadGridFeature cell, double[][] ring)
    {
        var centroid = PolygonMath.Centroid(cell.Ring.Count > 1 && cell.Ring[0] == cell.Ring[^1] ? cell.Ring.Take(cell.Ring.Count - 1).ToList() : cell.Ring);
        return new
        {
            type = "Feature",
            id = cell.CellId,
            properties = new
            {
                cell_id = cell.CellId,
                source_layer = cell.SourceLayer,
                area_m2 = cell.AreaM2,
                centroid_x = centroid.X,
                centroid_y = centroid.Y,
                analysis_grid_authority = "designer_cad",
                coordinate_source = "rhino_model_epsg_32640"
            },
            geometry = new { type = "Polygon", coordinates = new[] { ring } }
        };
    }
}
