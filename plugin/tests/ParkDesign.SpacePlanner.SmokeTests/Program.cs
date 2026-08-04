using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using ParkDesign.SpacePlanner.Core.Validation;

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

Console.WriteLine("All ParkDesign.SpacePlanner core smoke tests passed.");

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
