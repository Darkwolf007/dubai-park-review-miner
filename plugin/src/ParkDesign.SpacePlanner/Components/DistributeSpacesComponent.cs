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
        parameters.AddCurveParameter("Bubbles", "B", "Area-correct program bubble curves.", GH_ParamAccess.list);
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
        var routeProgramCount = result.Routes.Select(route => route.ProgramId).Distinct(StringComparer.Ordinal).Count();
        var representedPrograms = result.Areas.Placements.Count + result.AreaAnchors.Count + result.Nodes.Count + routeProgramCount;
        var gridAuthority = package.Grid.Cells.Any(cell => cell.GridAuthority == "designer_cad") ? "designer CAD" : "package generated";
        var summary = $"{package.Project.SiteName} | {package.CoordinateSystem.Crs} | seed {effectiveSeed} | {result.Strategy} strategy | represented {representedPrograms}/{package.Programs.Count + package.NodePrograms.Count + package.RoutePrograms.Count} programs: {result.Areas.Placements.Count} area bubbles, {result.AreaAnchors.Count} unresolved-area anchors, {result.Nodes.Count} nodes, {routeProgramCount} route programs ({result.Routes.Count} curves) | sizing {result.AreaSizingMode}, program area {result.Areas.RequestedProgramAreaM2:0} m2 / boundary area {result.Areas.BoundaryAreaM2:0} m2 | {package.Grid.Cells.Count} {gridAuthority} suitability cells | {result.MorphologyAxes.Count} climate axes | {result.BarahaCandidates.Count} baraha candidates";

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
    }

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
