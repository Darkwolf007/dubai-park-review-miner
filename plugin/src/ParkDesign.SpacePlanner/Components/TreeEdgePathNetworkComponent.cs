using System.Text.Json;
using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Models;
using Rhino;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace ParkDesign.SpacePlanner.Components;

/// <summary>A separate Voronoi-cell-edge alternative to centroid-based TreemapPaths.</summary>
public sealed class TreeEdgePathNetworkComponent : GH_Component
{
    public TreeEdgePathNetworkComponent()
        : base("Tree Edge Path Network", "TreeEdgePaths",
            "Builds one rooted park-path tree along shared Voronoi/treemap cell boundaries, without centroid-to-centroid chords.",
            "Park Design", "Planning")
    {
    }

    public override Guid ComponentGuid => new("E3117C70-F354-4F4C-8807-E6B188821152");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Boundary", "B", "Closed site boundary in metres.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Cells", "C", "Closed Voronoi or treemap cells. Feed the original cells, not inset program footprints.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program IDs", "ID", "Optional stable IDs matching Cells, used for portal metadata and warnings.", GH_ParamAccess.list);
        parameters.AddTextParameter("Program Names", "N", "Optional names matching Cells.", GH_ParamAccess.list);
        parameters.AddPointParameter("Main Entrance", "ME", "Public root; projected to the nearest cell edge if it is not already on one.", GH_ParamAccess.item);
        parameters.AddPointParameter("Secondary Entrances", "SE", "Optional additional public terminals projected to cell edges.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Run", "R", "Build the cell-edge tree.", GH_ParamAccess.item, false);
        parameters[2].Optional = true;
        parameters[3].Optional = true;
        parameters[4].Optional = true;
        parameters[5].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Tree Edge Paths", "TE", "Connected, loop-free path chains that lie on cell boundaries. No centroid connectors.", GH_ParamAccess.list);
        parameters.AddPointParameter("Shared Edge Portals", "PT", "Midpoints of shared cell-boundary overlaps used as tree terminals.", GH_ParamAccess.list);
        parameters.AddPointParameter("Snapped Main Entrance", "SME", "Actual root on the cell-edge graph.", GH_ParamAccess.item);
        parameters.AddTextParameter("Portal Data", "PD", "Program pair metadata for each Shared Edge Portal.", GH_ParamAccess.list);
        parameters.AddTextParameter("Path Data", "D", "Lands Design handoff metadata matching Tree Edge Paths.", GH_ParamAccess.list);
        parameters.AddTextParameter("Warnings", "W", "Clipping, snapping, and connectivity warnings.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Cell-edge network summary.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Clipped Cells", "CC", "Cell boundaries actually used to build the tree.", GH_ParamAccess.list);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null;
        var inputCells = new List<Curve>();
        var ids = new List<string>();
        var names = new List<string>();
        var mainEntrance = Point3d.Unset;
        var secondaryEntrances = new List<Point3d>();
        var run = false;
        if (!data.GetData(0, ref boundary)) return;
        data.GetDataList(1, inputCells);
        data.GetDataList(2, ids);
        data.GetDataList(3, names);
        data.GetData(4, ref mainEntrance);
        data.GetDataList(5, secondaryEntrances);
        data.GetData(6, ref run);
        if (!run) return;

        if (boundary is null || !boundary.IsClosed || inputCells.Count < 2
            || inputCells.Any(cell => cell is null || !cell.IsClosed))
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Provide a closed site boundary and at least two closed Voronoi/treemap cells.");
            return;
        }
        if (ids.Count != 0 && ids.Count != inputCells.Count || names.Count != 0 && names.Count != inputCells.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Program IDs and Program Names must be empty or match the Cells list length.");
            return;
        }
        if (ids.Count == 0) ids.AddRange(Enumerable.Range(1, inputCells.Count).Select(index => $"cell-{index}"));
        if (names.Count == 0) names.AddRange(ids);
        if (ids.Any(string.IsNullOrWhiteSpace) || ids.Distinct(StringComparer.Ordinal).Count() != ids.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Program IDs must be non-empty and unique.");
            return;
        }

        try
        {
            var tolerance = Math.Max(0.001, RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? 0.01);
            var warnings = new List<string>();
            var cells = inputCells.Select((cell, index) => ClipCell(cell, boundary, ids[index], tolerance, warnings)).ToList();
            var rings = cells.Select(cell => (IReadOnlyList<Point2>)CellRing(cell)).ToList();
            var portals = new List<(int A, int B, Point3d Point)>();
            for (var a = 0; a < cells.Count; a++)
            for (var b = a + 1; b < cells.Count; b++)
            {
                var intersections = Intersection.CurveCurve(cells[a], cells[b], tolerance, tolerance);
                if (intersections is null) continue;
                foreach (var overlap in intersections.Where(item => item.IsOverlap))
                {
                    var point = cells[a].PointAt(overlap.OverlapA.Mid);
                    if (portals.Any(portal => portal.A == a && portal.B == b && portal.Point.DistanceTo(point) <= tolerance))
                        continue;
                    portals.Add((a, b, point));
                }
            }

            var root = mainEntrance.IsValid ? mainEntrance : boundary.PointAtStart;
            if (!mainEntrance.IsValid)
                warnings.Add("MAIN_ENTRANCE_DEFAULTED: No main entrance was supplied; the site-boundary start point was used as the tree root.");
            var terminals = portals.Select(portal => new Point2(portal.Point.X, portal.Point.Y))
                .Concat(secondaryEntrances.Where(point => point.IsValid).Select(point => new Point2(point.X, point.Y)))
                .ToList();
            var tree = CellEdgeTreeBuilder.Build(rings, new Point2(root.X, root.Y), terminals, tolerance);
            if (tree.EntranceConnectorLengthM > tolerance)
                warnings.Add($"ENTRANCE_SNAPPED: The main entrance is {tree.EntranceConnectorLengthM:0.##} m from its cell-edge root; the off-edge approach is not included.");
            if (tree.UnreachableTerminals.Count > 0)
                warnings.Add($"EDGE_GRAPH_DISCONNECTED: {tree.UnreachableTerminals.Count} portals or secondary entrances cannot be reached on cell edges.");
            for (var index = 0; index < cells.Count; index++)
                if (!portals.Any(portal => portal.A == index || portal.B == index))
                    warnings.Add($"CELL_WITHOUT_PORTAL: '{ids[index]}' does not share a detected boundary with another cell.");

            var curves = tree.Chains.Select(chain => (Curve)new PolylineCurve(
                chain.Select(point => new Point3d(point.X, point.Y, 0)))).ToList();
            var portalData = portals.Select((portal, index) => JsonSerializer.Serialize(new
            {
                portal_id = $"tree-edge-portal-{index + 1}",
                program_a = ids[portal.A],
                program_b = ids[portal.B],
                x = Math.Round(portal.Point.X, 3),
                y = Math.Round(portal.Point.Y, 3),
                authority = "shared_cell_edge"
            }));
            var pathData = curves.Select((_, index) => JsonSerializer.Serialize(new
            {
                path_id = $"tree-edge-path-{index + 1}",
                hierarchy = "tree_edge",
                lands_design_target_type = "path",
                surface_code = (string?)null,
                edge_detail_code = (string?)null,
                status = "designer_review_required"
            }));
            data.SetDataList(0, curves);
            data.SetDataList(1, portals.Select(portal => portal.Point));
            data.SetData(2, new Point3d(tree.RootOnEdge.X, tree.RootOnEdge.Y, 0));
            data.SetDataList(3, portalData);
            data.SetDataList(4, pathData);
            data.SetDataList(5, warnings);
            data.SetData(6, $"{cells.Count} cells | {portals.Count} shared-edge portals | {curves.Count} tree chains | {tree.UnreachableTerminals.Count} unreachable terminals. Paths stay on cell edges; no centroid chords.");
            data.SetDataList(7, cells);
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message);
        }
    }

    private static Curve ClipCell(Curve cell, Curve boundary, string id, double tolerance, ICollection<string> warnings)
    {
        var outside = CellRing(cell).Any(point => boundary.Contains(new Point3d(point.X, point.Y, 0), Plane.WorldXY, tolerance)
            == PointContainment.Outside);
        if (!outside) return cell.DuplicateCurve();
        var intersections = Curve.CreateBooleanIntersection(cell, boundary, tolerance);
        var selected = intersections?.Select(curve => (Curve: curve, Area: Math.Abs(AreaMassProperties.Compute(curve)?.Area ?? 0)))
            .OrderByDescending(item => item.Area).FirstOrDefault();
        if (selected is null || selected.Value.Area <= tolerance * tolerance)
            throw new ArgumentException($"Cell '{id}' lies outside the site and cannot be used for edge routing.");
        warnings.Add($"CELL_CLIPPED_TO_SITE: '{id}' was clipped to the site boundary.");
        return selected.Value.Curve.DuplicateCurve();
    }

    private static List<Point2> CellRing(Curve curve)
    {
        if (curve.TryGetPolyline(out var polyline))
            return polyline.Select(point => new Point2(point.X, point.Y)).ToList();
        var count = Math.Clamp((int)Math.Ceiling(curve.GetLength()), 32, 128);
        var parameters = curve.DivideByCount(count, true);
        if (parameters is null || parameters.Length < 3)
            throw new ArgumentException("A cell boundary could not be sampled for edge-tree routing.");
        return parameters.Select(parameter => curve.PointAt(parameter))
            .Select(point => new Point2(point.X, point.Y)).ToList();
    }
}
