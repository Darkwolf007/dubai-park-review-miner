using System.Text.Json;
using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class PackProgramRectanglesComponent : GH_Component
{
    private string? _cachedPackagePath;
    private DateTime _cachedPackageWriteTimeUtc;
    private DesignPackage? _cachedPackage;
    public PackProgramRectanglesComponent() : base(
        "Pack Program Rectangles", "PackParkRects",
        "Packs non-overlapping program rectangles with seeded arrivals, one Operations candidate, parking preference, climate-valid dune axes, and auditable hard constraints.",
        "Park Design", "Planning") { }

    public override Guid ComponentGuid => new("0B780B7E-B936-4C96-B097-6856D0934DE3");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddCurveParameter("Boundary", "B", "Closed site boundary in metres.", GH_ParamAccess.item);
        p.AddTextParameter("Design Package", "J", "Park Design Package path.", GH_ParamAccess.item);
        p.AddCurveParameter("Northwest Entrance Edge", "NW", "Entire entrance-eligible northwest site edge.", GH_ParamAccess.item);
        p.AddCurveParameter("Southwest Entrance Edge", "SW", "Entire entrance-eligible southwest site edge.", GH_ParamAccess.item);
        p.AddCurveParameter("External Parking Bay", "PB", "Designer-supplied parking bay curve outside the site.", GH_ParamAccess.item);
        p.AddCurveParameter("Operations Candidates", "OC", "Exactly two closed Rhino candidate curves.", GH_ParamAccess.list);
        p.AddIntegerParameter("Master Seed", "S", "Deterministic master seed for packing and dune axes.", GH_ParamAccess.item, 1);
        p.AddIntegerParameter("Alternatives", "A", "Ranked alternatives to generate.", GH_ParamAccess.item, 5);
        p.AddIntegerParameter("Selected", "I", "Zero-based ranked alternative index.", GH_ParamAccess.item, 0);
        p.AddBooleanParameter("Allow Clipped Shapes", "CS", "Reserved compatibility toggle. False enforces true rectangles.", GH_ParamAccess.item, false);
        p.AddNumberParameter("Program Coverage", "PC", "Maximum gross site coverage assigned to the 18 non-overlay program rectangles. Targets are uniformly normalized when they exceed this capacity.", GH_ParamAccess.item, .72);
        p.AddBooleanParameter("Run", "R", "Generate alternatives.", GH_ParamAccess.item, false);
        p[4].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddCurveParameter("Rectangles", "R", "Selected non-overlapping program rectangles.", GH_ParamAccess.list);
        p.AddPointParameter("Centers", "C", "Rectangle centres matching Program IDs.", GH_ParamAccess.list);
        p.AddTextParameter("Program IDs", "ID", "Stable program IDs matching rectangles.", GH_ParamAccess.list);
        p.AddTextParameter("Program Names", "N", "Program names matching rectangles.", GH_ParamAccess.list);
        p.AddTextParameter("Rectangle Data", "D", "Gross/net area, rotation and placement metadata.", GH_ParamAccess.list);
        p.AddPointParameter("Main Entrance", "ME", "Selected seeded main entrance.", GH_ParamAccess.item);
        p.AddPointParameter("Secondary Entrance", "SE", "Selected seeded secondary entrance.", GH_ParamAccess.item);
        p.AddPointParameter("Service Entrance", "SVE", "Dedicated service entrance nearest Operations.", GH_ParamAccess.item);
        p.AddCurveParameter("Dune Axes", "DA", "Seeded climate-constrained dune axes for this alternative.", GH_ParamAccess.list);
        p.AddTextParameter("Dune Axis Data", "DAD", "Baseline/generated azimuth, offset, seed and score.", GH_ParamAccess.list);
        p.AddTextParameter("Crossing Scores", "XS", "Walking, cycling and service score records per space.", GH_ParamAccess.list);
        p.AddTextParameter("Alternative Records", "AR", "Ranked score, seed, validity and diagnostics.", GH_ParamAccess.list);
        p.AddTextParameter("Diagnostics", "W", "Selected alternative validation messages.", GH_ParamAccess.list);
        p.AddTextParameter("Summary", "I", "Selected packing summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundaryCurve = null; Curve? northwest = null; Curve? southwest = null; Curve? parking = null;
        var packagePath = string.Empty; var operationsCurves = new List<Curve>();
        var seed = 1; var alternativeCount = 5; var selected = 0; var allowClipped = false; var programCoverage = .72; var run = false;
        if (!data.GetData(0, ref boundaryCurve) || boundaryCurve is null || !data.GetData(1, ref packagePath)
            || !data.GetData(2, ref northwest) || northwest is null || !data.GetData(3, ref southwest) || southwest is null) return;
        data.GetData(4, ref parking); data.GetDataList(5, operationsCurves); data.GetData(6, ref seed);
        data.GetData(7, ref alternativeCount); data.GetData(8, ref selected); data.GetData(9, ref allowClipped);
        data.GetData(10, ref programCoverage); data.GetData(11, ref run);
        if (!run) return;
        try
        {
            if (RhinoDoc.ActiveDoc is not { ModelUnitSystem: UnitSystem.Meters })
                throw new ArgumentException("The Rhino document must use metres.");
            if (!boundaryCurve.IsClosed) throw new ArgumentException("Boundary must be closed.");
            if (operationsCurves.Count != 2 || operationsCurves.Any(curve => !curve.IsClosed))
                throw new ArgumentException("Provide exactly two closed Operations candidate curves.");
            if (programCoverage is < .4 or > .9) throw new ArgumentException("Program Coverage must be between 0.40 and 0.90.");
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var package = LoadPackageCached(packagePath);
            var boundary = Ring(boundaryCurve);
            var sourcePrograms = package.Programs.Where(program => program.Selected && program.TargetAreaM2 is > 0
                    && !string.Equals(program.SpatialMode, "overlay", StringComparison.OrdinalIgnoreCase)).ToList();
            var approvedTargetTotal = sourcePrograms.Sum(program => program.TargetUsableAreaM2 ?? program.TargetAreaM2!.Value);
            var boundaryArea = Math.Abs(AreaMassProperties.Compute(boundaryCurve)?.Area ?? PolygonMath.SignedArea(boundary));
            const double grossReserveRatio = .08;
            const double secondaryPlazaArea = 150;
            var normalizedTargetCapacity = Math.Max(0, boundaryArea * programCoverage * (1 - grossReserveRatio) - secondaryPlazaArea);
            var areaScale = approvedTargetTotal <= 0 ? 1 : Math.Min(1, normalizedTargetCapacity / approvedTargetTotal);
            var programs = sourcePrograms.Select(program =>
            {
                var approvedTarget = program.TargetUsableAreaM2 ?? program.TargetAreaM2!.Value;
                return new PackingProgram(program.Id, program.Name, approvedTarget * areaScale, program.Priority,
                    Required: program.Mandatory, PlacementRules: program.PlacementRules,
                    ApprovedTargetUsableAreaM2: approvedTarget, PreferredCenter: PreferredCenter(package, program));
            }).ToList();
            var edges = new[]
            {
                Segment("northwest-road-edge", northwest, ["road_facing", "public_entrance_eligible"]),
                Segment("southwest-road-edge", southwest, ["road_facing", "public_entrance_eligible", "service_entrance_eligible"])
            };
            var zones = operationsCurves.Select((curve, index) => new PolygonZone($"operations-option-{index + 1}", Ring(curve), index == 0 ? .9 : .7)).ToList();
            var parkingPoints = parking is null ? new List<Point2>() : Sample(parking, 24);
            var packed = ConstrainedRectanglePacker.Pack(new ConstrainedPackingInput
            {
                Boundary = boundary, Programs = programs, PublicEntranceEdges = edges,
                OperationsCandidateZones = zones, ParkingBay = parkingPoints
            }, new(seed, alternativeCount, allowClipped, GrossAreaReserveRatio: grossReserveRatio,
                CandidateSamples: 1400, FeasibleCandidateLimit: 40));
            if (packed.Alternatives.Count == 0) throw new InvalidOperationException("No alternatives were generated.");
            selected = Math.Clamp(selected, 0, packed.Alternatives.Count - 1);
            var alternative = packed.Alternatives[selected];
            var curves = alternative.Rectangles.Select(RectangleCurve).ToList();
            var byId = alternative.Rectangles.ToDictionary(item => item.ProgramId, StringComparer.Ordinal);
            var crossingScores = SpaceCrossingScorer.Score(package.Programs, byId);
            var proxyAreas = alternative.Rectangles.Select(item => new BubblePlacement(item.ProgramId, item.ProgramName,
                item.Center, Math.Sqrt(item.GrossAreaM2 / Math.PI), item.GrossAreaM2, "PACKED_RECTANGLE")).ToList();
            var duneAxes = DuneMorphologyGenerator.GenerateAxes(boundary, package.ClimateMorphology, alternative.Seed, proxyAreas);

            data.SetDataList(0, curves);
            data.SetDataList(1, alternative.Rectangles.Select(item => Point(item.Center)));
            data.SetDataList(2, alternative.Rectangles.Select(item => item.ProgramId));
            data.SetDataList(3, alternative.Rectangles.Select(item => item.ProgramName));
            data.SetDataList(4, alternative.Rectangles.Select(item => JsonSerializer.Serialize(new
            {
                program_id = item.ProgramId, target_usable_area_m2 = item.TargetUsableAreaM2,
                approved_target_usable_area_m2 = item.ApprovedTargetUsableAreaM2,
                area_normalization_scale = item.ApprovedTargetUsableAreaM2 is > 0 ? item.TargetUsableAreaM2 / item.ApprovedTargetUsableAreaM2 : 1,
                gross_area_m2 = item.GrossAreaM2, internal_path_area_m2 = item.InternalPathAreaM2,
                net_usable_area_m2 = item.NetUsableAreaM2, width_m = item.WidthM, height_m = item.HeightM,
                rotation_deg = item.RotationDegrees, basis = item.PlacementBasis, candidate_zone_id = item.CandidateZoneId
            })));
            data.SetData(5, Point(alternative.MainEntrance)); data.SetData(6, Point(alternative.SecondaryEntrance));
            data.SetData(7, Point(alternative.ServiceEntrance));
            data.SetDataList(8, duneAxes.Select(axis => (Curve)new PolylineCurve(axis.Points.Select(Point))));
            data.SetDataList(9, duneAxes.Select(axis => JsonSerializer.Serialize(new { axis.Id, axis.Role,
                baseline_azimuth_deg = axis.BaselineAzimuthDegFromNorth, generated_azimuth_deg = axis.AzimuthDegFromNorth,
                offset_m = axis.GeneratedOffsetM, axis.Seed, axis.Score, axis.Basis })));
            data.SetDataList(10, crossingScores.Select(score => JsonSerializer.Serialize(score)));
            data.SetDataList(11, packed.Alternatives.Select(item => JsonSerializer.Serialize(new
            {
                item.AlternativeIndex, item.Seed, item.Score, item.Valid, rectangle_count = item.Rectangles.Count,
                item.MainEntranceEdgeId, item.SecondaryEntranceEdgeId, item.OperationsCandidateZoneId, item.Diagnostics
            })));
            data.SetDataList(12, alternative.Diagnostics);
            data.SetData(13, $"Alternative {selected + 1}/{packed.Alternatives.Count} | seed {alternative.Seed} | " +
                $"{alternative.Rectangles.Count} rectangles | score {alternative.Score:0.0} | valid {alternative.Valid} | " +
                $"Operations {alternative.OperationsCandidateZoneId ?? "unplaced"} | all-space area scale {areaScale:P1} " +
                $"because approved targets total {approvedTargetTotal:0} m2 against {boundaryArea:0} m2 site | " +
                $"solved in {stopwatch.Elapsed.TotalMilliseconds:0} ms.");
            Message = $"{stopwatch.Elapsed.TotalMilliseconds:0} ms";
            if (!alternative.Valid) AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "Selected alternative has hard diagnostics; inspect Diagnostics.");
        }
        catch (Exception exception) { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message); }
    }

    private static LineSegment2 Segment(string id, Curve curve, IReadOnlyList<string> roles) =>
        new(id, ToPoint(curve.PointAtStart), ToPoint(curve.PointAtEnd), roles);

    private static List<Point2> Ring(Curve curve)
    {
        var parameters = curve.DivideByCount(Math.Clamp((int)Math.Ceiling(curve.GetLength() / 2), 8, 256), true)
            ?? throw new ArgumentException("Curve could not be sampled.");
        var ring = parameters.Select(parameter => ToPoint(curve.PointAt(parameter))).ToList();
        if (ring.Count > 1 && PolygonMath.Distance(ring[0], ring[^1]) < .001) ring.RemoveAt(ring.Count - 1);
        return ring;
    }

    private static List<Point2> Sample(Curve curve, int count) =>
        (curve.DivideByCount(count, true) ?? []).Select(parameter => ToPoint(curve.PointAt(parameter))).ToList();

    private static Point2? PreferredCenter(DesignPackage package, ProgramDefinition program)
    {
        var keys = new[] { $"{program.Id}_suitability", $"{program.Id}_opportunity", program.SuitabilityField }
            .Where(key => !string.IsNullOrWhiteSpace(key)).ToList();
        return package.Grid.Cells.Where(cell => !cell.Constraint && !cell.ProgramConstraints.ContainsKey(program.Id))
            .Select(cell => new
            {
                Cell = cell,
                Score = keys.Select(key => cell.Scores.GetValueOrDefault(key!)).Where(value => value is not null)
                    .Select(value => value!.Value).DefaultIfEmpty(0).Max()
            })
            .OrderByDescending(item => item.Score).ThenBy(item => item.Cell.Id, StringComparer.Ordinal)
            .Select(item => (Point2?)new Point2(item.Cell.X, item.Cell.Y)).FirstOrDefault();
    }

    private static Curve RectangleCurve(RectanglePlacement rectangle)
    {
        var points = rectangle.Corners.Select(Point).ToList(); points.Add(points[0]);
        return new PolylineCurve(points);
    }
    private static Point2 ToPoint(Point3d point) => new(point.X, point.Y);
    private static Point3d Point(Point2 point) => new(point.X, point.Y, 0);

    private DesignPackage LoadPackageCached(string path)
    {
        var normalized = Path.GetFullPath(path.Trim().Trim('"'));
        var writeTime = File.Exists(normalized) ? File.GetLastWriteTimeUtc(normalized) : DateTime.MinValue;
        if (_cachedPackage is not null && string.Equals(_cachedPackagePath, normalized, StringComparison.OrdinalIgnoreCase)
            && _cachedPackageWriteTimeUtc == writeTime) return _cachedPackage;
        _cachedPackage = DesignPackageLoader.LoadFile(normalized);
        _cachedPackagePath = normalized;
        _cachedPackageWriteTimeUtc = writeTime;
        return _cachedPackage;
    }
}
