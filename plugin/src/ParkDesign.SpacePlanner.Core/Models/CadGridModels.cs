namespace ParkDesign.SpacePlanner.Core.Models;

public sealed record CadGridFeature(
    string CellId,
    string SourceLayer,
    IReadOnlyList<Point2> Ring,
    double AreaM2);

public readonly record struct GeographicPoint(double Longitude, double Latitude);
