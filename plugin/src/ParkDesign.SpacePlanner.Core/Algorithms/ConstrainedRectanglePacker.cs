using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class ConstrainedRectanglePacker
{
    private const double Tolerance = 1e-6;

    public static ConstrainedPackingResult Pack(ConstrainedPackingInput input, ConstrainedPackingOptions? options = null)
    {
        options ??= new();
        if (input.Boundary.Count < 3) throw new ArgumentException("A site boundary with at least three points is required.", nameof(input));
        if (input.PublicEntranceEdges.Count < 2) throw new ArgumentException("Two public entrance edges are required.", nameof(input));
        if (options.AlternativeCount is < 1 or > 20) throw new ArgumentOutOfRangeException(nameof(options));

        var alternatives = new PackedLayoutAlternative[options.AlternativeCount];
        Parallel.For(0, options.AlternativeCount, alternativeIndex =>
            alternatives[alternativeIndex] = PackAlternative(input, options, alternativeIndex));
        var result = new ConstrainedPackingResult { Alternatives = alternatives.ToList() };
        result.Alternatives.Sort((a, b) =>
        {
            var validity = b.Valid.CompareTo(a.Valid);
            return validity != 0 ? validity : b.Score.CompareTo(a.Score);
        });
        return result;
    }

    private static PackedLayoutAlternative PackAlternative(ConstrainedPackingInput input, ConstrainedPackingOptions options, int alternativeIndex)
    {
        var seed = DeterministicSeed.Derive(options.MasterSeed, "layout", alternativeIndex);
        var diagnostics = new List<string>();
        var rectangles = new List<RectanglePlacement>();
        var centroid = PolygonMath.Centroid(input.Boundary);
        var mainEdge = input.PublicEntranceEdges[alternativeIndex % input.PublicEntranceEdges.Count];
        var secondaryEdge = input.PublicEntranceEdges[(alternativeIndex + 1) % input.PublicEntranceEdges.Count];
        var mainT = 0.12 + 0.76 * DeterministicSeed.Unit(seed, "main-entrance-position");
        var secondaryT = 0.12 + 0.76 * DeterministicSeed.Unit(seed, "secondary-entrance-position");
        var mainEntrance = Lerp(mainEdge.A, mainEdge.B, mainT);
        var secondaryEntrance = Lerp(secondaryEdge.A, secondaryEdge.B, secondaryT);
        var mainProgram = FindProgram(input.Programs, "mainEntrancePlaza", "main entrance", "gateway");
        var dropProgram = FindProgram(input.Programs, "dropOffZone", "drop-off", "arrival");
        var operationsProgram = FindProgram(input.Programs, "operationsArea", "operation", "maintenance");

        if (mainProgram is not null)
        {
            var mainRectangle = BoundaryRectangle(mainProgram, mainEdge, mainEntrance, centroid,
                options.MinimumArrivalSharedEdgeM, options.GrossAreaReserveRatio, "main_arrival_locked");
            if (Fits(mainRectangle, input.Boundary, rectangles)) rectangles.Add(mainRectangle);
            else diagnostics.Add("MAIN_ENTRANCE_PLACEMENT_FAILED: The seeded main entrance rectangle does not fit the site.");

            if (dropProgram is not null && rectangles.Contains(mainRectangle))
            {
                var drop = TouchingBoundaryRectangle(dropProgram, mainRectangle, mainEdge, centroid,
                    input.Boundary, rectangles, options.MinimumArrivalSharedEdgeM, options.GrossAreaReserveRatio);
                if (drop is not null) rectangles.Add(drop);
                else diagnostics.Add("DROP_OFF_TOUCH_FAILED: No inside-site rectangle could provide the required shared edge with Main Entrance Plaza.");
            }
        }
        else diagnostics.Add("MAIN_ENTRANCE_PROGRAM_MISSING: mainEntrancePlaza was not supplied.");

        var secondaryProgram = FindProgram(input.Programs, "secondaryEntrancePlaza", "secondary entrance plaza");
        secondaryProgram ??= new PackingProgram("secondaryEntrancePlaza", "Secondary Entrance Plaza",
            options.SecondaryEntrancePlazaAreaM2, .9, .75, 4d / 3d, true);
        var secondaryRectangle = BoundaryRectangle(secondaryProgram, secondaryEdge, secondaryEntrance, centroid,
            Math.Min(6, options.MinimumArrivalSharedEdgeM), options.GrossAreaReserveRatio, "secondary_arrival_locked");
        if (Fits(secondaryRectangle, input.Boundary, rectangles)) rectangles.Add(secondaryRectangle);
        else diagnostics.Add("SECONDARY_ENTRANCE_PLACEMENT_FAILED: The small entrance plaza does not fit at its seeded position.");

        string? operationsZoneId = null;
        var serviceEntrance = mainEntrance;
        if (operationsProgram is not null)
        {
            var rankedZones = input.OperationsCandidateZones
                .OrderByDescending(zone => ZoneScore(zone, operationsProgram, mainEntrance, seed))
                .ThenBy(zone => zone.Id, StringComparer.Ordinal).ToList();
            foreach (var zone in rankedZones)
            {
                var rectangle = RectangleInZone(operationsProgram, zone, input.Boundary, rectangles,
                    SiteAxisDegrees(input.Boundary), options.GrossAreaReserveRatio);
                if (rectangle is null) continue;
                rectangles.Add(rectangle);
                operationsZoneId = zone.Id;
                serviceEntrance = ClosestPoint(input.PublicEntranceEdges, rectangle.Center);
                break;
            }
            if (operationsZoneId is null)
                diagnostics.Add("OPERATIONS_CANDIDATE_FAILED: Operations did not fit either designer candidate curve.");
        }

        var alreadyPlaced = rectangles.Select(item => item.ProgramId).ToHashSet(StringComparer.Ordinal);
        var remaining = input.Programs.Where(program => !alreadyPlaced.Contains(program.Id))
            .OrderByDescending(program => program.Priority)
            .ThenByDescending(program => program.TargetUsableAreaM2)
            .ThenBy(program => program.Id, StringComparer.Ordinal).ToList();
        var axis = SiteAxisDegrees(input.Boundary);
        var treemapSeeds = SpatialTreemapSeeder.Seed(input.Boundary, remaining, options.GrossAreaReserveRatio, seed);
        foreach (var program in remaining)
        {
            var rectangle = FindPackedRectangle(program, input.Boundary, rectangles, axis,
                options.GrossAreaReserveRatio, seed, options.CandidateSamples, options.FeasibleCandidateLimit,
                treemapSeeds.GetValueOrDefault(program.Id));
            if (rectangle is not null) rectangles.Add(rectangle);
            else if (program.Required) diagnostics.Add($"PROGRAM_UNPLACED: '{program.Id}' could not be packed without overlap.");
        }

        var validation = ConstrainedLayoutValidator.Validate(input.Boundary, rectangles, options.NetAreaToleranceRatio);
        diagnostics.AddRange(validation);
        var requiredIds = input.Programs.Where(item => item.Required).Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        requiredIds.Add("secondaryEntrancePlaza");
        var missingRequired = requiredIds.Except(rectangles.Select(item => item.ProgramId), StringComparer.Ordinal).ToList();
        foreach (var id in missingRequired) diagnostics.Add($"REQUIRED_PROGRAM_MISSING: '{id}'.");
        var parkingDistance = input.ParkingBay.Count == 0 ? 100 : input.ParkingBay.Min(point => PolygonMath.Distance(point, mainEntrance));
        var parkingScore = 1 / (1 + parkingDistance / 20d);
        var placedRatio = requiredIds.Count == 0 ? 1 : (double)(requiredIds.Count - missingRequired.Count) / requiredIds.Count;
        var siteArea = Math.Abs(PolygonMath.SignedArea(input.Boundary));
        var fillRatio = siteArea <= 0 ? 0 : Math.Min(1, rectangles.Sum(item => item.GrossAreaM2) / siteArea);
        var valid = diagnostics.All(message => !IsHardDiagnostic(message));
        return new PackedLayoutAlternative
        {
            AlternativeIndex = alternativeIndex,
            Seed = seed,
            Rectangles = rectangles,
            MainEntrance = mainEntrance,
            SecondaryEntrance = secondaryEntrance,
            ServiceEntrance = serviceEntrance,
            MainEntranceEdgeId = mainEdge.Id,
            SecondaryEntranceEdgeId = secondaryEdge.Id,
            OperationsCandidateZoneId = operationsZoneId,
            Valid = valid,
            Score = 100 * (0.45 * placedRatio + 0.2 * parkingScore + 0.2 * fillRatio + 0.15 * (valid ? 1 : 0)),
            Diagnostics = diagnostics
        };
    }

    private static bool IsHardDiagnostic(string message) => message.StartsWith("OVERLAP", StringComparison.Ordinal)
        || message.StartsWith("OUTSIDE", StringComparison.Ordinal)
        || message.StartsWith("ASPECT_RATIO", StringComparison.Ordinal)
        || message.StartsWith("NET_AREA", StringComparison.Ordinal)
        || message.Contains("FAILED", StringComparison.Ordinal)
        || message.StartsWith("REQUIRED_PROGRAM_MISSING", StringComparison.Ordinal)
        || message.StartsWith("PROGRAM_UNPLACED", StringComparison.Ordinal);

    private static PackingProgram? FindProgram(IEnumerable<PackingProgram> programs, params string[] tokens) =>
        programs.FirstOrDefault(program => tokens.Any(token => program.Id.Contains(token, StringComparison.OrdinalIgnoreCase)
            || program.Name.Contains(token, StringComparison.OrdinalIgnoreCase)));

    private static RectanglePlacement BoundaryRectangle(PackingProgram program, LineSegment2 edge, Point2 entrance,
        Point2 siteCentroid, double minimumEdge, double reserve, string basis)
    {
        var grossArea = program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve);
        var length = PolygonMath.Distance(edge.A, edge.B);
        var width = Math.Min(length * .8, Math.Max(minimumEdge, Math.Sqrt(grossArea * (4d / 3d))));
        var height = grossArea / width;
        if (height < minimumEdge) { height = minimumEdge; width = grossArea / height; }
        var direction = Normalize(new(edge.B.X - edge.A.X, edge.B.Y - edge.A.Y));
        var inward = InwardNormal(direction, entrance, siteCentroid);
        var center = new Point2(entrance.X + inward.X * height / 2, entrance.Y + inward.Y * height / 2);
        var angle = Math.Atan2(direction.Y, direction.X) * 180 / Math.PI;
        return new(program.Id, program.Name, center, width, height, angle, program.TargetUsableAreaM2,
            grossArea, PlacementBasis: basis, ApprovedTargetUsableAreaM2: program.ApprovedTargetUsableAreaM2);
    }

    private static RectanglePlacement? TouchingBoundaryRectangle(PackingProgram program, RectanglePlacement main,
        LineSegment2 edge, Point2 siteCentroid, IReadOnlyList<Point2> boundary, IReadOnlyList<RectanglePlacement> placed,
        double sharedEdge, double reserve)
    {
        var grossArea = program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve);
        var depth = Math.Max(sharedEdge, Math.Min(main.HeightM, Math.Sqrt(grossArea)));
        var width = grossArea / depth;
        var radians = main.RotationDegrees * Math.PI / 180;
        var tangent = new Point2(Math.Cos(radians), Math.Sin(radians));
        foreach (var sign in new[] { 1d, -1d })
        {
            var center = new Point2(main.Center.X + tangent.X * sign * (main.WidthM + width) / 2,
                main.Center.Y + tangent.Y * sign * (main.WidthM + width) / 2);
            var candidate = new RectanglePlacement(program.Id, program.Name, center, width, depth,
                main.RotationDegrees, program.TargetUsableAreaM2, grossArea, PlacementBasis: "touching_main_arrival",
                ApprovedTargetUsableAreaM2: program.ApprovedTargetUsableAreaM2);
            if (Fits(candidate, boundary, placed)) return candidate;
        }
        return null;
    }

    private static RectanglePlacement? RectangleInZone(PackingProgram program, PolygonZone zone,
        IReadOnlyList<Point2> boundary, IReadOnlyList<RectanglePlacement> placed, double axis, double reserve)
    {
        var center = PolygonMath.Centroid(zone.Ring);
        foreach (var rotation in new[] { axis, axis + 90 })
        foreach (var ratio in Ratios(program))
        {
            var gross = program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve);
            var width = Math.Sqrt(gross * ratio); var height = gross / width;
            var rectangle = new RectanglePlacement(program.Id, program.Name, center, width, height, rotation,
                program.TargetUsableAreaM2, gross, PlacementBasis: "operations_candidate", CandidateZoneId: zone.Id,
                ApprovedTargetUsableAreaM2: program.ApprovedTargetUsableAreaM2);
            if (rectangle.Corners.All(point => PolygonMath.Contains(zone.Ring, point)) && Fits(rectangle, boundary, placed)) return rectangle;
        }
        return null;
    }

    private static RectanglePlacement? FindPackedRectangle(PackingProgram program, IReadOnlyList<Point2> boundary,
        IReadOnlyList<RectanglePlacement> placed, double axis, double reserve, int seed, int candidateSamples,
        int feasibleCandidateLimit, RectanglePlacement? treemapSeed)
    {
        var minX = boundary.Min(p => p.X); var maxX = boundary.Max(p => p.X);
        var minY = boundary.Min(p => p.Y); var maxY = boundary.Max(p => p.Y);
        var gross = program.TargetUsableAreaM2 / Math.Max(.5, 1 - reserve);
        if (treemapSeed is not null)
        {
            var aspect = treemapSeed.WidthM / Math.Max(1e-9, treemapSeed.HeightM);
            if (aspect >= Math.Max(.2, program.AspectRatioMin) - Tolerance
                && aspect <= Math.Max(program.AspectRatioMin, program.AspectRatioMax) + Tolerance
                && Fits(treemapSeed, boundary, placed)) return treemapSeed;
        }
        RectanglePlacement? best = null; var bestScore = double.PositiveInfinity; var feasibleCount = 0;
        var offset = Math.Abs(DeterministicSeed.Derive(seed, program.Id) % 7919) + 1;
        for (var sample = 1; sample <= candidateSamples; sample++)
        {
            var center = new Point2(minX + Halton(sample + offset, 2) * (maxX - minX),
                minY + Halton(sample + offset, 3) * (maxY - minY));
            foreach (var rotation in new[] { axis, axis + 90 })
            foreach (var ratio in Ratios(program))
            {
                var width = Math.Sqrt(gross * ratio); var height = gross / width;
                var candidate = new RectanglePlacement(program.Id, program.Name, center, width, height, rotation,
                    program.TargetUsableAreaM2, gross, ApprovedTargetUsableAreaM2: program.ApprovedTargetUsableAreaM2);
                if (!Fits(candidate, boundary, placed)) continue;
                feasibleCount++;
                var clearance = PolygonMath.DistanceToBoundary(boundary, center);
                var score = -clearance + placed.Sum(item => 1 / Math.Max(1, PolygonMath.Distance(item.Center, center)));
                if (score >= bestScore) continue;
                best = candidate; bestScore = score;
            }
            if (best is not null && feasibleCount >= Math.Max(4, feasibleCandidateLimit)) break;
        }
        return best;
    }

    private static IEnumerable<double> Ratios(PackingProgram program)
    {
        var min = Math.Max(.2, program.AspectRatioMin);
        var max = Math.Max(min, program.AspectRatioMax);
        yield return Math.Clamp(1, min, max);
        if (Math.Abs(max - min) > .01) { yield return min; yield return max; }
    }

    private static bool Fits(RectanglePlacement candidate, IReadOnlyList<Point2> boundary, IReadOnlyList<RectanglePlacement> placed) =>
        Math.Min(candidate.WidthM, candidate.HeightM) / Math.Max(candidate.WidthM, candidate.HeightM) >= .75 - Tolerance
        && candidate.Corners.All(point => PolygonMath.Contains(boundary, point) || PolygonMath.DistanceToBoundary(boundary, point) <= .01)
        && placed.All(other => !Overlaps(candidate, other));

    public static bool Overlaps(RectanglePlacement a, RectanglePlacement b)
    {
        var left = a.Corners; var right = b.Corners;
        var leftMinX = left.Min(point => point.X); var leftMaxX = left.Max(point => point.X);
        var leftMinY = left.Min(point => point.Y); var leftMaxY = left.Max(point => point.Y);
        var rightMinX = right.Min(point => point.X); var rightMaxX = right.Max(point => point.X);
        var rightMinY = right.Min(point => point.Y); var rightMaxY = right.Max(point => point.Y);
        if (leftMaxX <= rightMinX + Tolerance || rightMaxX <= leftMinX + Tolerance
            || leftMaxY <= rightMinY + Tolerance || rightMaxY <= leftMinY + Tolerance) return false;
        foreach (var polygon in new[] { left, right })
        for (var index = 0; index < polygon.Count; index++)
        {
            var p = polygon[index]; var q = polygon[(index + 1) % polygon.Count];
            var axis = Normalize(new Point2(-(q.Y - p.Y), q.X - p.X));
            var leftProjection = left.Select(point => point.X * axis.X + point.Y * axis.Y).ToList();
            var rightProjection = right.Select(point => point.X * axis.X + point.Y * axis.Y).ToList();
            if (leftProjection.Max() <= rightProjection.Min() + Tolerance || rightProjection.Max() <= leftProjection.Min() + Tolerance)
                return false;
        }
        return true;
    }

    private static double ZoneScore(PolygonZone zone, PackingProgram program, Point2 mainEntrance, int seed)
    {
        var ruleScore = program.PlacementRules?.Soft.ZoneScores.GetValueOrDefault(zone.Id) ?? zone.Priority;
        var separation = PolygonMath.Distance(PolygonMath.Centroid(zone.Ring), mainEntrance);
        return ruleScore + Math.Min(.25, separation / 400) + DeterministicSeed.Unit(seed, zone.Id) * .001;
    }

    private static Point2 ClosestPoint(IEnumerable<LineSegment2> segments, Point2 point) => segments
        .Select(segment => ClosestPoint(segment.A, segment.B, point))
        .OrderBy(candidate => PolygonMath.Distance(candidate, point)).First();

    private static Point2 ClosestPoint(Point2 a, Point2 b, Point2 point)
    {
        var dx = b.X - a.X; var dy = b.Y - a.Y;
        var denominator = dx * dx + dy * dy;
        var t = denominator <= 1e-12 ? 0 : Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / denominator, 0, 1);
        return new(a.X + dx * t, a.Y + dy * t);
    }

    private static double SiteAxisDegrees(IReadOnlyList<Point2> boundary)
    {
        var longest = Enumerable.Range(0, boundary.Count).Select(index =>
        {
            var a = boundary[index]; var b = boundary[(index + 1) % boundary.Count];
            return (A: a, B: b, Length: PolygonMath.Distance(a, b));
        }).OrderByDescending(item => item.Length).First();
        return Math.Atan2(longest.B.Y - longest.A.Y, longest.B.X - longest.A.X) * 180 / Math.PI;
    }

    private static Point2 InwardNormal(Point2 direction, Point2 point, Point2 centroid)
    {
        var first = new Point2(-direction.Y, direction.X);
        var toward = new Point2(centroid.X - point.X, centroid.Y - point.Y);
        return first.X * toward.X + first.Y * toward.Y >= 0 ? first : new(-first.X, -first.Y);
    }

    private static Point2 Normalize(Point2 vector)
    {
        var length = Math.Sqrt(vector.X * vector.X + vector.Y * vector.Y);
        return length <= 1e-12 ? new(1, 0) : new(vector.X / length, vector.Y / length);
    }

    private static Point2 Lerp(Point2 a, Point2 b, double t) => new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

    private static double Halton(int index, int numberBase)
    {
        var result = 0d; var fraction = 1d / numberBase;
        while (index > 0) { result += fraction * (index % numberBase); index /= numberBase; fraction /= numberBase; }
        return result;
    }
}
