using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class GenerateCirculationComponent : GH_Component
{
    public GenerateCirculationComponent()
        : base(
            "Generate Circulation",
            "ParkCirculation",
            "Builds a deterministic demand-led pedestrian hierarchy from authoritative program polygons. Access occurs on polygon boundaries; service routing remains separate.",
            "Park Design",
            "Planning")
    {
    }

    public override Guid ComponentGuid => new("9D73CD0A-728A-4E91-BF0B-9CBBA97E34D7");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Boundary", "B", "Closed site boundary in metres.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Program Polygons", "P", "Authoritative closed program polygons. Use circles only for explicitly preview-only workflows.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program IDs", "ID", "Stable IDs matching Program Polygons.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program Names", "N", "Optional names matching Program Polygons.", GH_ParamAccess.list);
        parameters.AddTextParameter("Circulation Behaviors", "CB", "Optional values matching polygons: hard_barrier, destination_only, permeable_landscape, or preferred_corridor.", GH_ParamAccess.list);
        parameters.AddPointParameter("Main Entrance", "ME", "Exact main public entrance point.", GH_ParamAccess.item);
        parameters.AddPointParameter("Secondary Entrances", "SE", "Optional exact secondary public entrance points.", GH_ParamAccess.list);
        parameters.AddPointParameter("Service Entrance", "SVE", "Optional exact service entrance point.", GH_ParamAccess.item);
        parameters.AddPointParameter("Explicit Access Points", "AP", "Optional designer-authored points on program boundaries.", GH_ParamAccess.list);
        parameters.AddTextParameter("Access Program IDs", "AID", "Program IDs matching Explicit Access Points.", GH_ParamAccess.list);
        parameters.AddTextParameter("Hub Program ID", "H", "Optional designer hub override. Leave empty for movement-demand selection.", GH_ParamAccess.item);
        parameters.AddTextParameter("Design Package", "DP", "Path to the design-package ZIP, directory, or canonical JSON containing movement_demands.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Cell Size", "CS", "Routing-grid cell size in metres. Larger is faster; smaller resolves tighter gaps.", GH_ParamAccess.item, 2.0);
        parameters.AddNumberParameter("Route Reuse", "RR", "Existing generated-route cost discount from 0 to 0.9.", GH_ParamAccess.item, 0.35);
        parameters.AddPointParameter("Point Programs", "PP", "Optional placed point-program destinations from ParkBubbles.", GH_ParamAccess.list);
        parameters.AddTextParameter("Point Program IDs", "PID", "Stable IDs matching Point Programs.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Run", "R", "Generate circulation.", GH_ParamAccess.item, false);
        parameters[3].Optional = true;
        parameters[4].Optional = true;
        parameters[6].Optional = true;
        parameters[7].Optional = true;
        parameters[8].Optional = true;
        parameters[9].Optional = true;
        parameters[10].Optional = true;
        parameters[14].Optional = true;
        parameters[15].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Primary Paths", "P", "Merged high-flow public trunk chains.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Secondary Paths", "S", "Merged destination connector chains.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Tertiary Paths", "T", "Merged local access chains.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Service Paths", "SV", "Separate service-network chains.", GH_ParamAccess.list);
        parameters.AddPointParameter("Access Candidates", "AC", "All deterministic boundary access candidates.", GH_ParamAccess.list);
        parameters.AddPointParameter("Selected Access", "SA", "Selected program-boundary access points.", GH_ParamAccess.list);
        parameters.AddPointParameter("Graph Nodes", "GN", "Explicit graph junction, routing, entrance, and access nodes.", GH_ParamAccess.list);
        parameters.AddPointParameter("Blocked Grid Cells", "BG", "Debug centers for hard-barrier and destination-only cells.", GH_ParamAccess.list);
        parameters.AddTextParameter("Circulation JSON", "JSON", "Versioned graph, flow, hierarchy, audit, and Lands Design handoff data.", GH_ParamAccess.item);
        parameters.AddTextParameter("Warnings", "W", "Validation and access-generation warnings.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Network and audit summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundaryCurve = null;
        var polygonCurves = new List<Curve>();
        var ids = new List<string>();
        var names = new List<string>();
        var behaviors = new List<string>();
        var mainEntrance = Point3d.Unset;
        var secondaryEntrances = new List<Point3d>();
        var serviceEntrance = Point3d.Unset;
        var explicitPoints = new List<Point3d>();
        var explicitProgramIds = new List<string>();
        var hubId = string.Empty;
        var packagePath = string.Empty;
        var cellSize = 2d;
        var routeReuse = 0.35;
        var pointPrograms = new List<Point3d>();
        var pointProgramIds = new List<string>();
        var run = false;

        if (!data.GetData(0, ref boundaryCurve)) return;
        data.GetDataList(1, polygonCurves);
        data.GetDataList(2, ids);
        data.GetDataList(3, names);
        data.GetDataList(4, behaviors);
        if (!data.GetData(5, ref mainEntrance)) return;
        data.GetDataList(6, secondaryEntrances);
        data.GetData(7, ref serviceEntrance);
        data.GetDataList(8, explicitPoints);
        data.GetDataList(9, explicitProgramIds);
        data.GetData(10, ref hubId);
        if (!data.GetData(11, ref packagePath)) return;
        data.GetData(12, ref cellSize);
        data.GetData(13, ref routeReuse);
        data.GetDataList(14, pointPrograms);
        data.GetDataList(15, pointProgramIds);
        data.GetData(16, ref run);
        if (!run) return;

        if (boundaryCurve is null || !boundaryCurve.IsClosed)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be closed.");
            return;
        }
        if (polygonCurves.Count == 0 || ids.Count != polygonCurves.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Program Polygons and Program IDs must be non-empty matching lists.");
            return;
        }
        if (names.Count != 0 && names.Count != polygonCurves.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Program Names must be empty or match Program Polygons.");
            return;
        }
        if (behaviors.Count != 0 && behaviors.Count != polygonCurves.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Circulation Behaviors must be empty or match Program Polygons.");
            return;
        }
        if (explicitPoints.Count != explicitProgramIds.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Explicit Access Points and Access Program IDs must match.");
            return;
        }
        if (pointPrograms.Count != pointProgramIds.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Point Programs and Point Program IDs must match.");
            return;
        }
        if (cellSize <= 0 || routeReuse is < 0 or > 0.9)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Cell Size must be positive and Route Reuse must be between 0 and 0.9.");
            return;
        }

        try
        {
            var warnings = new List<string>();
            var samplingLength = Math.Max(0.25, Math.Min(1, cellSize / 2));
            var boundary = Ring(boundaryCurve, samplingLength);
            var regions = new List<SpaceRegion>();
            var modelTolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? 0.01;
            for (var index = 0; index < polygonCurves.Count; index++)
            {
                if (!polygonCurves[index].IsClosed)
                    throw new ArgumentException($"Program polygon '{ids[index]}' is open.");
                var name = names.Count == 0 ? ids[index] : names[index];
                var behavior = behaviors.Count == 0
                    ? InferBehavior(ids[index], name)
                    : ParseBehavior(behaviors[index]);
                if (behaviors.Count == 0)
                    warnings.Add($"BEHAVIOR_INFERRED: '{ids[index]}' was classified as {BehaviorName(behavior)}; provide Circulation Behaviors to make this authoritative.");
                var serviceOnly = ContainsAny($"{ids[index]} {name}", "operation", "maintenance", "service yard", "back of house");
                var clippedCurve = ClipToSite(polygonCurves[index], boundaryCurve, modelTolerance,
                    out var wasClipped, out var removedArea);
                if (wasClipped)
                    warnings.Add($"SPACE_CLIPPED_TO_SITE: '{ids[index]}' was intersected with the site boundary; approximately {removedArea:0.##} m2 outside the site was removed.");
                regions.Add(new(ids[index], name, Ring(clippedCurve, samplingLength), behavior,
                    PublicAccess: !serviceOnly, RequiresService: serviceOnly));
            }

            var package = DesignPackageLoader.LoadFile(packagePath);
            var entrances = new List<SiteEntrance>
            {
                new("main-entrance", ToPoint(mainEntrance), SiteEntranceType.Main, DemandWeight: 2)
            };
            entrances.AddRange(secondaryEntrances.Where(point => point.IsValid).Select((point, index) =>
                new SiteEntrance($"secondary-entrance-{index + 1}", ToPoint(point), SiteEntranceType.Secondary)));
            if (serviceEntrance.IsValid)
                entrances.Add(new("service-entrance", ToPoint(serviceEntrance), SiteEntranceType.Service,
                    AllowsService: true));
            var explicitAccess = explicitPoints.Select((point, index) =>
                new ExplicitAccessPoint($"designer-access-{index + 1}", explicitProgramIds[index], ToPoint(point))).ToList();
            var input = new CirculationInput
            {
                Spaces = regions,
                Entrances = entrances,
                ExplicitAccessPoints = explicitAccess,
                PointDestinations = pointPrograms.Select((point, index) =>
                    new CirculationDestination(pointProgramIds[index], pointProgramIds[index], ToPoint(point))).ToList(),
                MovementDemands = package.MovementDemands,
                DesignerHubProgramId = string.IsNullOrWhiteSpace(hubId) ? null : hubId.Trim(),
                CostSettings = new() { CellSizeM = cellSize, RouteReuseBenefit = routeReuse }
            };
            var result = CirculationNetworkBuilder.Build(boundary, input);
            foreach (var warning in warnings) result.Audit.Warnings.Add(warning);
            var chains = CirculationPathExtractor.Extract(result);
            var field = MovementCostFieldBuilder.Build(boundary, regions, input.CostSettings);

            data.SetDataList(0, Curves(chains, "public", "primary"));
            data.SetDataList(1, Curves(chains, "public", "secondary"));
            data.SetDataList(2, Curves(chains, "public", "tertiary"));
            data.SetDataList(3, Curves(chains, "service", "service"));
            data.SetDataList(4, result.AccessPoints.Select(point => ToPoint(point.Point)));
            data.SetDataList(5, result.AccessPoints.Where(point => point.Selected).Select(point => ToPoint(point.Point)));
            data.SetDataList(6, result.Nodes.Select(node => ToPoint(node.Point)));
            data.SetDataList(7, field.Cells.Where(cell => !cell.Traversable).Select(cell => ToPoint(cell.Center)));
            data.SetData(8, CirculationJsonWriter.SerializeResult(result));
            data.SetDataList(9, result.Audit.Warnings);
            data.SetData(10,
                $"Hub {result.HubProgramId ?? "none"} | {result.AccessPoints.Count(point => point.Selected)} selected access points | " +
                $"{result.Nodes.Count} graph nodes | {result.Edges.Count} graph edges | " +
                $"{chains.Count(chain => chain.Hierarchy == "primary")} primary, {chains.Count(chain => chain.Hierarchy == "secondary")} secondary, " +
                $"{chains.Count(chain => chain.Hierarchy == "tertiary")} tertiary, {chains.Count(chain => chain.Network == "service")} service chains | " +
                $"{result.OdAssignments.Count(assignment => assignment.Found)}/{result.OdAssignments.Count} OD routes found | audit {(result.Audit.IsValid ? "valid" : "needs review")}");
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message);
        }
    }

    private static IEnumerable<Curve> Curves(
        IEnumerable<CirculationPathChain> chains,
        string network,
        string hierarchy) =>
        chains.Where(chain => chain.Network == network && chain.Hierarchy == hierarchy)
            .Select(chain => (Curve)new Polyline(chain.Points.Select(ToPoint)).ToNurbsCurve());

    private static Curve ClipToSite(
        Curve polygon,
        Curve siteBoundary,
        double tolerance,
        out bool wasClipped,
        out double removedArea)
    {
        using var originalMass = AreaMassProperties.Compute(polygon);
        var originalArea = originalMass?.Area ?? 0;
        var intersections = Curve.CreateBooleanIntersection(polygon, siteBoundary, tolerance);
        if (intersections is null || intersections.Length == 0)
        {
            var sample = originalMass?.Centroid ?? polygon.GetBoundingBox(true).Center;
            var containment = siteBoundary.Contains(sample, Plane.WorldXY, tolerance);
            if (containment is PointContainment.Inside or PointContainment.Coincident)
            {
                wasClipped = false;
                removedArea = 0;
                return polygon.DuplicateCurve();
            }
            throw new ArgumentException("A program polygon lies completely outside the site boundary and cannot be routed.");
        }

        var ranked = intersections.Select(curve =>
        {
            using var mass = AreaMassProperties.Compute(curve);
            return (Curve: curve, Area: mass?.Area ?? 0);
        }).OrderByDescending(item => item.Area).ToList();
        var selected = ranked[0];
        if (selected.Area <= tolerance * tolerance)
            throw new ArgumentException("A program polygon has no usable area after clipping to the site boundary.");
        removedArea = Math.Max(0, originalArea - selected.Area);
        wasClipped = removedArea > Math.Max(tolerance * tolerance, originalArea * 0.0001);
        return selected.Curve.DuplicateCurve();
    }

    private static List<Point2> Ring(Curve curve, double maximumSegmentLength = 1)
    {
        if (curve.TryGetPolyline(out var polyline))
            return SpaceRegionValidator.NormalizeRing(polyline.Select(ToPoint).ToList());
        var segmentCount = Math.Clamp((int)Math.Ceiling(curve.GetLength() / Math.Max(0.05, maximumSegmentLength)), 64, 4096);
        var parameters = curve.DivideByCount(segmentCount, true);
        if (parameters is null || parameters.Length < 3)
            throw new ArgumentException("A closed curve could not be sampled into a valid polygon ring.");
        return SpaceRegionValidator.NormalizeRing(parameters.Select(parameter => ToPoint(curve.PointAt(parameter))).ToList());
    }

    private static SpaceCirculationBehavior ParseBehavior(string value)
    {
        var normalized = new string(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
        return normalized switch
        {
            "hardbarrier" => SpaceCirculationBehavior.HardBarrier,
            "destinationonly" => SpaceCirculationBehavior.DestinationOnly,
            "permeablelandscape" => SpaceCirculationBehavior.PermeableLandscape,
            "preferredcorridor" => SpaceCirculationBehavior.PreferredCorridor,
            _ => throw new ArgumentException($"Unsupported circulation behavior '{value}'.")
        };
    }

    private static SpaceCirculationBehavior InferBehavior(string id, string name)
    {
        var value = $"{id} {name}";
        if (ContainsAny(value, "operation", "maintenance", "service yard", "building", "water body"))
            return SpaceCirculationBehavior.HardBarrier;
        if (ContainsAny(value, "lawn", "plaza", "garden", "nature", "picnic"))
            return SpaceCirculationBehavior.PermeableLandscape;
        return SpaceCirculationBehavior.DestinationOnly;
    }

    private static string BehaviorName(SpaceCirculationBehavior behavior) => behavior switch
    {
        SpaceCirculationBehavior.HardBarrier => "hard_barrier",
        SpaceCirculationBehavior.DestinationOnly => "destination_only",
        SpaceCirculationBehavior.PermeableLandscape => "permeable_landscape",
        SpaceCirculationBehavior.PreferredCorridor => "preferred_corridor",
        _ => "destination_only"
    };

    private static bool ContainsAny(string value, params string[] terms) =>
        terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static Point2 ToPoint(Point3d point) => new(point.X, point.Y);
    private static Point3d ToPoint(Point2 point) => new(point.X, point.Y, 0);
}
