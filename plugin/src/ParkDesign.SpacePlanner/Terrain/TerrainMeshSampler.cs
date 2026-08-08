using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace ParkDesign.SpacePlanner.Terrain;

internal readonly record struct TerrainSample(Point3d Point, double SlopePercent, double AspectDegrees);

internal sealed record RouteTerrainResult(
    PolylineCurve Curve,
    double HorizontalLength,
    double TerrainLength,
    double ElevationGain,
    double ElevationLoss,
    double MaximumSlopePercent,
    double AverageSlopePercent,
    double SlopeViolationLength);

internal static class TerrainMeshSampler
{
    public static bool TrySample(Mesh mesh, double x, double y, out TerrainSample sample)
    {
        sample = default;
        if (mesh.Vertices.Count == 0 || mesh.Faces.Count == 0) return false;
        var box = mesh.GetBoundingBox(true);
        var margin = Math.Max(1, box.Diagonal.Length);
        var ray = new Ray3d(new Point3d(x, y, box.Max.Z + margin), -Vector3d.ZAxis);
        var distance = Intersection.MeshRay(mesh, ray);
        if (distance < 0) return false;
        var point = ray.PointAt(distance);
        var meshPoint = mesh.ClosestMeshPoint(point, Math.Max(0.001, margin * 1e-7));
        if (meshPoint is null) return false;
        var normal = mesh.NormalAt(meshPoint);
        if (!normal.Unitize()) return false;
        if (normal.Z < 0) normal.Reverse();
        var horizontal = Math.Sqrt(normal.X * normal.X + normal.Y * normal.Y);
        var slopePercent = Math.Abs(normal.Z) < 1e-12 ? double.PositiveInfinity : horizontal / Math.Abs(normal.Z) * 100;
        var aspect = Math.Atan2(normal.X, normal.Y) * 180 / Math.PI;
        if (aspect < 0) aspect += 360;
        sample = new TerrainSample(point, slopePercent, aspect);
        return true;
    }

    public static List<TerrainSample> SampleGrid(Mesh mesh, double spacing, int maximumSamples = 250000)
    {
        var box = mesh.GetBoundingBox(true);
        var xCount = Math.Max(1, (int)Math.Ceiling((box.Max.X - box.Min.X) / spacing));
        var yCount = Math.Max(1, (int)Math.Ceiling((box.Max.Y - box.Min.Y) / spacing));
        if ((long)xCount * yCount > maximumSamples)
            throw new InvalidOperationException($"Terrain sampling would create more than {maximumSamples:N0} candidates. Increase Grid Spacing.");
        var samples = new List<TerrainSample>();
        for (var ix = 0; ix < xCount; ix++)
        for (var iy = 0; iy < yCount; iy++)
        {
            var x = box.Min.X + Math.Min(box.Max.X - box.Min.X, (ix + 0.5) * spacing);
            var y = box.Min.Y + Math.Min(box.Max.Y - box.Min.Y, (iy + 0.5) * spacing);
            if (TrySample(mesh, x, y, out var sample)) samples.Add(sample);
        }
        return samples;
    }

    public static RouteTerrainResult SampleRoute(Mesh mesh, Curve curve, double spacing, double? maximumSlopePercent)
    {
        var parameters = curve.DivideByLength(spacing, true)?.ToList() ?? [];
        if (parameters.Count == 0 || Math.Abs(parameters[0] - curve.Domain.T0) > 1e-9) parameters.Insert(0, curve.Domain.T0);
        if (Math.Abs(parameters[^1] - curve.Domain.T1) > 1e-9) parameters.Add(curve.Domain.T1);
        var points = new List<Point3d>();
        foreach (var parameter in parameters)
        {
            var source = curve.PointAt(parameter);
            if (TrySample(mesh, source.X, source.Y, out var sample)) points.Add(sample.Point);
        }
        if (points.Count < 2) throw new InvalidOperationException("A route has fewer than two terrain-projected samples.");

        var horizontalLength = 0d;
        var terrainLength = 0d;
        var gain = 0d;
        var loss = 0d;
        var maximumSlope = 0d;
        var weightedSlope = 0d;
        var violationLength = 0d;
        for (var index = 0; index < points.Count - 1; index++)
        {
            var a = points[index];
            var b = points[index + 1];
            var dx = b.X - a.X;
            var dy = b.Y - a.Y;
            var dz = b.Z - a.Z;
            var horizontal = Math.Sqrt(dx * dx + dy * dy);
            var length = Math.Sqrt(horizontal * horizontal + dz * dz);
            var slope = horizontal <= 1e-9 ? double.PositiveInfinity : Math.Abs(dz) / horizontal * 100;
            horizontalLength += horizontal;
            terrainLength += length;
            if (dz > 0) gain += dz; else loss += -dz;
            maximumSlope = Math.Max(maximumSlope, slope);
            weightedSlope += slope * horizontal;
            if (maximumSlopePercent is not null && slope > maximumSlopePercent.Value) violationLength += horizontal;
        }
        var averageSlope = horizontalLength <= 1e-9 ? 0 : weightedSlope / horizontalLength;
        return new RouteTerrainResult(
            new PolylineCurve(points), horizontalLength, terrainLength, gain, loss,
            maximumSlope, averageSlope, violationLength);
    }
}
