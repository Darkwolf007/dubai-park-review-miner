using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.Geometry;
using System.Text.Json;

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
        parameters.AddNumberParameter("Smoothness", "SM", "Fluid path refinement from 0 (validated polylines) to 1 (maximum smoothing). Graph endpoints and junctions remain fixed.", GH_ParamAccess.item, 0.65);
        parameters.AddTextParameter("Polygon Mode", "PM", "AUTO detects full-site Voronoi territories. Or use FOOTPRINTS / VORONOI_TERRITORIES.", GH_ParamAccess.item, "AUTO");
        parameters.AddNumberParameter("Maximum Territory Fill", "MF", "Maximum fraction of each Voronoi territory occupied by its generated program footprint.", GH_ParamAccess.item, 0.75);
        parameters.AddPointParameter("Program Centers", "PC", "Optional original bubble centers matching Program IDs. Used to rematch reordered Voronoi cells and scale each footprint around its seed.", GH_ParamAccess.list);
        parameters[3].Optional = true;
        parameters[4].Optional = true;
        parameters[6].Optional = true;
        parameters[7].Optional = true;
        parameters[8].Optional = true;
        parameters[9].Optional = true;
        parameters[10].Optional = true;
        parameters[14].Optional = true;
        parameters[15].Optional = true;
        parameters[20].Optional = true;
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
        parameters.AddCurveParameter("Raw Grid Paths", "RAW", "Unrefined merged graph chains for routing and smoothing diagnostics.", GH_ParamAccess.list);
        parameters.AddTextParameter("Refinement Data", "RD", "JSON status for each displayed path chain.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Routed Program Footprints", "RPF", "Site-clipped program footprints actually used by the router. In Voronoi mode these are inset/scaled from the territory cells.", GH_ParamAccess.list);
        parameters.AddTextParameter("Routed Program IDs", "RID", "Program IDs matching Routed Program Footprints.", GH_ParamAccess.list);
        parameters.AddTextParameter("Routed Program Names", "RN", "Program names matching Routed Program Footprints.", GH_ParamAccess.list);
        parameters.AddTextParameter("Missing Required Spaces", "MISS", "Required non-overlay area programs absent from the circulation input. Any item here is a hard pipeline error.", GH_ParamAccess.list);
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
        var smoothness = 0.65;
        var polygonMode = "AUTO";
        var maximumTerritoryFill = 0.75;
        var programCenters = new List<Point3d>();

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
        data.GetData(17, ref smoothness);
        data.GetData(18, ref polygonMode);
        data.GetData(19, ref maximumTerritoryFill);
        data.GetDataList(20, programCenters);
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
        if (programCenters.Count != 0 && programCenters.Count != polygonCurves.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Program Centers must be empty or match Program Polygons and Program IDs.");
            return;
        }
        if (cellSize <= 0 || routeReuse is < 0 or > 0.9 || smoothness is < 0 or > 1
            || maximumTerritoryFill is < 0.1 or > 0.95)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Cell Size must be positive; Route Reuse must be 0–0.9; Smoothness must be 0–1; Maximum Territory Fill must be 0.1–0.95.");
            return;
        }

        try
        {
            var warnings = new List<string>();
            var samplingLength = Math.Max(0.25, Math.Min(1, cellSize / 2));
            var boundary = Ring(boundaryCurve, samplingLength);
            var package = DesignPackageLoader.LoadFile(packagePath);
            var requiredSpaceIds = package.Programs.Where(program => program.Selected && program.Mandatory
                    && program.TargetAreaM2 is > 0 && !string.Equals(program.SpatialMode, "overlay", StringComparison.OrdinalIgnoreCase))
                .Select(program => program.Id).ToHashSet(StringComparer.Ordinal);
            var suppliedSpaceIds = ids.ToHashSet(StringComparer.Ordinal);
            var missingRequiredSpaces = requiredSpaceIds.Except(suppliedSpaceIds, StringComparer.Ordinal)
                .OrderBy(id => id, StringComparer.Ordinal).ToList();
            data.SetDataList(16, missingRequiredSpaces);
            if (missingRequiredSpaces.Count > 0)
                throw new ArgumentException($"MISSING_REQUIRED_SPACES: circulation input is missing {missingRequiredSpaces.Count} required spaces: {string.Join(", ", missingRequiredSpaces)}. Connect the complete PackParkRects Rectangles and Program IDs outputs.");
            var regions = new List<SpaceRegion>();
            var modelTolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? 0.01;
            var orderedPolygonCurves = programCenters.Count == polygonCurves.Count
                ? MatchCellsToCenters(polygonCurves, programCenters, modelTolerance, warnings)
                : polygonCurves.Select(curve => curve.DuplicateCurve()).ToList();
            if (programCenters.Count == 0)
                warnings.Add("VORONOI_ORDER_UNVERIFIED: Connect ParkBubbles Centers to Program Centers so territory cells can be matched back to their Program IDs.");

            var clippedCurves = new List<Curve>();
            for (var index = 0; index < orderedPolygonCurves.Count; index++)
            {
                var clippedCurve = ClipToSite(orderedPolygonCurves[index], boundaryCurve, modelTolerance,
                    out var wasClipped, out var removedArea);
                if (wasClipped)
                    warnings.Add($"SPACE_CLIPPED_TO_SITE: '{ids[index]}' was intersected with the site boundary; approximately {removedArea:0.##} m2 outside the site was removed.");
                clippedCurves.Add(clippedCurve);
            }

            var siteArea = Math.Abs(AreaMassProperties.Compute(boundaryCurve)?.Area ?? 0);
            var suppliedArea = clippedCurves.Sum(curve => Math.Abs(AreaMassProperties.Compute(curve)?.Area ?? 0));
            var coverageRatio = siteArea <= modelTolerance * modelTolerance ? 0 : suppliedArea / siteArea;
            var normalizedMode = new string(polygonMode.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
            var territoryMode = normalizedMode switch
            {
                "AUTO" => clippedCurves.Count > 2 && coverageRatio >= 0.88,
                "VORONOITERRITORIES" or "TERRITORIES" => true,
                "FOOTPRINTS" => false,
                _ => throw new ArgumentException($"Unsupported Polygon Mode '{polygonMode}'. Use AUTO, FOOTPRINTS, or VORONOI_TERRITORIES.")
            };
            if (normalizedMode == "AUTO")
                warnings.Add($"POLYGON_MODE_AUTO: Supplied polygons cover approximately {coverageRatio:P0} of the site and were interpreted as {(territoryMode ? "Voronoi territories" : "program footprints")}.");

            var routedFootprints = new List<Curve>();
            for (var index = 0; index < clippedCurves.Count; index++)
            {
                var footprint = clippedCurves[index];
                if (territoryMode)
                {
                    var targetArea = package.Programs.FirstOrDefault(program => program.Id == ids[index])?.TargetAreaM2;
                    var pivot = programCenters.Count == clippedCurves.Count
                        ? programCenters[index]
                        : AreaMassProperties.Compute(footprint)?.Centroid ?? footprint.GetBoundingBox(true).Center;
                    footprint = ScaleTerritory(footprint, pivot, targetArea, maximumTerritoryFill,
                        out var sourceArea, out var footprintArea, out var fillRatio);
                    warnings.Add($"VORONOI_FOOTPRINT: '{ids[index]}' territory {sourceArea:0.#} m2 → routed footprint {footprintArea:0.#} m2 ({fillRatio:P0} fill).");
                }
                routedFootprints.Add(footprint);
            }

            for (var index = 0; index < polygonCurves.Count; index++)
            {
                if (!routedFootprints[index].IsClosed)
                    throw new ArgumentException($"Program polygon '{ids[index]}' is open.");
                var name = names.Count == 0 ? ids[index] : names[index];
                var behavior = behaviors.Count == 0
                    ? InferBehavior(ids[index], name)
                    : ParseBehavior(behaviors[index]);
                if (behaviors.Count == 0)
                    warnings.Add($"BEHAVIOR_INFERRED: '{ids[index]}' was classified as {BehaviorName(behavior)}; provide Circulation Behaviors to make this authoritative.");
                var serviceOnly = ContainsAny($"{ids[index]} {name}", "operation", "maintenance", "service yard", "back of house");
                regions.Add(new(ids[index], name, Ring(routedFootprints[index], samplingLength), behavior,
                    PublicAccess: !serviceOnly, RequiresService: serviceOnly));
            }

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
            var refinementSettings = new PathRefinementSettings
            {
                SmoothingPasses = smoothness <= 0 ? 0 : Math.Clamp((int)Math.Ceiling(smoothness * 3), 1, 3),
                CornerCutRatio = 0.08 + smoothness * 0.2,
                ValidationStepM = Math.Max(0.2, cellSize / 4)
            };
            var refined = chains.Select(chain => PathGeometryRefiner.Refine(chain, field, refinementSettings)).ToList();
            var rendered = refined.Select(path => CreateDisplayCurve(path, field, smoothness)).ToList();
            result.DisplayPaths.AddRange(rendered.Select(item => item.Path));

            data.SetDataList(0, RenderedCurves(rendered, "public", "primary"));
            data.SetDataList(1, RenderedCurves(rendered, "public", "secondary"));
            data.SetDataList(2, RenderedCurves(rendered, "public", "tertiary"));
            data.SetDataList(3, RenderedCurves(rendered, "service", "service"));
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
            data.SetDataList(11, chains.Select(chain => (Curve)new Polyline(chain.Points.Select(ToPoint)).ToNurbsCurve()));
            data.SetDataList(12, rendered.Select(item => JsonSerializer.Serialize(new
            {
                path_id = item.Path.Source.Id,
                network = item.Path.Source.Network,
                hierarchy = item.Path.Source.Hierarchy,
                status = item.Path.Status,
                raw_points = item.Path.RawPointCount,
                refined_points = item.Path.RefinedPointCount
            })));
            data.SetDataList(13, routedFootprints);
            data.SetDataList(14, ids);
            data.SetDataList(15, names.Count == 0 ? ids : names);
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message);
        }
    }

    private static IEnumerable<Curve> RenderedCurves(
        IEnumerable<(PathRefinementResult Path, Curve Curve)> rendered,
        string network,
        string hierarchy) =>
        rendered.Where(item => item.Path.Source.Network == network && item.Path.Source.Hierarchy == hierarchy)
            .Select(item => item.Curve);

    private static (PathRefinementResult Path, Curve Curve) CreateDisplayCurve(
        PathRefinementResult path,
        MovementCostField field,
        double smoothness)
    {
        var polyline = (Curve)new Polyline(path.Points.Select(ToPoint)).ToNurbsCurve();
        if (smoothness <= 0 || path.Points.Count < 4)
            return (path with { Status = smoothness <= 0 ? "raw_requested" : path.Status }, polyline);

        var interpolated = Curve.CreateInterpolatedCurve(path.Points.Select(ToPoint), 3, CurveKnotStyle.Chord);
        var parameters = interpolated.DivideByLength(Math.Max(0.2, field.CellSizeM / 4), true);
        if (parameters is null)
            return (path with { Status = $"{path.Status}_spline_fallback" }, polyline);
        var samples = parameters.Select(parameter => ToPoint(interpolated.PointAt(parameter))).ToList();
        if (samples.Count == 0 || samples[0] != path.Points[0]) samples.Insert(0, path.Points[0]);
        if (samples[^1] != path.Points[^1]) samples.Add(path.Points[^1]);
        if (!PathGeometryRefiner.Valid(samples, field, Math.Max(0.2, field.CellSizeM / 4)))
            return (path with { Status = $"{path.Status}_spline_rejected" }, polyline);
        return (path with { Status = $"{path.Status}_fluid_spline" }, interpolated);
    }

    private static List<Curve> MatchCellsToCenters(
        IReadOnlyList<Curve> cells,
        IReadOnlyList<Point3d> centers,
        double tolerance,
        ICollection<string> warnings)
    {
        var unused = Enumerable.Range(0, cells.Count).ToHashSet();
        var ordered = new List<Curve>(centers.Count);
        for (var centerIndex = 0; centerIndex < centers.Count; centerIndex++)
        {
            var center = centers[centerIndex];
            var containing = unused.Select(index => new
                {
                    Index = index,
                    Containment = cells[index].Contains(center, Plane.WorldXY, tolerance),
                    Area = Math.Abs(AreaMassProperties.Compute(cells[index])?.Area ?? double.PositiveInfinity)
                })
                .Where(item => item.Containment is PointContainment.Inside or PointContainment.Coincident)
                .OrderBy(item => item.Area)
                .ThenBy(item => item.Index)
                .FirstOrDefault();
            var selectedIndex = containing?.Index;
            if (selectedIndex is null)
            {
                selectedIndex = unused.Select(index => new
                    {
                        Index = index,
                        Distance = (AreaMassProperties.Compute(cells[index])?.Centroid
                            ?? cells[index].GetBoundingBox(true).Center).DistanceTo(center)
                    })
                    .OrderBy(item => item.Distance)
                    .ThenBy(item => item.Index)
                    .Select(item => (int?)item.Index)
                    .FirstOrDefault();
                warnings.Add($"VORONOI_CENTER_FALLBACK: Program centre {centerIndex} was not inside any unused cell; nearest-centroid matching was used.");
            }
            if (selectedIndex is null)
                throw new ArgumentException("Voronoi cells could not be matched one-to-one with Program Centers.");
            unused.Remove(selectedIndex.Value);
            ordered.Add(cells[selectedIndex.Value].DuplicateCurve());
        }
        warnings.Add("VORONOI_ORDER_MATCHED: Program polygons were reordered one-to-one using their generating bubble centers.");
        return ordered;
    }

    private static Curve ScaleTerritory(
        Curve territory,
        Point3d pivot,
        double? targetArea,
        double maximumFill,
        out double sourceArea,
        out double footprintArea,
        out double fillRatio)
    {
        sourceArea = Math.Abs(AreaMassProperties.Compute(territory)?.Area ?? 0);
        if (sourceArea <= 1e-9)
            throw new ArgumentException("A Voronoi territory has no usable area.");
        var requestedFill = targetArea is > 0 ? targetArea.Value / sourceArea : maximumFill;
        fillRatio = Math.Clamp(requestedFill, 0.05, maximumFill);
        var scale = Math.Sqrt(fillRatio);
        var result = territory.DuplicateCurve();
        result.Transform(Transform.Scale(pivot, scale));
        footprintArea = sourceArea * fillRatio;
        return result;
    }

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
