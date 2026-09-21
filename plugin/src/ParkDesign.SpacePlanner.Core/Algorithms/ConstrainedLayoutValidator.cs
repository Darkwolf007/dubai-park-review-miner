using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class ConstrainedLayoutValidator
{
    public static List<string> Validate(IReadOnlyList<Point2> boundary,
        IReadOnlyList<RectanglePlacement> rectangles, double netAreaToleranceRatio = .02,
        double minimumArrivalSharedEdgeM = 8)
    {
        var diagnostics = new List<string>();
        foreach (var rectangle in rectangles)
        {
            var aspect = Math.Min(rectangle.WidthM, rectangle.HeightM) / Math.Max(rectangle.WidthM, rectangle.HeightM);
            if (aspect + 1e-6 < .75)
                diagnostics.Add($"ASPECT_RATIO_FAILED: '{rectangle.ProgramId}' is {rectangle.WidthM:0.##}:{rectangle.HeightM:0.##}; minimum short-to-long ratio is 3:4.");
            if (rectangle.Corners.Any(point => !PolygonMath.Contains(boundary, point)
                    && PolygonMath.DistanceToBoundary(boundary, point) > .01))
                diagnostics.Add($"OUTSIDE_SITE: '{rectangle.ProgramId}' extends beyond the site.");
            var minimumNet = rectangle.TargetUsableAreaM2 * (1 - netAreaToleranceRatio);
            if (rectangle.NetUsableAreaM2 + .01 < minimumNet)
                diagnostics.Add($"NET_AREA_DEFICIT: '{rectangle.ProgramId}' provides {rectangle.NetUsableAreaM2:0.##} m2 against {rectangle.TargetUsableAreaM2:0.##} m2 target.");
        }
        for (var a = 0; a < rectangles.Count; a++)
        for (var b = a + 1; b < rectangles.Count; b++)
            if (ConstrainedRectanglePacker.Overlaps(rectangles[a], rectangles[b]))
                diagnostics.Add($"OVERLAP: '{rectangles[a].ProgramId}' intersects '{rectangles[b].ProgramId}'.");
        var main = rectangles.FirstOrDefault(rectangle => rectangle.ProgramId.Contains("mainEntrance", StringComparison.OrdinalIgnoreCase)
            || rectangle.ProgramName.Contains("Main Entrance", StringComparison.OrdinalIgnoreCase));
        var drop = rectangles.FirstOrDefault(rectangle => rectangle.ProgramId.Contains("dropOff", StringComparison.OrdinalIgnoreCase)
            || rectangle.ProgramName.Contains("Drop-off", StringComparison.OrdinalIgnoreCase));
        if (main is not null && drop is not null)
        {
            var shared = SharedBoundaryLength(main, drop);
            if (shared + .01 < minimumArrivalSharedEdgeM)
                diagnostics.Add($"ARRIVAL_SHARED_EDGE_FAILED: Drop-off shares {shared:0.##}m with Main Entrance Plaza; {minimumArrivalSharedEdgeM:0.##}m is required.");
        }
        return diagnostics;
    }

    public static double SharedBoundaryLength(RectanglePlacement a, RectanglePlacement b)
    {
        var total = 0d;
        var left = a.Corners; var right = b.Corners;
        for (var i = 0; i < left.Count; i++)
        for (var j = 0; j < right.Count; j++)
        {
            var p = left[i]; var q = left[(i + 1) % left.Count];
            var r = right[j]; var s = right[(j + 1) % right.Count];
            var dx = q.X - p.X; var dy = q.Y - p.Y; var length = Math.Sqrt(dx * dx + dy * dy);
            if (length <= 1e-9) continue;
            var crossR = Math.Abs(dx * (r.Y - p.Y) - dy * (r.X - p.X)) / length;
            var crossS = Math.Abs(dx * (s.Y - p.Y) - dy * (s.X - p.X)) / length;
            if (crossR > .01 || crossS > .01) continue;
            var ux = dx / length; var uy = dy / length;
            var rProjection = (r.X - p.X) * ux + (r.Y - p.Y) * uy;
            var sProjection = (s.X - p.X) * ux + (s.Y - p.Y) * uy;
            var overlap = Math.Max(0, Math.Min(length, Math.Max(rProjection, sProjection)) - Math.Max(0, Math.Min(rProjection, sProjection)));
            total += overlap;
        }
        return total;
    }
}
