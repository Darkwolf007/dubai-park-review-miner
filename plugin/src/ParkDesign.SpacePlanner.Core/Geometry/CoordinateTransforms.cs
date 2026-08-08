using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Geometry;

public static class CoordinateTransforms
{
    public static GeographicPoint Utm40NToWgs84(Point2 point) => UtmToWgs84(point, 40, northernHemisphere: true);

    public static GeographicPoint UtmToWgs84(Point2 point, int zone, bool northernHemisphere)
    {
        if (zone is < 1 or > 60) throw new ArgumentOutOfRangeException(nameof(zone));
        const double semiMajorAxis = 6378137.0;
        const double eccentricitySquared = 0.00669438;
        const double scaleFactor = 0.9996;

        var x = point.X - 500000.0;
        var y = northernHemisphere ? point.Y : point.Y - 10000000.0;
        var eccentricityPrimeSquared = eccentricitySquared / (1 - eccentricitySquared);
        var meridionalArc = y / scaleFactor;
        var mu = meridionalArc / (semiMajorAxis * (1 - eccentricitySquared / 4 - 3 * Math.Pow(eccentricitySquared, 2) / 64 - 5 * Math.Pow(eccentricitySquared, 3) / 256));
        var e1 = (1 - Math.Sqrt(1 - eccentricitySquared)) / (1 + Math.Sqrt(1 - eccentricitySquared));
        var phi1 = mu
            + (3 * e1 / 2 - 27 * Math.Pow(e1, 3) / 32) * Math.Sin(2 * mu)
            + (21 * Math.Pow(e1, 2) / 16 - 55 * Math.Pow(e1, 4) / 32) * Math.Sin(4 * mu)
            + 151 * Math.Pow(e1, 3) / 96 * Math.Sin(6 * mu)
            + 1097 * Math.Pow(e1, 4) / 512 * Math.Sin(8 * mu);
        var sinPhi1 = Math.Sin(phi1);
        var cosPhi1 = Math.Cos(phi1);
        var tanPhi1 = Math.Tan(phi1);
        var n1 = semiMajorAxis / Math.Sqrt(1 - eccentricitySquared * sinPhi1 * sinPhi1);
        var t1 = tanPhi1 * tanPhi1;
        var c1 = eccentricityPrimeSquared * cosPhi1 * cosPhi1;
        var r1 = semiMajorAxis * (1 - eccentricitySquared) / Math.Pow(1 - eccentricitySquared * sinPhi1 * sinPhi1, 1.5);
        var d = x / (n1 * scaleFactor);

        var latitude = phi1 - (n1 * tanPhi1 / r1) *
            (d * d / 2
             - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eccentricityPrimeSquared) * Math.Pow(d, 4) / 24
             + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eccentricityPrimeSquared - 3 * c1 * c1) * Math.Pow(d, 6) / 720);
        var longitudeOffset =
            (d
             - (1 + 2 * t1 + c1) * Math.Pow(d, 3) / 6
             + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eccentricityPrimeSquared + 24 * t1 * t1) * Math.Pow(d, 5) / 120) / cosPhi1;
        var longitudeOrigin = (zone - 1) * 6 - 180 + 3;
        return new GeographicPoint(
            longitudeOrigin + longitudeOffset * 180 / Math.PI,
            latitude * 180 / Math.PI);
    }
}
