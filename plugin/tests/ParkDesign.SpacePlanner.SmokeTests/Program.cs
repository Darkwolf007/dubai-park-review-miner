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
Require(conceptualLoops.All(route => route.Points.Count > boundary.Count + 1), "Conceptual park loops must round boundary corners instead of reproducing a hard-edged scaled polygon.");

var hierarchicalWalking = RouteGenerator.Generate(
    boundary,
    [new ProgramDefinition { Id = "walkingPromenade", Name = "Walking Promenade", GeometryType = "linear", Selected = true }],
    [
        new BubblePlacement("play", "Play", new(500050, 2780080), 5, 80, "INNER_BUFFER"),
        new BubblePlacement("cafe", "Cafe", new(500050, 2780020), 5, 80, "INNER_BUFFER")
    ],
    [],
    [
        new NodePlacement("mainEntrancePlaza", "Main Entrance", new(500005, 2780050), 1),
        new NodePlacement("secondaryEntrances", "Secondary Entrance", new(500095, 2780050), 1)
    ],
    [], true, [],
    [new MovementDemandDefinition { Origin = "mainEntrancePlaza", Destination = "play", Weight = 5 }]).Routes;
var primarySpine = hierarchicalWalking.Single(route => route.Basis.StartsWith("curvilinear_primary_spine", StringComparison.Ordinal));
var feederBranches = hierarchicalWalking.Where(route => route.Basis.StartsWith("hierarchical_spine_branch", StringComparison.Ordinal)).ToList();
Require(primarySpine.SourceAnchorId == "mainEntrancePlaza" && primarySpine.TargetAnchorId == "secondaryEntrances",
    "Walking hierarchy must use the two public entrances as primary-spine endpoints when both exist.");
Require(feederBranches.Count == 1 && feederBranches.All(route => route.Attributes?.Contains("secondary") == true),
    "Every area not already served by the spine must receive one traceable secondary branch instead of arbitrary area-to-area chords.");
Require(feederBranches.All(branch => primarySpine.Points.Zip(primarySpine.Points.Skip(1),
        (a, b) => DistanceToTestSegment(branch.Points[^1], a, b)).Min() < 0.001),
    "Every walking branch must terminate on the primary spine.");

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
        AddEntry(archive, "area_programs.json", """{"programs":[{"id":"play","name":"Play","geometry_type":"area","target_area_m2":500,"selected":true,"mandatory":true,"spatial_mode":"shared"}]}""");
        AddEntry(archive, "node_programs.json", """{"programs":[{"id":"water","name":"Water","geometry_type":"point","selected":false}]}""");
        AddEntry(archive, "route_programs.json", """{"programs":[{"id":"loop","name":"Loop","geometry_type":"linear","selected":false}]}""");
        AddEntry(archive, "grid.json", """{"cells":[{"id":"cell-1","x":500020,"y":2780020,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-2","x":500080,"y":2780020,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-3","x":500020,"y":2780080,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}},{"id":"cell-4","x":500080,"y":2780080,"constraint":false,"scores":{"play_suitability":0.8,"water_suitability":0.8}}]}""");
        AddEntry(archive, "relationships.json", """{"accepted_rule_edges":[{"edge_id":"edge-1","source_node_id":"play","target_node_id":"water","relationship_type":"within distance","graph_layer":"distance","mandatory":true,"decision":"accepted","numeric_constraint":{"value":100,"unit":"m","parameter":"maximum distance"}}],"designer_relationships":[{"id":"designer-overlap","source":"play","target":"water","type":"overlap_compatible","accepted":true,"authority":"designer_approved_competition_input","compatibility_score":0.5,"overlap_mode":"shared_footprint"}]}""");
        AddEntry(archive, "unresolved.json", """{"rules":[{"rule_id":"rule-2","reason":"source_unmapped"}]}""");
        AddEntry(archive, "access_candidates.json", """{"candidates":[{"candidate_id":"a","edge_id":"edge-1","coordinates":{"x":500000,"y":2780000,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":100,"population_within_catchment":1000},"metrics_normalized":{"population_pull":0.8,"transit_access":0.7,"intersection_connectivity":0.6,"road_access":0.9,"low_barrier_access":0.8}},{"candidate_id":"b","edge_id":"edge-2","coordinates":{"x":500100,"y":2780100,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":80,"population_within_catchment":800},"metrics_normalized":{"population_pull":0.7,"transit_access":0.6,"intersection_connectivity":0.5,"road_access":0.8,"low_barrier_access":0.7}},{"candidate_id":"c","edge_id":"edge-1","coordinates":{"x":500050,"y":2780000,"crs":"EPSG:32640"},"eligible_roles":{"main_entrance":true,"secondary_entrance":true,"drop_off":true,"service_entrance":true},"hard_exclusions":[],"metrics_raw":{"population_pull":60,"population_within_catchment":600},"metrics_normalized":{"population_pull":0.6,"transit_access":0.4,"intersection_connectivity":0.4,"road_access":1.0,"low_barrier_access":0.9}}]}""");
        AddEntry(archive, "access_pair_metrics.json", """{"pairs":[{"candidate_a":"a","candidate_b":"b","distance_m":141.421,"same_edge":false,"catchment_overlap_ratio":0.2,"additional_population_served_by_a":700,"additional_population_served_by_b":500,"combined_population_served":1500},{"candidate_a":"a","candidate_b":"c","distance_m":50,"same_edge":true,"catchment_overlap_ratio":0.5,"additional_population_served_by_a":500,"additional_population_served_by_b":100,"combined_population_served":1100},{"candidate_a":"b","candidate_b":"c","distance_m":111.803,"same_edge":false,"catchment_overlap_ratio":0.3,"additional_population_served_by_a":600,"additional_population_served_by_b":400,"combined_population_served":1200}]}""");
        AddEntry(archive, "movement_requirements.json", """{"loops_connect_both_public_entrances":true,"walking":{"accessibility_scope":"primary_accessible_network","may_share_with_jogging":true},"jogging":{"route_type":"closed_loop","length_objective":"maximize_feasible_useful_length"},"exercise_cycling":{"program_id":"exerciseCyclingLoop","route_type":"closed_loop"},"service":{"must_connect_program_id":"operationsArea","may_share_public_paths":false}}""");
        AddEntry(archive, "terrain_requirements.json", """{"authoritative_input":"rhino_mesh","optimizer_may_modify_terrain":true,"required_comparison":["cut_volume_m3","fill_volume_m3"]}""");
        AddEntry(archive, "climate_morphology.json", """{"authority":"designer_approved_competition_input","site_axes":{"principal_long_axis_azimuth_deg_from_north":21,"primary_sikka":{"id":"primary_sikka","role":"ventilated_accessible_valley","azimuth_deg_from_north":21,"offset_m":0,"basis":"test"},"ventilation_cuts":[{"id":"west_east","role":"wind_erosion_passage","azimuth_deg_from_north":90,"offset_m":10,"basis":"test"}]},"baraha_rules":{"minimum_distinct_routes":2,"cluster_distance_m":6,"minimum_radius_m":6,"maximum_radius_m":14,"social_program_ids":["play"]},"terrain_rules":{"observed_relief_m":1.372,"preferred_landscape_ridge_height_m":{"minimum":0.6,"maximum":1.8}},"coordinate_transform":{"obj_axis_convention":"rhino_y_up","utm_easting":"obj_x","utm_northing":"-obj_z","elevation":"obj_y"}}""");
        AddEntry(archive, "planting_strategy.json", """{"source_file":"plants.csv","source_authority":"simulation_dataset_competition_design_support_only","automation_policy":"candidate_generation_only","hydrozones":[{"id":"HZ-CREST","name":"Desert Crest","water_demand":"very_low","morphology":"ridge"}],"optimization_objectives":["minimize_irrigation_pipe_length"]}""");
        AddEntry(archive, "masterplan_settings.json", """{"candidateSpacingM":10,"accessCatchmentRadiusM":800,"roadEdgeMaxDistanceM":25,"allPedestrianRoutesAccessible":false,"allowWalkingJoggingSharing":true,"allowServicePublicPathSharing":false}""");
    }
    var zipPackage = DesignPackageLoader.LoadFile(zipPath);
    Require(zipPackage.Project.SiteName == "ZIP Test", "ZIP manifest project must load.");
    Require(zipPackage.PackageBoundary.Count == 4, "ZIP site boundary must load separately.");
    Require(zipPackage.Programs.Count == 1 && zipPackage.Programs[0].GeometryType == "area", "ZIP area programs must load separately.");
    Require(zipPackage.NodePrograms.Count == 1 && zipPackage.RoutePrograms.Count == 1, "ZIP node and route programs must load separately.");
    Require(zipPackage.Grid.Cells.Count == 4, "ZIP grid cells must load.");
    Require(zipPackage.Relationships.Count == 2 && zipPackage.Relationships.All(item => item.Accepted), "Accepted standards and designer-approved overlap relationships must load.");
    Require(zipPackage.Relationships[0].NumericValue == 100 && zipPackage.Relationships[0].NumericUnit == "m", "Accepted numeric relationship provenance must load.");
    Require(zipPackage.Unresolved.Count == 1, "ZIP unresolved rules must load.");
    Require(zipPackage.AccessCandidates.Count == 3 && zipPackage.AccessCandidatePairs.Count == 3, "ZIP access candidates and pair metrics must load.");
    Require(zipPackage.MovementRequirements.LoopsConnectBothPublicEntrances, "ZIP movement requirements must load.");
    Require(zipPackage.TerrainRequirements.AuthoritativeInput == "rhino_mesh" && zipPackage.TerrainRequirements.OptimizerMayModifyTerrain, "ZIP terrain requirements must load.");
    Require(zipPackage.MasterplanSettings.AccessCatchmentRadiusM == 800, "ZIP masterplan settings must load.");
    Require(zipPackage.Programs[0].Mandatory && zipPackage.Programs[0].SpatialMode == "shared", "Mandatory program and spatial-mode metadata must load.");
    Require(zipPackage.ClimateMorphology.SiteAxes.PrimarySikka.AzimuthDegFromNorth == 21, "Climate morphology and primary sikka axis must load.");
    Require(zipPackage.PlantingStrategy.Hydrozones.Count == 1, "Governed planting strategy must load.");

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
    Require(planned.Best.RelationshipLines.Count == 2, "Accepted standards and designer-approved relationships must become explicit relationship geometry.");
    Require(planned.Best.MorphologyAxes.Count == 2, "Primary sikka and ventilation-cut axes must be generated from package climate data.");

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

RelationshipCompilerAndSolverTests();
CirculationFoundationTests();
Console.WriteLine("All ParkDesign.SpacePlanner core smoke tests passed.");

if (args.Length > 0)
{
    var realPackage = DesignPackageLoader.LoadFile(args[0]);
    Require(realPackage.PackageBoundary.Count >= 3, "The supplied real package must contain a boundary.");
    var realValidation = DesignPackageValidator.Validate(realPackage);
    var realPrograms = realPackage.Programs.Concat(realPackage.NodePrograms).Concat(realPackage.RoutePrograms).ToList();
    Require(realPrograms.Count == 44 && realPrograms.All(program => !string.IsNullOrWhiteSpace(program.SpatialBehavior) && program.UserGroupIds.Count > 0),
        "All 44 programs must load their spatial behavior and normalized user mappings.");
    Require(realPackage.UserGroups.Count == 14 && realPackage.UserProgramSuitability.Count == 616,
        "The canonical user model must provide a complete 14 x 44 suitability mapping.");
    Require(realPackage.ParametricRelationships.Count == 946,
        "The parametric model must provide every unordered relationship in the 44-program matrix.");
    Require(!realValidation.Any(message => message.Message.Contains("will not be placed", StringComparison.OrdinalIgnoreCase)),
        "Mandatory unresolved programs must be described as represented intent anchors, not omitted placements.");
    var unresolvedAreaNotices = realValidation.Count(message => message.Code is "PROGRAM_COVERAGE_UNRESOLVED" or "PROGRAM_AREA_UNRESOLVED");
    Require(unresolvedAreaNotices <= 2,
        "Unresolved landscape coverage and area extents must remain consolidated informational notices.");
    Require(realPackage.AreaReconciliation.Status != "complete"
        || realValidation.All(message => message.Code != "PROGRAM_COVERAGE_UNRESOLVED"),
        "Quantified coverage targets in a complete reconciliation must not be reported as unresolved.");
    Require(realPackage.AreaReconciliation.BriefGrossAreaM2 == 15000
        && realPackage.AreaReconciliation.ExclusiveProgramAreaM2 == 7525
        && realPackage.AreaReconciliation.CirculationAreaM2 == 6000,
        "The Rhino importer must preserve the brief area statement and circulation reconciliation.");
    Require(realPackage.DesignEstimate.Scores.OverallReadiness is > 0
        && realPackage.DesignEstimate.Paths.Systems.Count == 4
        && realPackage.DesignEstimate.Plants.ApproximateTreeCount is > 0,
        "The Rhino importer must preserve readiness, path, planting, and cost estimates.");
    Require(realPackage.MovementDemands.Count == 50 && realPackage.MovementDemands.All(demand => demand.Weight > 0),
        "The importer must preserve the aggregated persona OD movement weights.");
    Require(realPackage.RoutePrograms.Single(program => program.Id == "walkingPromenade").TargetLengthM == 650
        && realPackage.RoutePrograms.Single(program => program.Id == "serviceAccess").TargetWidthM == 4,
        "Route proxy dimensions must load from the v1.4 package.");

    var canonicalPath = Path.Combine(args[0], "park_design_package.json");
    if (File.Exists(canonicalPath))
    {
        var canonical = DesignPackageLoader.LoadFile(canonicalPath);
        Require(canonical.PackageBoundary.Count >= 3 && canonical.Programs.Count == 22
            && canonical.NodePrograms.Count == 14 && canonical.RoutePrograms.Count == 8,
            "The canonical v1.4 JSON must adapt into area, node, and route proxy collections without split files.");
        Require(canonical.AreaReconciliation.Status == "complete"
            && canonical.DesignEstimate.Paths.Systems.Count == 4,
            "Canonical constraints must carry reconciliation and estimate data.");
    }
    var realPlan = PlanningEngine.Generate(realPackage.PackageBoundary, realPackage, seed: 1, strategyName: "AUTO", includeOptionalNodesAndRoutes: true);
    var best = realPlan.Best;
    Require(best.AreaSizingMode == "exported_targets", "The reconciled package must not fall back to minimums merely because shared demand overlaps exclusive areas.");
    Require(best.Areas.Placements.Count == realPackage.Programs.Count(program => program.TargetAreaM2 is > 0),
        "Every quantified area program must receive a proxy placement.");
    Require(best.SolverDiagnostics?.Valid == true,
        "The final proxy layout must satisfy boundary, exclusive separation, shared compatibility, and accepted hard constraints.");
    Require(best.SharedTerritories.Count == 6
        && best.SharedTerritories.SelectMany(territory => territory.ProgramIds)
            .Where(id => realPackage.Programs.Single(program => program.Id == id).SpatialMode == "shared")
            .Distinct(StringComparer.Ordinal).Count() == 8,
        "All eight shared programs must consolidate into six non-duplicated physical territory proxies.");
    var lawnTerritory = best.SharedTerritories.Single(territory => territory.ProgramIds.Contains("flexibleEventLawn"));
    Require(lawnTerritory.ProgramIds.Count == 3 && lawnTerritory.ApproximateFootprintM2 < lawnTerritory.NominalDemandM2,
        "The approved lawn/recreation group must retain nominal demand while reducing its physical proxy footprint.");
    Require(best.LandscapeOverlays.Count == 4 && best.LandscapeOverlays.All(overlay => overlay.CoveragePercent > 0),
        "The four quantified landscape systems must generate separate non-additive overlay proxies.");
    var routePrograms = best.Routes.Select(route => route.ProgramId).Distinct(StringComparer.Ordinal).Count();
    var walkingRoutes = best.Routes.Where(route => route.ProgramId == "walkingPromenade").ToList();
    Require(walkingRoutes.Count > 1 && walkingRoutes.All(route => route.Attributes?.Contains("accessible") == true
        && route.Attributes.Contains("shade_priority") && route.SourceAnchorId is not null && route.TargetAnchorId is not null),
        "Walking must be a traceable OD-weighted connector network with accessibility and shade attributes.");
    var exclusiveIds = realPackage.Programs.Where(program => program.SpatialMode == "exclusive")
        .Select(program => program.Id).ToHashSet(StringComparer.Ordinal);
    var obstructedWalkingRoutes = walkingRoutes.Where(route => !RouteAvoidsUnrelatedExclusiveBubbles(route, best.Areas.Placements, exclusiveIds)).ToList();
    Require(obstructedWalkingRoutes.Count == 0,
        $"Walking connectors must terminate at program edges and avoid unrelated exclusive bubble interiors: {string.Join(", ", obstructedWalkingRoutes.Select(route => $"{route.SourceAnchorId}->{route.TargetAnchorId} through [{string.Join('|', RouteObstructionIds(route, best.Areas.Placements, exclusiveIds))}]"))}.");
    Require(best.Routes.Count(route => route.ProgramId == "serviceAccess") == 1
        && best.Routes.Single(route => route.ProgramId == "serviceAccess").Points.Count == 2,
        "Service access must be one boundary-to-operations spur.");
    Require(best.Routes.All(route => route.ProgramId is not "accessibleRoutes" and not "shadedCirculation"),
        "Accessibility and shade must not be emitted as duplicate physical centerlines.");
    var nodeSpanX = best.Nodes.Max(node => node.Point.X) - best.Nodes.Min(node => node.Point.X);
    var nodeSpanY = best.Nodes.Max(node => node.Point.Y) - best.Nodes.Min(node => node.Point.Y);
    var boundarySpanX = realPackage.PackageBoundary.Max(point => point.X) - realPackage.PackageBoundary.Min(point => point.X);
    var boundarySpanY = realPackage.PackageBoundary.Max(point => point.Y) - realPackage.PackageBoundary.Min(point => point.Y);
    var routeFingerprints = best.Routes.GroupBy(route => route.ProgramId, StringComparer.Ordinal)
        .Select(group => string.Join("|", group.SelectMany(route => route.Points).Select(point => $"{point.X:0.0},{point.Y:0.0}")))
        .Distinct(StringComparer.Ordinal).Count();
    Require(nodeSpanX / boundarySpanX >= .6 && nodeSpanY / boundarySpanY >= .6, "Point programs must occupy the park in both axes rather than clustering on one edge.");
    Require(routeFingerprints >= 6, "Movement programs must not collapse onto one shared route geometry.");
    Require(best.MorphologyAxes.Count > 0 && best.MorphologyAxes.All(axis => axis.Points.Count >= 2),
        "Dune morphology must remain a set of non-degenerate, site-clipped guide axes.");
    Require(best.BarahaCandidates.All(candidate =>
            candidate.RadiusM >= realPackage.ClimateMorphology.BarahaRules.MinimumRadiusM
            && candidate.RadiusM <= realPackage.ClimateMorphology.BarahaRules.MaximumRadiusM),
        "Every Baraha candidate footprint must retain the governed minimum/maximum radius range.");
    Console.WriteLine($"REAL_PACKAGE strategy={best.Strategy} area_bubbles={best.Areas.Placements.Count}/{realPackage.Programs.Count(program => program.TargetAreaM2 is > 0)} area_anchors={best.AreaAnchors.Count}/{realPackage.Programs.Count(program => program.TargetAreaM2 is null or <= 0)} nodes={best.Nodes.Count}/{realPackage.NodePrograms.Count} node_span={nodeSpanX / boundarySpanX:P0}x{nodeSpanY / boundarySpanY:P0} route_programs={routePrograms}/{realPackage.RoutePrograms.Count} route_curves={best.Routes.Count} morphology_axes={best.MorphologyAxes.Count} baraha={best.BarahaCandidates.Count} area_m2={best.Areas.RequestedProgramAreaM2:0}/{best.Areas.BoundaryAreaM2:0}");
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

static bool RouteAvoidsUnrelatedExclusiveBubbles(RoutePlacement route, IReadOnlyList<BubblePlacement> bubbles,
    IReadOnlySet<string> exclusiveIds)
{
    var allowedIds = RouteAllowedProgramIds(route);
    foreach (var bubble in bubbles.Where(bubble => exclusiveIds.Contains(bubble.ProgramId)
        && !allowedIds.Contains(bubble.ProgramId)))
    for (var index = 0; index < route.Points.Count - 1; index++)
    {
        var a = route.Points[index]; var b = route.Points[index + 1];
        var dx = b.X - a.X; var dy = b.Y - a.Y; var lengthSquared = dx * dx + dy * dy;
        var t = lengthSquared <= 1e-12 ? 0 : Math.Clamp(((bubble.Center.X - a.X) * dx + (bubble.Center.Y - a.Y) * dy) / lengthSquared, 0, 1);
        var closest = new Point2(a.X + dx * t, a.Y + dy * t);
        if (PolygonMath.Distance(closest, bubble.Center) < bubble.Radius - .1) return false;
    }
    return true;
}

static IReadOnlyList<string> RouteObstructionIds(RoutePlacement route, IReadOnlyList<BubblePlacement> bubbles,
    IReadOnlySet<string> exclusiveIds)
{
    var result = new List<string>();
    var allowedIds = RouteAllowedProgramIds(route);
    foreach (var bubble in bubbles.Where(bubble => exclusiveIds.Contains(bubble.ProgramId)
        && !allowedIds.Contains(bubble.ProgramId)))
    for (var index = 0; index < route.Points.Count - 1; index++)
    {
        var a = route.Points[index]; var b = route.Points[index + 1];
        var dx = b.X - a.X; var dy = b.Y - a.Y; var lengthSquared = dx * dx + dy * dy;
        var t = lengthSquared <= 1e-12 ? 0 : Math.Clamp(((bubble.Center.X - a.X) * dx + (bubble.Center.Y - a.Y) * dy) / lengthSquared, 0, 1);
        var closest = new Point2(a.X + dx * t, a.Y + dy * t);
        if (PolygonMath.Distance(closest, bubble.Center) < bubble.Radius - .1)
        {
            result.Add(bubble.ProgramId);
            break;
        }
    }
    return result;
}

static HashSet<string> RouteAllowedProgramIds(RoutePlacement route)
{
    var result = new HashSet<string>(StringComparer.Ordinal);
    if (route.SourceAnchorId is not null) result.Add(route.SourceAnchorId);
    if (route.TargetAnchorId is not null) result.Add(route.TargetAnchorId);
    foreach (var attribute in route.Attributes ?? [])
        if (attribute.StartsWith("via:", StringComparison.Ordinal) && attribute.Length > 4)
            result.Add(attribute[4..]);
    return result;
}

static double DistanceToTestSegment(Point2 point, Point2 a, Point2 b)
{
    var dx = b.X - a.X;
    var dy = b.Y - a.Y;
    var lengthSquared = dx * dx + dy * dy;
    var t = lengthSquared <= 1e-12 ? 0 : Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / lengthSquared, 0, 1);
    return PolygonMath.Distance(point, new Point2(a.X + dx * t, a.Y + dy * t));
}

static void RelationshipCompilerAndSolverTests()
{
    var boundary = new List<Point2> { new(0, 0), new(120, 0), new(120, 120), new(0, 120) };
    var programs = new List<ProgramDefinition>
    {
        new() { Id = "a", Name = "A", TargetAreaM2 = Math.PI, Priority = 1, SuitabilityField = "a_score" },
        new() { Id = "b", Name = "B", TargetAreaM2 = Math.PI, Priority = .8 },
        new() { Id = "intent", Name = "Intent", AreaStatus = "unresolved", TargetAreaM2 = null }
    };
    var package = new DesignPackage { Programs = programs, Relationships =
    [
        new() { Id = "p1", Source = "a", Target = "b", Type = "preferred", Authority = "advisory", Confidence = .8 },
        new() { Id = "p2", Source = "b", Target = "a", Type = "preferred", Authority = "advisory", Confidence = .8 },
        new() { Id = "hard", Source = "a", Target = "b", Type = "avoid", Accepted = true, Authority = "accepted_rule", Mandatory = true },
        new() { Id = "broken", Source = "a", Target = "missing", Type = "preferred", Authority = "advisory" }
    ] };
    var compiled = SpatialRelationshipCompiler.Compile(package);
    Require(compiled.Conflicts.Count == 1 && compiled.Graph.Edges.Count == 1, "Accepted avoid must override, but report, reciprocal advisory preferred edges.");
    Require(compiled.Statistics.UnresolvedReferences == 1 && compiled.Warnings.Count == 1, "Broken references must warn without crashing.");

    package.Relationships = package.Relationships.Take(2).ToList();
    var deduplicated = SpatialRelationshipCompiler.Compile(package);
    Require(deduplicated.Graph.Edges.Count == 1 && deduplicated.Graph.Edges[0].Provenance.Count == 2, "Symmetric advisory edges must compile to one force with both provenance records.");
    Require(deduplicated.Graph.Edges[0].Weight is >= 0 and <= 1 && deduplicated.Graph.Edges[0].WeightComponents is not null, "Heuristic weight must be normalized and explainable.");

    var initial = new List<BubblePlacement> { new("a", "A", new(30, 60), 1, Math.PI, ""), new("b", "B", new(90, 60), 1, Math.PI, "") };
    var emptyGraph = new SpatialRelationshipGraph();
    var baseline = AreaRelaxationSolver.Solve(boundary, programs, initial, new(), emptyGraph, LayoutStrategy.Balanced);
    var preferred = AreaRelaxationSolver.Solve(boundary, programs, initial, new(), deduplicated.Graph, LayoutStrategy.Balanced);
    var baselineDistance = PolygonMath.Distance(baseline.Agents[0].Position, baseline.Agents[1].Position);
    var preferredDistance = PolygonMath.Distance(preferred.Agents[0].Position, preferred.Agents[1].Position);
    Require(preferredDistance < baselineDistance, "Preferred relationship must reduce distance relative to baseline.");
    var repeated = AreaRelaxationSolver.Solve(boundary, programs, initial, new(), deduplicated.Graph, LayoutStrategy.Balanced);
    Require(repeated.Agents.Select(a => a.Position).SequenceEqual(preferred.Agents.Select(a => a.Position)) && repeated.Diagnostics.Energy == preferred.Diagnostics.Energy, "Solver must be deterministic.");
    Require(preferred.Agents.All(a => PolygonMath.DistanceToBoundary(boundary, a.Position) >= a.Radius), "Whole bubbles must remain inside the boundary.");
    Require(PolygonMath.Distance(preferred.Agents[0].Position, preferred.Agents[1].Position) + 1e-7 >= 2, "Resolved bubbles must not overlap.");
    Require(preferred.Agents.All(a => a.ProgramId != "intent"), "Unresolved areas must not enter the solver.");

    var maxGraph = new SpatialRelationshipGraph { Edges = [new SpatialRelationshipEdge { Id = "max", SourceId = "a", TargetId = "b", RelationshipType = "distance", Authority = RelationshipAuthority.AcceptedRule, Mandatory = true, HardConstraint = true, NumericConstraint = new("maximum_distance", 5), Weight = 1 }] };
    var limited = AreaRelaxationSolver.Solve(boundary, programs, initial, new(), maxGraph, LayoutStrategy.Balanced, new(MaximumIterations: 1, MaximumMovementPerIteration: 0));
    Require(!limited.Diagnostics.Valid && limited.Diagnostics.HardViolationCount > 0 && limited.Diagnostics.Edges.Single().NumericRulePassed == false, "A violated accepted numeric maximum must invalidate the solution.");

    var near = new List<BubblePlacement> { new("a", "A", new(50, 60), 1, Math.PI, ""), new("b", "B", new(52.5, 60), 1, Math.PI, "") };
    var avoidGraph = new SpatialRelationshipGraph { Edges = [new SpatialRelationshipEdge { Id = "avoid", SourceId = "a", TargetId = "b", RelationshipType = "avoid", Authority = RelationshipAuthority.Advisory, Weight = 1 }] };
    var avoided = AreaRelaxationSolver.Solve(boundary, programs, near, new(), avoidGraph, LayoutStrategy.Connectivity);
    Require(PolygonMath.Distance(avoided.Agents[0].Position, avoided.Agents[1].Position) > 2.5, "Advisory avoid must increase distance.");

    var overlapPackage = new DesignPackage { Programs = programs, Relationships =
    [
        new() { Id = "overlap", Source = "a", Target = "b", Type = "overlap_compatible", Accepted = true,
            Authority = "designer_approved_competition_input", CompatibilityScore = .75, OverlapMode = "shared_footprint" }
    ] };
    var overlapGraph = SpatialRelationshipCompiler.Compile(overlapPackage).Graph;
    var overlapping = new List<BubblePlacement> { new("a", "A", new(50, 60), 1, Math.PI, ""), new("b", "B", new(51, 60), 1, Math.PI, "") };
    var overlapResult = AreaRelaxationSolver.Solve(boundary, programs, overlapping, new(), overlapGraph, LayoutStrategy.Balanced,
        new(MaximumIterations: 1, MaximumMovementPerIteration: 0));
    Require(overlapResult.Diagnostics.Valid, "Designer-approved compatible programs may share territory without a false hard-overlap violation.");

    var grid = new GridDefinition { Cells = [new() { Id = "low", X = 25, Y = 60, Scores = new() { ["a_score"] = 0 } }, new() { Id = "high", X = 75, Y = 60, Scores = new() { ["a_score"] = 1 } }] };
    var oneInitial = new List<BubblePlacement> { new("a", "A", new(50, 60), 1, Math.PI, "") };
    var suitability = AreaRelaxationSolver.Solve(boundary, programs, oneInitial, grid, emptyGraph, LayoutStrategy.Suitability);
    Require(suitability.Agents[0].Position.X > 50 && suitability.Diagnostics.AverageSuitability > 0, "Program-specific suitability must move the agent toward the better cell.");

    var balancedEnergy = AreaSolverWeights.For(LayoutStrategy.Balanced);
    var suitabilityEnergy = AreaSolverWeights.For(LayoutStrategy.Suitability);
    var connectivityEnergy = AreaSolverWeights.For(LayoutStrategy.Connectivity);
    Require(suitabilityEnergy.Suitability > balancedEnergy.Suitability && connectivityEnergy.Preferred > balancedEnergy.Preferred, "Strategies must expose measurably different energy emphasis.");
}

static void CirculationFoundationTests()
{
    var site = new List<Point2> { new(0, 0), new(100, 0), new(100, 60), new(0, 60) };
    var spaces = new List<SpaceRegion>
    {
        new("play", "Inclusive Play", [new(30, 20), new(55, 20), new(55, 45), new(30, 45)],
            SpaceCirculationBehavior.DestinationOnly, AccessPointCount: 2),
        new("lawn", "Event Lawn", [new(60, 10), new(90, 10), new(90, 50), new(60, 50)],
            SpaceCirculationBehavior.PermeableLandscape)
    };
    var entrances = new List<SiteEntrance>
    {
        new("main", new(0, 30), SiteEntranceType.Main, DemandWeight: 2),
        new("secondary", new(100, 30), SiteEntranceType.Secondary)
    };
    var demands = new List<MovementDemandDefinition>
    {
        new() { Origin = "play", Destination = "lawn", Weight = 4 },
        new() { Origin = "main", Destination = "play", Weight = 8 }
    };
    var explicitPoints = new List<ExplicitAccessPoint>
    {
        new("play-gate", "play", new(30, 32), Priority: 2, Accessible: true)
    };

    Require(SpaceRegionValidator.Validate(site, spaces).Count == 0,
        "Valid authoritative program polygons must pass circulation validation.");
    var generated = AccessPointGenerator.Generate(site, spaces, entrances, demands, explicitPoints);
    Require(generated.Selected.Count(point => point.ProgramId == "play") == 2,
        "Explicit access-count overrides must control selected boundary access points.");
    Require(generated.Selected.Any(point => point.ProgramId == "play" && point.Source == "explicit"),
        "Designer-authored access points must be retained and selected.");
    Require(generated.Candidates.All(point =>
            PolygonMath.DistanceToBoundary(spaces.Single(space => space.ProgramId == point.ProgramId).Ring, point.Point) < 0.001),
        "Every generated program access point must lie on its authoritative polygon boundary.");

    var repeated = AccessPointGenerator.Generate(site, spaces, entrances, demands, explicitPoints);
    Require(generated.Candidates.Select(point => point.Id).SequenceEqual(repeated.Candidates.Select(point => point.Id)),
        "Access-point IDs and ordering must be deterministic.");
    var accessJson = CirculationJsonWriter.SerializeAccessPoints(generated);
    using var accessDocument = JsonDocument.Parse(accessJson);
    Require(accessDocument.RootElement.GetProperty("schema_version").GetString() == "1.0.0"
        && accessDocument.RootElement.GetProperty("access_points").GetArrayLength() == generated.Candidates.Count,
        "Access-point JSON must be versioned and preserve all candidate records.");

    var invalid = new List<SpaceRegion>
    {
        new("bowtie", "Invalid", [new(10, 10), new(30, 30), new(10, 30), new(30, 10)],
            SpaceCirculationBehavior.HardBarrier)
    };
    Require(SpaceRegionValidator.Validate(site, invalid).Any(error => error.StartsWith("SPACE_RING_SELF_INTERSECTION", StringComparison.Ordinal)),
        "Self-intersecting authoritative program polygons must be rejected before routing.");

    var resultJson = CirculationJsonWriter.SerializeResult(new CirculationResult
    {
        AccessPoints = generated.Selected,
        Nodes = [new("node-main", new(0, 30), "entrance")],
        Edges =
        [
            new()
            {
                Id = "edge-primary-1", StartNodeId = "node-main", EndNodeId = "node-play",
                Centerline = [new(0, 30), new(30, 32)], Network = "public", Hierarchy = "primary",
                LengthM = 30.067, WidthM = 3, TotalFlow = 8, Accessible = true, ReusedRouteCount = 2
            }
        ]
    });
    using var resultDocument = JsonDocument.Parse(resultJson);
    var exportedEdge = resultDocument.RootElement.GetProperty("edges")[0];
    Require(exportedEdge.GetProperty("lands_design").GetProperty("stable_object_key").GetString() == "edge-primary-1",
        "Circulation-result JSON must expose stable Lands Design object keys.");

    var previewRegions = SpaceRegionAdapters.FromBubbles(
        [new BubblePlacement("preview", "Preview", new(20, 20), 5, Math.PI * 25, "")]);
    Require(previewRegions.Single().PreviewOnly && previewRegions.Single().Ring.Count == 24,
        "Bubble geometry must remain available only through an explicitly marked preview adapter.");

    var routingSite = new List<Point2> { new(0, 0), new(100, 0), new(100, 60), new(0, 60) };
    var barrier = new SpaceRegion("building", "Building",
        [new(40, 0), new(60, 0), new(60, 45), new(40, 45)],
        SpaceCirculationBehavior.HardBarrier);
    var field = MovementCostFieldBuilder.Build(routingSite, [barrier], new() { CellSizeM = 5 });
    Require(field.Cells.Any(cell => !cell.Traversable && cell.ContainingProgramId == "building"),
        "Hard-barrier polygons must create impassable movement-cost cells.");
    var path = GridPathfinder.FindPath(field, new(5, 30), new(95, 30));
    Require(path.Found && path.Points.Any(point => point.Y > 45),
        "A* must find the available route around a blocking program polygon.");
    Require(path.Points.Where(point => point != path.Points[0] && point != path.Points[^1])
            .All(point => !PolygonMath.Contains(barrier.Ring, point)),
        "A* must never route through hard-barrier cells.");
    var repeatedPath = GridPathfinder.FindPath(field, new(5, 30), new(95, 30));
    Require(path.Points.SequenceEqual(repeatedPath.Points) && Math.Abs(path.AccumulatedCost - repeatedPath.AccumulatedCost) < 1e-9,
        "Grid construction and A* routing must be deterministic.");

    var networkSpaces = new List<SpaceRegion>
    {
        new("hub", "Community Plaza", [new(42, 25), new(52, 25), new(52, 35), new(42, 35)],
            SpaceCirculationBehavior.DestinationOnly),
        new("play-east", "Play East", [new(82, 42), new(92, 42), new(92, 52), new(82, 52)],
            SpaceCirculationBehavior.DestinationOnly),
        new("garden-east", "Garden East", [new(82, 8), new(92, 8), new(92, 18), new(82, 18)],
            SpaceCirculationBehavior.DestinationOnly),
        new("operations", "Operations", [new(5, 5), new(15, 5), new(15, 15), new(5, 15)],
            SpaceCirculationBehavior.HardBarrier, PublicAccess: false, RequiresService: true)
    };
    var networkInput = new CirculationInput
    {
        Spaces = networkSpaces,
        Entrances =
        [
            new("main", new(0, 30), SiteEntranceType.Main, DemandWeight: 2),
            new("secondary", new(100, 30), SiteEntranceType.Secondary),
            new("service", new(0, 8), SiteEntranceType.Service, AllowsService: true)
        ],
        MovementDemands =
        [
            new() { Origin = "hub", Destination = "play-east", Weight = 8, JourneyIds = ["family"] },
            new() { Origin = "hub", Destination = "garden-east", Weight = 5, JourneyIds = ["quiet"] }
        ],
        PointDestinations = [new("fountain", "Fountain", new(70, 30))],
        DesignerHubProgramId = "hub",
        CostSettings = new() { CellSizeM = 3, RouteReuseBenefit = 0.5 }
    };
    var network = CirculationNetworkBuilder.Build(routingSite, networkInput);
    Require(network.Audit.IsValid && network.HubProgramId == "hub",
        "The circulation builder must honor a valid designer hub and connect all required destinations.");
    Require(network.Edges.Any(edge => edge.Hierarchy == "primary")
        && network.Edges.Any(edge => edge.Network == "service" && edge.Hierarchy == "service"),
        "The circulation builder must create a demand hierarchy and a separately classified service graph.");
    Require(network.Edges.Where(edge => edge.Network == "public").Max(edge => edge.ReusedRouteCount) > 1,
        "Merged public graph edges must record reuse by multiple routed demands.");
    Require(network.OdAssignments.All(assignment => assignment.Found),
        "Every valid test OD pair must retain a successful graph assignment.");
    var repeatedNetwork = CirculationNetworkBuilder.Build(routingSite, networkInput);
    Require(CirculationJsonWriter.SerializeResult(network) == CirculationJsonWriter.SerializeResult(repeatedNetwork),
        "The complete circulation graph JSON must be byte-stable for identical inputs.");
    var chains = CirculationPathExtractor.Extract(network);
    Require(chains.Count > 0 && chains.All(chain => chain.Points.Count >= 2)
        && chains.SelectMany(chain => chain.EdgeIds).OrderBy(id => id, StringComparer.Ordinal)
            .SequenceEqual(network.Edges.Select(edge => edge.Id).OrderBy(id => id, StringComparer.Ordinal)),
        "Display path chains must cover every graph edge exactly once without exposing disconnected grid fragments.");

    var missingEndpointInput = new CirculationInput
    {
        Spaces = networkInput.Spaces,
        Entrances = networkInput.Entrances,
        PointDestinations = networkInput.PointDestinations,
        MovementDemands = [new() { Origin = "hub", Destination = "missing-program", Weight = 1 }]
    };
    var missingEndpointNetwork = CirculationNetworkBuilder.Build(routingSite, missingEndpointInput);
    Require(missingEndpointNetwork.OdAssignments.Single(assignment => assignment.OriginId == "hub").Found == false
        && CirculationJsonWriter.SerializeResult(missingEndpointNetwork).Contains("\"accumulated_cost\": null", StringComparison.Ordinal),
        "Missing OD endpoints must remain visible as serializable failed assignments instead of being silently dropped.");
}
