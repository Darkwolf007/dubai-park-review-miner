using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using ParkDesign.SpacePlanner.Core.Validation;
using System.IO.Compression;
using System.Text.Json;

var legacyJson = """
{
  "units": "meters",
  "projection": "EPSG:32640",
  "program_spaces": [
    { "space_id": "play", "space_name": "Inclusive Play", "target_area_m2": 600, "location_zone": "INNER_BUFFER" },
    { "space_id": "seating", "space_name": "Family Seating", "target_area_m2": 200, "location_zone": "ACTIVE_EDGE" }
  ]
}
""";

var package = DesignPackageLoader.LoadJson(legacyJson);
Require(package.AdaptedFromLegacyManifest, "Legacy manifest must be detected.");
Require(package.Programs.Count == 2, "Legacy programs must be adapted.");
Require(!DesignPackageValidator.Validate(package).Any(message => message.IsError), "Valid legacy package must not contain validation errors.");

var labelledCrsJson = legacyJson.Replace("EPSG:32640", "UTM Zone 40N / EPSG:32640");
var labelledCrsPackage = DesignPackageLoader.LoadJson(labelledCrsJson);
Require(!DesignPackageValidator.Validate(labelledCrsPackage).Any(message => message.Code == "CRS_UNSUPPORTED"), "Equivalent UTM Zone 40N labels must be accepted.");

var boundary = new List<Point2>
{
    new(500000, 2780000),
    new(500100, 2780000),
    new(500100, 2780100),
    new(500000, 2780100)
};
var result = BubbleDistributor.Distribute(boundary, package.Programs, seed: 7);
Require(Math.Abs(Math.Abs(PolygonMath.SignedArea(boundary)) - 10000) < 0.001, "Boundary area must be 10,000 m2.");
Require(result.Placements.Count == 2, "Both bubbles must be placed.");
Require(result.Placements.All(placement => PolygonMath.Contains(boundary, placement.Center)), "Every center must be inside the boundary.");
Require(result.Placements.All(placement => PolygonMath.DistanceToBoundary(boundary, placement.Center) >= placement.Radius), "Every bubble must be fully inside the boundary.");
Require(PolygonMath.Distance(result.Placements[0].Center, result.Placements[1].Center) >= result.Placements[0].Radius + result.Placements[1].Radius, "Bubbles must not overlap.");

var conceptualLoops = RouteGenerator.Generate(
    boundary,
    [
        new ProgramDefinition { Id = "joggingLoop", Name = "Jogging Loop", GeometryType = "linear", Selected = true },
        new ProgramDefinition { Id = "exerciseCyclingLoop", Name = "Exercise Cycling Loop", GeometryType = "linear", Selected = true }
    ],
    [], [], [], [], true, []).Routes;
Require(conceptualLoops.Count == 2 && conceptualLoops.All(route => route.Closed), "Jogging and cycling conceptual loops must both be generated.");
Require(conceptualLoops[0].Points[0] != conceptualLoops[1].Points[0], "Conceptual loop layers must be visibly separated rather than coincident.");

var geographic = CoordinateTransforms.Utm40NToWgs84(new Point2(320785, 2783369));
Require(Math.Abs(geographic.Longitude - 55.22) < 0.02 && Math.Abs(geographic.Latitude - 25.15) < 0.02, "EPSG:32640 must convert to the expected Al Safa WGS84 location.");
var cadGridFeature = new CadGridFeature("cad-grid-0001", "BASEGRID::Cells", [
    new Point2(320700, 2783300), new Point2(320710, 2783300), new Point2(320710, 2783310), new Point2(320700, 2783310), new Point2(320700, 2783300)
], 100);
using (var utmDocument = JsonDocument.Parse(CadGridGeoJsonExporter.SerializeUtm([cadGridFeature])))
{
    var exported = utmDocument.RootElement.GetProperty("features")[0];
    Require(exported.GetProperty("properties").GetProperty("analysis_grid_authority").GetString() == "designer_cad", "CAD grid GeoJSON must disclose designer-CAD authority.");
    Require(exported.GetProperty("geometry").GetProperty("coordinates")[0].GetArrayLength() == 5, "CAD grid GeoJSON must preserve a closed polygon ring.");
}
var cadGridPath = Path.Combine(Path.GetTempPath(), $"cad-grid-{Guid.NewGuid():N}.geojson");
try
{
    File.WriteAllText(cadGridPath, CadGridGeoJsonExporter.SerializeUtm([cadGridFeature]));
    var sourceScores = new GridDefinition { Cells = [new GridCell { Id = "source", X = 320705, Y = 2783305, Scores = new Dictionary<string, double?> { ["jogging_route_suitability"] = 0.85 } }] };
    var loadedCadGrid = CadGridGeoJsonLoader.LoadFile(cadGridPath, sourceScores);
    Require(loadedCadGrid.Cells.Count == 1 && loadedCadGrid.Cells[0].GridAuthority == "designer_cad", "Designer CAD grid cells must load as authoritative grid geometry.");
    Require(loadedCadGrid.Cells[0].Scores["jogging_route_suitability"] == 0.85, "Nearest package-grid suitability must transfer to CAD cells.");
    Require(loadedCadGrid.Cells[0].Ring.Count == 4 && loadedCadGrid.Cells[0].AreaM2 == 100, "CAD polygon geometry and area must remain available to downstream engines.");
}
finally
{
    if (File.Exists(cadGridPath)) File.Delete(cadGridPath);
}

var zipPath = Path.Combine(Path.GetTempPath(), $"park-design-package-{Guid.NewGuid():N}.zip");
var extractedPath = Path.Combine(Path.GetTempPath(), $"park-design-package-{Guid.NewGuid():N}");
try
{
    using (var archive = ZipFile.Open(zipPath, ZipArchiveMode.Create))
    {
        AddEntry(archive, "manifest.json", """{"schema_version":"1.0.0","project":{"site_name":"ZIP Test"},"coordinate_system":{"crs":"EPSG:32640","units":"meters"}}""");
        AddEntry(archive, "site.json", """{"boundary_utm":{"type":"Polygon","coordinates":[[[500000,2780000],[500100,2780000],[500100,2780100],[500000,2780100],[500000,2780000]]]}}""");
        AddEntry(archive, "area_programs.json", """{"programs":[{"id":"play","name":"Play","geometry_type":"area","target_area_m2":500,"selected":true}]}""");
        AddEntry(archive, "node_programs.json", """{"programs":[{"id":"water","name":"Water","geometry_type":"point","selected":false}]}""");
        AddEntry(archive, "route_programs.json", """{"programs":[{"id":"loop","name":"Loop","geometry_type":"linear","selected":false}]}""");
        AddEntry(archive, "grid.json", """{"cells":[{"id":"cell-1","x":500020,"y":2780020,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-2","x":500080,"y":2780020,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-3","x":500020,"y":2780080,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-4","x":500080,"y":2780080,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}}]}""");
        AddEntry(archive, "relationships.json", """{"accepted_rule_edges":[{"edge_id":"edge-1","source_node_id":"play","target_node_id":"water","relationship_type":"within distance","graph_layer":"distance","mandatory":true,"decision":"accepted","numeric_constraint":{"value":100,"unit":"m","parameter":"maximum distance"}}]}""");
        AddEntry(archive, "unresolved.json", """{"rules":[{"rule_id":"rule-2","reason":"source_unmapped"}]}""");
        AddEntry(archive, "access_candidates.json", """{"candidates":[{"candidate_id":"a","edge_id":"edge-1","coordinates":{"x":500000,"y":2780000,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":100,"population_within_catchment":1000},"metrics_normalized":{"population_pull":0.8,"transit_access":0.7,"intersection_connectivity":0.6,"road_access":0.9,"low_barrier_access":0.8}},{"candidate_id":"b","edge_id":"edge-2","coordinates":{"x":500100,"y":2780100,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":80,"population_within_catchment":800},"metrics_normalized":{"population_pull":0.7,"transit_access":0.6,"intersection_connectivity":0.5,"road_access":0.8,"low_barrier_access":0.7}},{"candidate_id":"c","edge_id":"edge-1","coordinates":{"x":500050,"y":2780000,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":60,"population_within_catchment":600},"metrics_normalized":{"population_pull":0.6,"transit_access":0.4,"intersection_connectivity":0.4,"road_access":1.0,"low_barrier_access":0.9}}]}""");
        AddEntry(archive, "access_pair_metrics.json", """{"pairs":[{"candidate_a":"a","candidate_b":"b","distance_m":141.421,"same_edge":false,"catchment_overlap_ratio":0.2,"additional_population_served_by_a":700,"additional_population_served_by_b":500,"combined_population_served":1500},{"candidate_a":"a","candidate_b":"c","distance_m":50,"same_edge":true,"catchment_overlap_ratio":0.5,"additional_population_served_by_a":500,"additional_population_served_by_b":100,"combined_population_served":1100},{"candidate_a":"b","candidate_b":"c","distance_m":111.803,"same_edge":false,"catchment_overlap_ratio":0.3,"additional_population_served_by_a":600,"additional_population_served_by_b":400,"combined_population_served":1200}]}""");
        AddEntry(archive, "movement_requirements.json", """{"loops_connect_both_public_entrances":true,"walking":{"accessibility_scope":"primary_accessible_network","may_share_with_jogging":true},"jogging":{"route_type":"closed_loop","length_objective":"maximize_feasible_useful_length"},"exercise_cycling":{"program_id":"exerciseCyclingLoop","route_type":"closed_loop"},"service":{"must_connect_program_id":"operationsArea","may_share_public_paths":false}}""");
        AddEntry(archive, "terrain_requirements.json", """{"authoritative_input":"rhino_mesh","optimizer_may_modify_terrain":true,"required_comparison":["cut_volume_m3","fill_volume_m3"]}""");
        AddEntry(archive, "masterplan_settings.json", """{"candidateSpacingM":10,"accessCatchmentRadiusM":800,"roadEdgeMaxDistanceM":25,"allPedestrianRoutesAccessible":false,"allowWalkingJoggingSharing":true,"allowServicePublicPathSharing":false}""");
    }
    var zipPackage = DesignPackageLoader.LoadFile(zipPath);
    Require(zipPackage.Project.SiteName == "ZIP Test", "ZIP manifest project must load.");
    Require(zipPackage.PackageBoundary.Count == 4, "ZIP site boundary must load separately.");
    Require(zipPackage.Programs.Count == 1 && zipPackage.Programs[0].GeometryType == "area", "ZIP area programs must load separately.");
    Require(zipPackage.NodePrograms.Count == 1 && zipPackage.RoutePrograms.Count == 1, "ZIP node and route programs must load separately.");
    Require(zipPackage.Grid.Cells.Count == 4, "ZIP grid cells must load.");
    Require(zipPackage.Relationships.Count == 1 && zipPackage.Relationships[0].Accepted, "Only accepted ZIP relationships must load.");
    Require(zipPackage.Relationships[0].NumericValue == 100 && zipPackage.Relationships[0].NumericUnit == "m", "Accepted numeric relationship provenance must load.");
    Require(zipPackage.Unresolved.Count == 1, "ZIP unresolved rules must load.");
    Require(zipPackage.AccessCandidates.Count == 3 && zipPackage.AccessCandidatePairs.Count == 3, "ZIP access candidates and pair metrics must load.");
    Require(zipPackage.MovementRequirements.LoopsConnectBothPublicEntrances, "ZIP movement requirements must load.");
    Require(zipPackage.TerrainRequirements.AuthoritativeInput == "rhino_mesh" && zipPackage.TerrainRequirements.OptimizerMayModifyTerrain, "ZIP terrain requirements must load.");
    Require(zipPackage.MasterplanSettings.AccessCatchmentRadiusM == 800, "ZIP masterplan settings must load.");

    var access = AccessCombinationEvaluator.Evaluate(zipPackage, mainIndex: 0, secondaryIndex: 1, serviceIndex: 2);
    Require(access.IsValid, "A valid three-access combination must pass hard constraints.");
    Require(access.CombinedPopulationServed == 1500 && access.AdditionalPopulationFromSecondary == 500, "Access population pair metrics must retain main/secondary direction.");
    Require(access.FitnessValues.Count == 8 && access.FitnessValues[0] == -1500, "Wallacei fitness values must negate maximization objectives.");
    var invalidAccess = AccessCombinationEvaluator.Evaluate(zipPackage, mainIndex: 0, secondaryIndex: 0, serviceIndex: 2);
    Require(!invalidAccess.IsValid && invalidAccess.FitnessValues.All(value => value == 1_000_000_000), "Invalid duplicate entrance genes must receive deterministic penalties.");

    var planned = PlanningEngine.Generate(boundary, zipPackage, seed: 7, strategyName: "AUTO", includeOptionalNodesAndRoutes: false);
    Require(planned.Scenarios.Count == 3, "AUTO must compare three deterministic strategies.");
    Require(planned.Best.Areas.Placements.Count == 1, "The planning engine must place every area with a defined extent.");
    Require(planned.Best.Nodes.Count == 1, "The planning engine must place nodes even when legacy selection metadata is false.");
    Require(planned.Best.Routes.Count == 1 && planned.Best.Routes[0].Closed, "The planning engine must generate routes even when legacy selection metadata is false.");
    Require(planned.Best.RelationshipLines.Count == 1, "Accepted relationships must become explicit relationship geometry.");

    var alternateSeed = PlanningEngine.Generate(boundary, zipPackage, seed: 107, strategyName: "Balanced", includeOptionalNodesAndRoutes: false);
    Require(planned.Best.Areas.Placements[0].Center != alternateSeed.Best.Areas.Placements[0].Center, "Changing the seed must change an otherwise equivalent candidate layout.");

    var allocation = ProgramAreaAllocator.AllocateAll([
        new ProgramDefinition { Id = "a", Name = "A", MinimumAreaM2 = 3000, TargetAreaM2 = 6000 },
        new ProgramDefinition { Id = "b", Name = "B", MinimumAreaM2 = 3000, TargetAreaM2 = 6000 }
    ], boundaryAreaM2: 10000);
    Require(allocation.Mode == "documented_minimums" && allocation.Programs.Sum(item => item.TargetAreaM2) == 6000, "All-area allocation must use documented minimums when targets exceed the site.");

    ZipFile.ExtractToDirectory(zipPath, extractedPath);
    var extractedPackage = DesignPackageLoader.LoadFile(extractedPath);
    Require(extractedPackage.Project.SiteName == "ZIP Test", "An extracted package folder must load.");
    Require(extractedPackage.Programs.Count == 1, "Extracted area programs must load.");
}
finally
{
    if (File.Exists(zipPath)) File.Delete(zipPath);
    if (Directory.Exists(extractedPath)) Directory.Delete(extractedPath, recursive: true);
}

Console.WriteLine("All ParkDesign.SpacePlanner core smoke tests passed.");

if (args.Length > 0)
{
    var realPackage = DesignPackageLoader.LoadFile(args[0]);
    Require(realPackage.PackageBoundary.Count >= 3, "The supplied real package must contain a boundary.");
    var realPlan = PlanningEngine.Generate(realPackage.PackageBoundary, realPackage, seed: 1, strategyName: "AUTO", includeOptionalNodesAndRoutes: true);
    var best = realPlan.Best;
    var routePrograms = best.Routes.Select(route => route.ProgramId).Distinct(StringComparer.Ordinal).Count();
    Console.WriteLine($"REAL_PACKAGE strategy={best.Strategy} area_bubbles={best.Areas.Placements.Count}/{realPackage.Programs.Count(program => program.TargetAreaM2 is > 0)} area_anchors={best.AreaAnchors.Count}/{realPackage.Programs.Count(program => program.TargetAreaM2 is null or <= 0)} nodes={best.Nodes.Count}/{realPackage.NodePrograms.Count} route_programs={routePrograms}/{realPackage.RoutePrograms.Count} route_curves={best.Routes.Count} area_m2={best.Areas.RequestedProgramAreaM2:0}/{best.Areas.BoundaryAreaM2:0}");
    foreach (var warning in best.Warnings) Console.WriteLine($"REAL_WARNING {warning}");
}

static void AddEntry(ZipArchive archive, string name, string content)
{
    var entry = archive.CreateEntry(name);
    using var writer = new StreamWriter(entry.Open());
    writer.Write(content);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
