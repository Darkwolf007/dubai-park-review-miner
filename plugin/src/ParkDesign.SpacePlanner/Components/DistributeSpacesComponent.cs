using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using ParkDesign.SpacePlanner.Core.Validation;
using Rhino;
using Rhino.Geometry;
using System.Text.Json;

namespace ParkDesign.SpacePlanner.Components;

public sealed class DistributeSpacesComponent : GH_Component
{
    private int _seedOffset;
    private bool _lastReseed;

    public DistributeSpacesComponent()
        : base(
            "Distribute Park Spaces",
            "ParkBubbles",
            "Generates suitability-aware area layouts, nodes, routes, governed relationships, climate axes, and baraha candidates from a Park Design Package.",
            "Park Design",
            "Planning")
    {
    }

    public override Guid ComponentGuid => new("3A69D610-1AF8-45E0-AB27-719BA81BFE05");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Boundary", "B", "Closed planar site boundary in EPSG:32640 metre coordinates.", GH_ParamAccess.item);
        parameters.AddTextParameter("Design Package", "J", "Path to a Park Design Package ZIP, its extracted folder, ParkDesignPackage JSON, or the legacy Results Grasshopper JSON.", GH_ParamAccess.item);
        parameters.AddIntegerParameter("Seed", "S", "Deterministic placement seed.", GH_ParamAccess.item, 1);
        parameters.AddBooleanParameter("Run", "R", "Run the deterministic planning engines.", GH_ParamAccess.item, false);
        parameters.AddBooleanParameter("All Programs", "AP", "Compatibility input. The final mixed park-design contract always processes every area, node, and route program.", GH_ParamAccess.item, true);
        parameters.AddTextParameter("Strategy", "T", "AUTO compares Balanced, Suitability, and Connectivity. Or enter one strategy name directly.", GH_ParamAccess.item, "AUTO");
        parameters.AddBooleanParameter("Use Package Boundary", "PB", "Use the georeferenced EPSG:32640 boundary stored in site.json instead of the Rhino Boundary input.", GH_ParamAccess.item, false);
        parameters.AddBooleanParameter("Reseed", "RS", "Connect a Grasshopper Button. Each rising pulse advances the deterministic seed by one.", GH_ParamAccess.item, false);
        parameters.AddTextParameter("CAD Grid GeoJSON", "CG", "Optional *_utm.geojson from CADGrid. When supplied, this designer-CAD grid replaces the package-generated analysis grid.", GH_ParamAccess.item);
        parameters[0].Optional = true;
        parameters[8].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Bubbles", "B", "Legacy per-program proxy curves retained for compatibility and diagnostics. For a clean plan, use Exclusive Territories, Shared Territories, and Landscape Overlays.", GH_ParamAccess.list);
        parameters.AddPointParameter("Centers", "C", "Program bubble centers.", GH_ParamAccess.list);
        parameters.AddTextParameter("Names", "N", "Program names matching the bubble order.", GH_ParamAccess.list);
        parameters.AddTextParameter("Warnings", "W", "Validation and unresolved-placement messages.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Package and placement summary.", GH_ParamAccess.item);
        parameters.AddPointParameter("Nodes", "P", "Placed point-program nodes.", GH_ParamAccess.list);
        parameters.AddTextParameter("Node Names", "PN", "Point-program names matching Nodes.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Routes", "R", "Conceptual route centerlines or networks; no unapproved widths are inferred.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route Names", "RN", "Route-program names matching Routes.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Relationships", "L", "Accepted-rule, designer-approved, and advisory relationship lines between placed programs.", GH_ParamAccess.list);
        parameters.AddTextParameter("Relationship Names", "LN", "Governed relationship descriptions matching Relationships.", GH_ParamAccess.list);
        parameters.AddTextParameter("Scenarios", "SC", "Compared strategy scores and counts.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Resolved Boundary", "RB", "The exact boundary used by the planning engines.", GH_ParamAccess.item);
        parameters.AddPointParameter("Area Intent Anchors", "AI", "Suitability anchors for area-type programs whose extent is unresolved because no approved area was exported.", GH_ParamAccess.list);
        parameters.AddTextParameter("Area Intent Names", "AIN", "Unresolved area-program names matching Area Intent Anchors.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route Program IDs", "RID", "Stable program IDs matching Routes.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route GIS Layers", "GL", "Suggested Rhino GIS layer paths matching Routes; connect these to BakeRoutes.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Loop Routes", "LR", "Jogging and exercise-cycling conceptual loop centerlines only.", GH_ParamAccess.list);
        parameters.AddTextParameter("Loop Names", "LN", "Program names matching Loop Routes.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Preferred Links", "PL", "Soft advisory preferred links.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Avoid Links", "AL", "Soft advisory avoid links (repulsive, retained for inspection).", GH_ParamAccess.list);
        parameters.AddCurveParameter("Accepted Links", "HL", "Designer-approved accepted-rule links.", GH_ParamAccess.list);
        parameters.AddTextParameter("Solver Diagnostics", "SD", "Energy terms, convergence, validity, and relationship satisfaction.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Dune Morphology Axes", "DMA", "Climate-informed primary sikka and ventilation-cut guide axes clipped to the site boundary.", GH_ParamAccess.list);
        parameters.AddTextParameter("Dune Axis Names", "DAN", "Role, azimuth, and evidence basis matching Dune Morphology Axes.", GH_ParamAccess.list);
        parameters.AddPointParameter("Baraha Candidates", "BC", "Movement-route intersections scored as candidate protected civic clearings.", GH_ParamAccess.list);
        parameters.AddTextParameter("Baraha Candidate Data", "BCD", "Radius, score, connected routes, and basis matching Baraha Candidates.", GH_ParamAccess.list);
        parameters.AddTextParameter("Parametric Programs", "PP", "JSON records for ontology, spatial behavior, normalized users, time/season demand, performance attributes, commercial values, and D0-D10 compatibility.", GH_ParamAccess.list);
        parameters.AddTextParameter("User Program Weights", "UPW", "JSON records mapping canonical user groups to programs with 0-1 suitability weights and auditable components.", GH_ParamAccess.list);
        parameters.AddTextParameter("Parametric Relationship Matrix", "PRM", "JSON records for the complete -1 repulsion to +1 attraction matrix. Computed advisory data; not an accepted constraint.", GH_ParamAccess.list);
        parameters.AddTextParameter("Area Reconciliation", "AR", "JSON area statement: brief gross area, measured boundary, exclusive/shared commitments, circulation, coverage overlays, and residual area.", GH_ParamAccess.item);
        parameters.AddTextParameter("Design Estimate", "DE", "JSON early-stage scores and approximate space, path, adjacency, planting, and budget quantities/costs.", GH_ParamAccess.item);
        parameters.AddTextParameter("Area Proxy Data", "APD", "JSON metadata matching Bubbles: stable ID, target area, radius, spatial mode, authority, and suitability.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route Proxy Data", "RPD", "JSON metadata matching Routes: stable ID, topology, generated/target length, width, approximate footprint, and estimated system cost.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Route Corridor Edges", "RCE", "Width-aware left/right corridor edges for physical routes with an exported width. These remain planar planning proxies.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route Corridor Data", "RCD", "JSON metadata matching Route Corridor Edges: program ID, side, width, source length, footprint, and layer.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Exclusive Territories", "ET", "Area-correct circles for programs whose spatial mode is exclusive.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Shared Territories", "ST", "One consolidated physical proxy per approved shared-use group, plus one proxy for each independent shared program.", GH_ParamAccess.list);
        parameters.AddTextParameter("Shared Territory Data", "STD", "JSON group membership, nominal demand, consolidated footprint, compatibility, overlap mode, and exclusive host.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Landscape Overlays", "LO", "Coverage-equivalent circles for quantified canopy, native planting, habitat, and bioswale overlays. Overlap is intentional.", GH_ParamAccess.list);
        parameters.AddTextParameter("Landscape Overlay Data", "LOD", "JSON coverage percentage and equivalent area matching Landscape Overlays.", GH_ParamAccess.list);
        parameters.AddTextParameter("Territory Reconciliation", "TR", "JSON comparison of exclusive proxies, consolidated shared footprint, grouped exclusive hosts, circulation, and measured site area.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Baraha Candidate Footprints", "BCF", "Alternative Baraha footprint circles using each candidate's governed radius. Candidates may overlap because they are options, not simultaneous construction geometry.", GH_ParamAccess.list);
        parameters.AddTextParameter("Dune Morphology Data", "DMD", "JSON authority, axis roles, Baraha rules, terrain ridge ranges, and the boundary between guide geometry and terrain-derived geometry.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Clean Geometry", "CGO", "Flattened, categorized planning geometry for BakePark: site, consolidated territories, overlays, route centerlines/corridors, dune guides, and Baraha alternatives. Diagnostic relationship lines are excluded.", GH_ParamAccess.list);
        parameters.AddTextParameter("Clean Geometry Names", "CGN", "Object names matching Clean Geometry.", GH_ParamAccess.list);
        parameters.AddTextParameter("Clean Geometry Layers", "CGL", "Rhino layer paths matching Clean Geometry; connect these three clean outputs to BakePark.", GH_ParamAccess.list);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null;
        var jsonPath = string.Empty;
        var seed = 1;
        var run = false;
        var includeOptional = false;
        var strategy = "AUTO";
        var usePackageBoundary = false;
        var reseed = false;
        var cadGridPath = string.Empty;
        data.GetData(0, ref boundary);
        if (!data.GetData(1, ref jsonPath)) return;
        data.GetData(2, ref seed);
        data.GetData(3, ref run);
        data.GetData(4, ref includeOptional);
        data.GetData(5, ref strategy);
        data.GetData(6, ref usePackageBoundary);
        data.GetData(7, ref reseed);
        data.GetData(8, ref cadGridPath);
        if (reseed && !_lastReseed) _seedOffset++;
        _lastReseed = reseed;
        var effectiveSeed = unchecked(seed + _seedOffset);
        if (!run) return;

        var warnings = new List<string>();
        if (RhinoDoc.ActiveDoc is { ModelUnitSystem: not UnitSystem.Meters })
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Rhino document units must be metres for EPSG:32640 input.");
            return;
        }

        DesignPackage package;
        try
        {
            package = DesignPackageLoader.LoadFile(jsonPath);
            if (!string.IsNullOrWhiteSpace(cadGridPath))
            {
                var packageGrid = package.Grid;
                package.Grid = CadGridGeoJsonLoader.LoadFile(cadGridPath, packageGrid);
                warnings.Add($"CAD_GRID_OVERRIDE: Loaded {package.Grid.Cells.Count} designer-CAD cells. Suitability and constraints were transferred from nearest package-grid centroids.");
                AddRuntimeMessage(GH_RuntimeMessageLevel.Remark, warnings[^1]);
            }
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"Could not load design package: {exception.Message}");
            return;
        }

        var validation = DesignPackageValidator.Validate(package);
        foreach (var message in validation)
        {
            var level = message.IsError
                ? GH_RuntimeMessageLevel.Error
                : IsCompatibilityNotice(message.Code)
                    ? GH_RuntimeMessageLevel.Remark
                    : GH_RuntimeMessageLevel.Warning;
            AddRuntimeMessage(level, message.Message);
            warnings.Add($"{message.Code}: {message.Message}");
        }
        if (validation.Any(message => message.IsError))
        {
            data.SetDataList(3, warnings);
            return;
        }

        List<Point2> polygon;
        if (usePackageBoundary)
        {
            if (package.PackageBoundary.Count < 3)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Use Package Boundary is True, but site.json contains no valid EPSG:32640 boundary.");
                return;
            }
            polygon = package.PackageBoundary.ToList();
            AddRuntimeMessage(GH_RuntimeMessageLevel.Remark, "Using the EPSG:32640 boundary stored in site.json.");
        }
        else
        {
            if (boundary is null || !boundary.IsClosed)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Provide a closed Rhino boundary or set Use Package Boundary to True.");
                return;
            }
            if (!boundary.IsPlanar())
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be planar.");
                return;
            }
            var parameters = boundary.DivideByCount(256, true);
            if (parameters is null || parameters.Length < 3)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary could not be sampled into a valid polygon.");
                return;
            }
            polygon = parameters.Select(parameter => boundary.PointAt(parameter)).Select(point => new Point2(point.X, point.Y)).ToList();
            if (polygon.Count > 1 && polygon[0] == polygon[^1]) polygon.RemoveAt(polygon.Count - 1);
        }

        var resolvedBoundary = new Polyline(polygon.Concat([polygon[0]]).Select(point => new Point3d(point.X, point.Y, 0))).ToNurbsCurve();
        data.SetData(12, resolvedBoundary);
        if (package.Grid.Cells.Count > 0 && !package.Grid.Cells.Any(cell => PolygonMath.Contains(polygon, new Point2(cell.X, cell.Y))))
        {
            var boundaryX = $"{polygon.Min(point => point.X):0}..{polygon.Max(point => point.X):0}";
            var boundaryY = $"{polygon.Min(point => point.Y):0}..{polygon.Max(point => point.Y):0}";
            var gridX = $"{package.Grid.Cells.Min(cell => cell.X):0}..{package.Grid.Cells.Max(cell => cell.X):0}";
            var gridY = $"{package.Grid.Cells.Min(cell => cell.Y):0}..{package.Grid.Cells.Max(cell => cell.Y):0}";
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"GRID_BOUNDARY_MISMATCH: Rhino boundary X {boundaryX}, Y {boundaryY} does not overlap package grid X {gridX}, Y {gridY}. Use the correct georeferenced boundary or set Use Package Boundary to True. No coordinates were shifted.");
            return;
        }

        var planning = PlanningEngine.Generate(polygon, package, effectiveSeed, strategy, includeOptional);
        var result = planning.Best;
        warnings.AddRange(result.Warnings);
        foreach (var warning in result.Warnings)
            AddRuntimeMessage(IsPlanningNotice(warning) ? GH_RuntimeMessageLevel.Remark : GH_RuntimeMessageLevel.Warning, warning);

        var bubbles = result.Areas.Placements
            .Select(placement => new Circle(new Point3d(placement.Center.X, placement.Center.Y, 0), placement.Radius).ToNurbsCurve())
            .ToList();
        var centers = result.Areas.Placements.Select(placement => new Point3d(placement.Center.X, placement.Center.Y, 0)).ToList();
        var names = result.Areas.Placements.Select(placement => placement.ProgramName).ToList();
        var nodePoints = result.Nodes.Select(node => new Point3d(node.Point.X, node.Point.Y, 0)).ToList();
        var nodeNames = result.Nodes.Select(node => node.ProgramName).ToList();
        var areaAnchorPoints = result.AreaAnchors.Select(node => new Point3d(node.Point.X, node.Point.Y, 0)).ToList();
        var areaAnchorNames = result.AreaAnchors.Select(node => $"{node.ProgramName} [extent unresolved]").ToList();
        var routeCurves = result.Routes.Select(route => new Polyline(route.Points.Select(point => new Point3d(point.X, point.Y, 0))).ToNurbsCurve()).ToList();
        var routeLengths = result.Routes.Select(route => route.Points.Zip(route.Points.Skip(1), (a, b) => PolygonMath.Distance(a, b)).Sum()).ToList();
        var routeNames = result.Routes.Select(route => $"{route.ProgramName} [{route.Basis}]").ToList();
        var routeProgramIds = result.Routes.Select(route => route.ProgramId).ToList();
        var routeGisLayers = result.Routes.Select(route => RouteGisLayer(route.ProgramId)).ToList();
        var loopIndexes = result.Routes.Select((route, index) => (route, index)).Where(item => item.route.Closed).ToList();
        var loopCurves = loopIndexes.Select(item => routeCurves[item.index]).ToList();
        var loopNames = loopIndexes.Select(item => $"{item.route.ProgramName} [{RouteGisLayer(item.route.ProgramId)}]").ToList();
        var relationshipCurves = result.RelationshipLines.Select(line => new LineCurve(
            new Point3d(line.Source.X, line.Source.Y, 0),
            new Point3d(line.Target.X, line.Target.Y, 0))).ToList();
        var relationshipNames = result.RelationshipLines.Select(line => $"{line.SourceId} -- {line.RelationshipType} --> {line.TargetId}").ToList();
        var scenarioSummaries = planning.Scenarios.Select(scenario =>
            $"{scenario.Strategy}: score {scenario.Score:0.0} | area bubbles {scenario.Areas.Placements.Count} | area anchors {scenario.AreaAnchors.Count} | suitability {scenario.Areas.AverageSuitability:0.00} | nodes {scenario.Nodes.Count} | route curves {scenario.Routes.Count}").ToList();
        var physicalRouteProgramCount = result.Routes.Select(route => route.ProgramId).Distinct(StringComparer.Ordinal).Count();
        var modifierProgramCount = package.RoutePrograms.Count(program => program.RouteTopology == "walking_network_attribute"
            || program.Id is "accessibleRoutes" or "shadedCirculation");
        var representedRouteProgramCount = physicalRouteProgramCount + (result.Routes.Any(route => route.ProgramId == "walkingPromenade") ? modifierProgramCount : 0);
        var representedPrograms = result.Areas.Placements.Count + result.AreaAnchors.Count + result.Nodes.Count + representedRouteProgramCount;
        var gridAuthority = package.Grid.Cells.Any(cell => cell.GridAuthority == "designer_cad") ? "designer CAD" : "package generated";
        var summary = $"{package.Project.SiteName} | {package.CoordinateSystem.Crs} | seed {effectiveSeed} | {result.Strategy} strategy | represented {representedPrograms}/{package.Programs.Count + package.NodePrograms.Count + package.RoutePrograms.Count} programs: {result.Areas.Placements.Count} area bubbles, {result.AreaAnchors.Count} unresolved-area anchors, {result.Nodes.Count} nodes, {representedRouteProgramCount} route programs ({physicalRouteProgramCount} physical systems, {modifierProgramCount} walking attributes, {result.Routes.Count} curves) | sizing {result.AreaSizingMode}, program area {result.Areas.RequestedProgramAreaM2:0} m2 / boundary area {result.Areas.BoundaryAreaM2:0} m2 | {package.Grid.Cells.Count} {gridAuthority} suitability cells | {result.MorphologyAxes.Count} climate axes | {result.BarahaCandidates.Count} baraha candidates";

        data.SetDataList(0, bubbles);
        data.SetDataList(1, centers);
        data.SetDataList(2, names);
        data.SetDataList(3, warnings);
        data.SetData(4, summary);
        data.SetDataList(5, nodePoints);
        data.SetDataList(6, nodeNames);
        data.SetDataList(7, routeCurves);
        data.SetDataList(8, routeNames);
        data.SetDataList(9, relationshipCurves);
        data.SetDataList(10, relationshipNames);
        data.SetDataList(11, scenarioSummaries);
        data.SetDataList(13, areaAnchorPoints);
        data.SetDataList(14, areaAnchorNames);
        data.SetDataList(15, routeProgramIds);
        data.SetDataList(16, routeGisLayers);
        data.SetDataList(17, loopCurves);
        data.SetDataList(18, loopNames);
        data.SetDataList(19, result.RelationshipLines.Where(line => line.Authority == "advisory" && line.RelationshipType == "preferred").Select(line => new LineCurve(new Point3d(line.Source.X, line.Source.Y, 0), new Point3d(line.Target.X, line.Target.Y, 0))));
        data.SetDataList(20, result.RelationshipLines.Where(line => line.Authority == "advisory" && line.RelationshipType == "avoid").Select(line => new LineCurve(new Point3d(line.Source.X, line.Source.Y, 0), new Point3d(line.Target.X, line.Target.Y, 0))));
        data.SetDataList(21, result.RelationshipLines.Where(line => line.Authority == "accepted_rule").Select(line => new LineCurve(new Point3d(line.Source.X, line.Source.Y, 0), new Point3d(line.Target.X, line.Target.Y, 0))));
        var diagnostics = result.SolverDiagnostics;
        data.SetDataList(22, diagnostics is null ? [] : new[]
        {
            $"valid={diagnostics.Valid} converged={diagnostics.Converged} iterations={diagnostics.IterationCount} hard_violations={diagnostics.HardViolationCount}",
            $"energy total={diagnostics.Energy.Total:0.####} suitability={diagnostics.Energy.Suitability:0.####} overlap={diagnostics.Energy.Overlap:0.####} boundary={diagnostics.Energy.Boundary:0.####} preferred={diagnostics.Energy.Preferred:0.####} avoid={diagnostics.Energy.Avoid:0.####} accepted={diagnostics.Energy.Accepted:0.####}",
            $"average_suitability={diagnostics.AverageSuitability:0.####} relationship_satisfaction={diagnostics.RelationshipSatisfactionRatio:0.####}"
        });
        data.SetDataList(23, result.MorphologyAxes.Select(axis => new Polyline(axis.Points.Select(point => new Point3d(point.X, point.Y, 0))).ToNurbsCurve()));
        data.SetDataList(24, result.MorphologyAxes.Select(axis => $"{axis.Id} | {axis.Role} | azimuth {axis.AzimuthDegFromNorth:0.0}deg | {axis.Basis}"));
        data.SetDataList(25, result.BarahaCandidates.Select(candidate => new Point3d(candidate.Point.X, candidate.Point.Y, 0)));
        data.SetDataList(26, result.BarahaCandidates.Select(candidate => $"radius={candidate.RadiusM:0.0}m score={candidate.Score:0.00} routes={string.Join(',', candidate.RouteProgramIds)} | {candidate.Basis}"));
        var jsonOptions = new JsonSerializerOptions();
        data.SetDataList(27, package.Programs.Concat(package.NodePrograms).Concat(package.RoutePrograms).Select(program => JsonSerializer.Serialize(new
        {
            program.Id, program.Name, program.Ontology, program.SpatialBehavior, program.UserGroupIds,
            program.TemporalProfile, program.SeasonalProfile, program.PerformanceAttributes,
            program.Commercial, program.DuneCompatibility, program.PathDuneOperations
        }, jsonOptions)));
        data.SetDataList(28, package.UserProgramSuitability.Select(item => JsonSerializer.Serialize(item, jsonOptions)));
        data.SetDataList(29, package.ParametricRelationships.Select(item => JsonSerializer.Serialize(item, jsonOptions)));
        data.SetData(30, JsonSerializer.Serialize(package.AreaReconciliation, jsonOptions));
        data.SetData(31, JsonSerializer.Serialize(package.DesignEstimate, jsonOptions));
        data.SetDataList(32, result.Areas.Placements.Select(placement =>
        {
            var program = package.Programs.First(item => item.Id == placement.ProgramId);
            return JsonSerializer.Serialize(new
            {
                id = placement.ProgramId,
                name = placement.ProgramName,
                geometry_type = "area_proxy",
                target_area_m2 = placement.TargetAreaM2,
                radius_m = placement.Radius,
                spatial_mode = program.SpatialMode,
                area_authority = program.AreaStatus,
                suitability_score = placement.SuitabilityScore
            }, jsonOptions);
        }));
        data.SetDataList(33, result.Routes.Select(route =>
        {
            var program = package.RoutePrograms.First(item => item.Id == route.ProgramId);
            var estimate = package.DesignEstimate.Paths.Systems.FirstOrDefault(item => item.Id == route.ProgramId);
            var generatedLength = route.Points.Zip(route.Points.Skip(1), (a, b) => PolygonMath.Distance(a, b)).Sum();
            var generatedSystemLength = result.Routes.Where(item => item.ProgramId == route.ProgramId)
                .Sum(item => item.Points.Zip(item.Points.Skip(1), (a, b) => PolygonMath.Distance(a, b)).Sum());
            return JsonSerializer.Serialize(new
            {
                id = route.ProgramId,
                name = route.ProgramName,
                geometry_type = "route_centerline_proxy",
                topology = program.RouteTopology,
                closed = route.Closed,
                basis = route.Basis,
                attributes = route.Attributes ?? [],
                source_anchor_id = route.SourceAnchorId,
                target_anchor_id = route.TargetAnchorId,
                generated_length_m = Math.Round(generatedLength, 2),
                target_length_m = program.TargetLengthM,
                target_width_m = program.TargetWidthM,
                generated_footprint_m2 = program.TargetWidthM is null ? (double?)null : Math.Round(generatedLength * program.TargetWidthM.Value, 2),
                estimated_system_area_m2 = estimate?.ApproximateAreaM2,
                estimated_system_cost_aed = estimate?.ApproximateCostAed,
                allocated_proxy_cost_aed = estimate?.ApproximateCostAed is null || generatedSystemLength <= 0 ? (double?)null
                    : Math.Round(estimate.ApproximateCostAed.Value * generatedLength / generatedSystemLength, 2)
            }, jsonOptions);
        }));
        var corridorEdges = new List<Curve>();
        var corridorData = new List<string>();
        var corridorNames = new List<string>();
        var corridorLayers = new List<string>();
        var tolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? .01;
        for (var index = 0; index < result.Routes.Count; index++)
        {
            var route = result.Routes[index];
            var program = package.RoutePrograms.First(item => item.Id == route.ProgramId);
            if (program.TargetWidthM is not > 0) continue;
            foreach (var (side, distance) in new[] { ("left", program.TargetWidthM.Value / 2), ("right", -program.TargetWidthM.Value / 2) })
            {
                var offsets = routeCurves[index].Offset(Plane.WorldXY, distance, tolerance, CurveOffsetCornerStyle.Round);
                if (offsets is null) continue;
                foreach (var offset in offsets)
                {
                    corridorEdges.Add(offset);
                    corridorNames.Add($"{route.ProgramName} corridor {side} edge");
                    corridorLayers.Add($"PARK_DESIGN::03_MOVEMENT::Corridor Edges::{route.ProgramName}");
                    corridorData.Add(JsonSerializer.Serialize(new
                    {
                        id = route.ProgramId,
                        side,
                        width_m = program.TargetWidthM,
                        source_length_m = Math.Round(routeLengths[index], 2),
                        approximate_footprint_m2 = Math.Round(routeLengths[index] * program.TargetWidthM.Value, 2),
                        layer = RouteGisLayer(route.ProgramId)
                    }, jsonOptions));
                }
            }
        }
        data.SetDataList(34, corridorEdges);
        data.SetDataList(35, corridorData);
        var allExclusiveTerritories = result.Areas.Placements.Where(placement => placement.SpatialMode == "exclusive").ToList();
        var groupedHostIds = result.SharedTerritories.Select(territory => territory.ExclusiveHostProgramId)
            .Where(id => id is not null).ToHashSet(StringComparer.Ordinal);
        var exclusiveTerritories = allExclusiveTerritories.Where(placement => !groupedHostIds.Contains(placement.ProgramId)).ToList();
        var exclusiveTerritoryCurves = exclusiveTerritories.Select(placement =>
            new Circle(new Point3d(placement.Center.X, placement.Center.Y, 0), placement.Radius).ToNurbsCurve()).ToList();
        var sharedTerritoryCurves = result.SharedTerritories.Select(territory =>
            new Circle(new Point3d(territory.Center.X, territory.Center.Y, 0), territory.Radius).ToNurbsCurve()).ToList();
        data.SetDataList(36, exclusiveTerritoryCurves);
        data.SetDataList(37, sharedTerritoryCurves);
        data.SetDataList(38, result.SharedTerritories.Select(territory => JsonSerializer.Serialize(new
        {
            id = territory.TerritoryId,
            name = territory.Name,
            program_ids = territory.ProgramIds,
            nominal_demand_m2 = Math.Round(territory.NominalDemandM2, 2),
            approximate_footprint_m2 = Math.Round(territory.ApproximateFootprintM2, 2),
            average_compatibility = Math.Round(territory.AverageCompatibility, 3),
            overlap_mode = territory.OverlapMode,
            exclusive_host_program_id = territory.ExclusiveHostProgramId
        }, jsonOptions)));
        var landscapeOverlayCurves = result.LandscapeOverlays.Select(overlay =>
            new Circle(new Point3d(overlay.Center.X, overlay.Center.Y, 0), overlay.Radius).ToNurbsCurve()).ToList();
        data.SetDataList(39, landscapeOverlayCurves);
        data.SetDataList(40, result.LandscapeOverlays.Select(overlay => JsonSerializer.Serialize(new
        {
            id = overlay.ProgramId,
            name = overlay.Name,
            coverage_percent = overlay.CoveragePercent,
            equivalent_area_m2 = Math.Round(overlay.EquivalentAreaM2, 2),
            overlap_policy = "landscape_overlay_not_additive_to_exclusive_footprint"
        }, jsonOptions)));
        var ungroupedExclusiveArea = exclusiveTerritories.Sum(placement => placement.TargetAreaM2);
        var consolidatedSharedArea = result.SharedTerritories.Sum(territory => territory.ApproximateFootprintM2);
        data.SetData(41, JsonSerializer.Serialize(new
        {
            measured_site_area_m2 = package.AreaReconciliation.MeasuredBoundaryAreaM2 ?? result.Areas.BoundaryAreaM2,
            exported_exclusive_committed_area_m2 = package.AreaReconciliation.ExclusiveCommittedAreaM2,
            exclusive_program_proxy_area_m2 = allExclusiveTerritories.Sum(placement => placement.TargetAreaM2),
            grouped_exclusive_host_area_m2 = allExclusiveTerritories.Where(placement => groupedHostIds.Contains(placement.ProgramId)).Sum(placement => placement.TargetAreaM2),
            ungrouped_exclusive_proxy_area_m2 = ungroupedExclusiveArea,
            consolidated_shared_territory_footprint_m2 = Math.Round(consolidatedSharedArea, 2),
            consolidated_program_proxy_footprint_m2 = Math.Round(ungroupedExclusiveArea + consolidatedSharedArea, 2),
            circulation_target_m2 = package.AreaReconciliation.CirculationAreaM2,
            landscape_overlays_additive = false,
            note = "Shared footprint is an early-stage proxy and is not added blindly to the exported exclusive commitment."
        }, jsonOptions));

        var barahaFootprints = result.BarahaCandidates.Select(candidate =>
            new Circle(new Point3d(candidate.Point.X, candidate.Point.Y, 0), candidate.RadiusM).ToNurbsCurve()).ToList();
        data.SetDataList(42, barahaFootprints);
        data.SetData(43, JsonSerializer.Serialize(new
        {
            authority = package.ClimateMorphology.Authority,
            geometry_status = new
            {
                axes = "clipped_planar_design_guides",
                baraha_footprints = "alternative_candidate_proxies_not_simultaneous_geometry",
                dune_ridges_and_hollows = "unresolved_until_authoritative_terrain_mesh_is_connected"
            },
            axes = result.MorphologyAxes.Select(axis => new
            {
                axis.Id,
                axis.Role,
                azimuth_deg_from_north = axis.AzimuthDegFromNorth,
                axis.Basis
            }),
            baraha_rules = package.ClimateMorphology.BarahaRules,
            terrain_rules = package.ClimateMorphology.TerrainRules,
            note = "No dune width, ridge surface, hollow, or elevation geometry is invented by ParkBubbles. Use the Terrain components with the authoritative mesh."
        }, jsonOptions));

        var cleanGeometry = new List<Curve>();
        var cleanNames = new List<string>();
        var cleanLayers = new List<string>();
        AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, resolvedBoundary, "Site Boundary", "PARK_DESIGN::01_SITE::Boundary");
        for (var index = 0; index < exclusiveTerritoryCurves.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, exclusiveTerritoryCurves[index], exclusiveTerritories[index].ProgramName, "PARK_DESIGN::02_PROGRAM::Exclusive Territories");
        for (var index = 0; index < sharedTerritoryCurves.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, sharedTerritoryCurves[index], result.SharedTerritories[index].Name, "PARK_DESIGN::02_PROGRAM::Shared Territories");
        for (var index = 0; index < landscapeOverlayCurves.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, landscapeOverlayCurves[index], result.LandscapeOverlays[index].Name, "PARK_DESIGN::04_LANDSCAPE::Coverage Overlays");
        for (var index = 0; index < routeCurves.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, routeCurves[index], routeNames[index], CleanRouteLayer(result.Routes[index].ProgramId));
        for (var index = 0; index < corridorEdges.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, corridorEdges[index], corridorNames[index], corridorLayers[index]);
        for (var index = 0; index < result.MorphologyAxes.Count; index++)
        {
            var axis = result.MorphologyAxes[index];
            var curve = new Polyline(axis.Points.Select(point => new Point3d(point.X, point.Y, 0))).ToNurbsCurve();
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, curve, axis.Id, MorphologyAxisLayer(axis.Role));
        }
        for (var index = 0; index < barahaFootprints.Count; index++)
            AddCleanGeometry(cleanGeometry, cleanNames, cleanLayers, barahaFootprints[index], $"Baraha alternative {index + 1:00}", "PARK_DESIGN::05_MORPHOLOGY::Baraha Alternatives");
        data.SetDataList(44, cleanGeometry);
        data.SetDataList(45, cleanNames);
        data.SetDataList(46, cleanLayers);
    }

    private static void AddCleanGeometry(List<Curve> geometry, List<string> names, List<string> layers,
        Curve curve, string name, string layer)
    {
        geometry.Add(curve);
        names.Add(name);
        layers.Add(layer);
    }

    private static string CleanRouteLayer(string programId) =>
        $"PARK_DESIGN::03_MOVEMENT::Centerlines::{programId switch
        {
            "walkingPromenade" => "Walking Promenade",
            "joggingLoop" => "Jogging Loop",
            "exerciseCyclingLoop" => "Exercise Cycling Loop",
            "serviceAccess" => "Service Access",
            "smartLightingNetwork" => "Smart Lighting Network",
            "bioswale" => "Bioswale Network",
            _ => programId
        }}";

    private static string MorphologyAxisLayer(string role) => role switch
    {
        "primary_sikka" => "PARK_DESIGN::05_MORPHOLOGY::Primary Sikka Guide",
        "ventilation_cut" => "PARK_DESIGN::05_MORPHOLOGY::Ventilation Cut Guides",
        _ => "PARK_DESIGN::05_MORPHOLOGY::Other Guides"
    };

    private static string RouteGisLayer(string programId) => programId switch
    {
        "walkingPromenade" => "PARK_DESIGN_GIS::Movement::Walking Promenade",
        "joggingLoop" => "PARK_DESIGN_GIS::Movement::Jogging Loop",
        "exerciseCyclingLoop" => "PARK_DESIGN_GIS::Movement::Exercise Cycling Loop",
        "accessibleRoutes" => "PARK_DESIGN_GIS::Movement::Accessible Routes",
        "shadedCirculation" => "PARK_DESIGN_GIS::Movement::Shaded Circulation",
        "serviceAccess" => "PARK_DESIGN_GIS::Service::Service Access",
        "smartLightingNetwork" => "PARK_DESIGN_GIS::Systems::Smart Lighting Network",
        "bioswale" => "PARK_DESIGN_GIS::Landscape::Bioswale Network",
        _ => $"PARK_DESIGN_GIS::Movement::{programId}"
    };

    private static bool IsCompatibilityNotice(string code) =>
        code is "LEGACY_MANIFEST" or "GRID_EMPTY" or "RELATIONSHIPS_EMPTY"
            or "PROGRAM_COVERAGE_UNRESOLVED" or "PROGRAM_AREA_UNRESOLVED";

    private static bool IsPlanningNotice(string message) =>
        message.StartsWith("All defined area programs are included.", StringComparison.Ordinal);
}
