using Grasshopper.Kernel;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class DuneTerrainGeneratorComponent : GH_Component
{
    public DuneTerrainGeneratorComponent()
        : base(
            "Generate Dune Terrain",
            "DuneTerrain",
            "Creates a preliminary terrain mesh with ridges beside the governed sikka and ventilation valleys, protected Baraha clearings, boundary fade, smoothing, and optional cut/fill balancing.",
            "Park Design",
            "Terrain")
    {
    }

    public override Guid ComponentGuid => new("B4047C15-54ED-4EC8-A85E-A9415FEFF6C5");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddMeshParameter("Existing Terrain", "M", "Authoritative existing terrain mesh in metre XY/Z coordinates.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Boundary", "B", "Connect ParkBubbles Resolved Boundary. Displacement fades to zero at this edge.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Dune Axes", "A", "Connect ParkBubbles Dune Morphology Axes. These remain low valley/ventilation guides.", GH_ParamAccess.list);
        parameters.AddTextParameter("Dune Axis Names", "AN", "Connect ParkBubbles Dune Axis Names so ventilation cuts can receive a reduced ridge response.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Selected Barahas", "C", "Connect SelectBaraha Selected Footprints. Their interiors remain near existing grade and receive a surrounding berm.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Protected Territories", "P", "Optional program or route footprints that must remain at existing grade.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Architectural Ridge Zones", "AZ", "Optional closed zones where the explicitly supplied architectural ridge height may be used.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Landscape Ridge Height", "LH", "Visible design height in metres. Default 1.2 m is the midpoint of the exported 0.6-1.8 m range.", GH_ParamAccess.item, 1.2);
        parameters.AddNumberParameter("Architectural Ridge Height", "AH", "Height used only inside Architectural Ridge Zones. Default 3.25 m is the midpoint of the exported 2.5-4.0 m range.", GH_ParamAccess.item, 3.25);
        parameters.AddNumberParameter("Ridge Offset", "O", "Distance from each valley axis to each parallel ridge crest in metres. Computational setting; verify with the designer.", GH_ParamAccess.item, 8);
        parameters.AddNumberParameter("Ridge Half Width", "W", "Half-width of each smooth ridge influence band in metres. Computational setting; verify with the designer.", GH_ParamAccess.item, 6);
        parameters.AddNumberParameter("Baraha Berm Width", "BW", "Outward width of the protective ridge around selected Barahas in metres.", GH_ParamAccess.item, 6);
        parameters.AddNumberParameter("Balance Strength", "BS", "0 leaves fill-only ridges; 1 removes the mean displacement within the active morphology field. Use CutFill to verify actual volume balance.", GH_ParamAccess.item, 1);
        parameters.AddIntegerParameter("Smoothing Passes", "S", "Laplacian smoothing passes applied to displacement only; protected vertices remain pinned.", GH_ParamAccess.item, 3);
        parameters.AddBooleanParameter("Run", "R", "Generate the preliminary dune terrain.", GH_ParamAccess.item, false);
        parameters[3].Optional = true;
        parameters[4].Optional = true;
        parameters[5].Optional = true;
        parameters[6].Optional = true;
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddMeshParameter("Proposed Terrain", "M", "Preliminary morphology mesh; connect with Existing Terrain to CutFill.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Ridge Crest Guides", "RC", "Planar parallel ridge-crest guides matching the generated displacement field.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Valley Guides", "V", "Input sikka and ventilation axes retained as low/open morphology guides.", GH_ParamAccess.list);
        parameters.AddCurveParameter("Baraha Clearings", "B", "Selected Baraha footprints held near existing grade.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Vertex Delta Z", "DZ", "Proposed minus existing Z for every mesh vertex.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Maximum Cut", "C", "Largest vertex lowering in metres. Use CutFill for sampled volume.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Maximum Fill", "F", "Largest vertex raising in metres. Use CutFill for sampled volume.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Mean Active Delta", "N", "Mean vertex displacement within the active morphology field after balancing.", GH_ParamAccess.item);
        parameters.AddTextParameter("Summary", "I", "Generation settings, counts, and limitations.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Mesh? existing = null;
        Curve? boundary = null;
        var axes = new List<Curve>();
        var axisNames = new List<string>();
        var barahas = new List<Curve>();
        var protectedTerritories = new List<Curve>();
        var architecturalZones = new List<Curve>();
        var landscapeHeight = 1.2;
        var architecturalHeight = 3.25;
        var ridgeOffset = 8d;
        var ridgeHalfWidth = 6d;
        var barahaBermWidth = 6d;
        var balanceStrength = 1d;
        var smoothingPasses = 3;
        var run = false;
        if (!data.GetData(0, ref existing) || existing is null) return;
        if (!data.GetData(1, ref boundary) || boundary is null) return;
        data.GetDataList(2, axes);
        data.GetDataList(3, axisNames);
        data.GetDataList(4, barahas);
        data.GetDataList(5, protectedTerritories);
        data.GetDataList(6, architecturalZones);
        data.GetData(7, ref landscapeHeight);
        data.GetData(8, ref architecturalHeight);
        data.GetData(9, ref ridgeOffset);
        data.GetData(10, ref ridgeHalfWidth);
        data.GetData(11, ref barahaBermWidth);
        data.GetData(12, ref balanceStrength);
        data.GetData(13, ref smoothingPasses);
        data.GetData(14, ref run);
        if (!run) return;

        if (existing.Vertices.Count == 0 || existing.Faces.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Existing Terrain must contain mesh vertices and faces.");
            return;
        }
        if (!boundary.IsClosed || !boundary.IsPlanar())
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be closed and planar.");
            return;
        }
        if (axes.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "At least one Dune Axis is required.");
            return;
        }
        if (landscapeHeight < 0 || architecturalHeight < 0 || ridgeOffset <= 0 || ridgeHalfWidth <= 0 || barahaBermWidth <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Heights cannot be negative; offset and widths must be greater than zero.");
            return;
        }
        balanceStrength = Math.Clamp(balanceStrength, 0, 1);
        smoothingPasses = Math.Clamp(smoothingPasses, 0, 25);

        var tolerance = RhinoDoc.ActiveDoc?.ModelAbsoluteTolerance ?? .01;
        var proposed = existing.DuplicateMesh();
        var vertexCount = proposed.Vertices.Count;
        var deltas = new double[vertexCount];
        var active = new bool[vertexCount];
        var pinned = new bool[vertexCount];
        var balanceWeights = new double[vertexCount];

        for (var index = 0; index < vertexCount; index++)
        {
            var vertex = proposed.Vertices.Point3dAt(index);
            var point = new Point3d(vertex.X, vertex.Y, 0);
            if (boundary.Contains(point, Plane.WorldXY, tolerance) == PointContainment.Outside)
            {
                pinned[index] = true;
                continue;
            }
            if (protectedTerritories.Any(curve => Contains(curve, point, tolerance))
                || barahas.Any(curve => Contains(curve, point, tolerance)))
            {
                pinned[index] = true;
                active[index] = true;
                continue;
            }

            var inArchitecturalZone = architecturalZones.Any(curve => Contains(curve, point, tolerance));
            var height = inArchitecturalZone ? architecturalHeight : landscapeHeight;
            var displacement = 0d;
            for (var axisIndex = 0; axisIndex < axes.Count; axisIndex++)
            {
                var distance = DistanceToCurveXY(axes[axisIndex], point);
                var response = SmoothBump(distance, ridgeOffset, ridgeHalfWidth);
                var name = axisIndex < axisNames.Count ? axisNames[axisIndex] : string.Empty;
                var roleFactor = name.Contains("wind_erosion", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("ventilation", StringComparison.OrdinalIgnoreCase) ? .75 : 1;
                displacement = Math.Max(displacement, height * roleFactor * response);
            }

            foreach (var baraha in barahas)
            {
                var distance = DistanceToCurveXY(baraha, point);
                displacement = Math.Max(displacement,
                    landscapeHeight * .75 * SmoothBump(distance, barahaBermWidth / 2, barahaBermWidth / 2));
            }

            var boundaryFade = Math.Clamp(DistanceToCurveXY(boundary, point) / ridgeHalfWidth, 0, 1);
            balanceWeights[index] = SmoothStep(boundaryFade);
            displacement *= balanceWeights[index];
            deltas[index] = displacement;
            active[index] = displacement > 1e-6;
        }

        var ridgeAffectedCount = active.Count(value => value);
        if (ridgeAffectedCount == 0)
        {
            AddRuntimeMessage(
                GH_RuntimeMessageLevel.Warning,
                "No terrain vertices intersect the dune ridge influence bands. Increase Ridge Half Width or subdivide/remesh the Existing Terrain so it has vertices between the boundary and dune axes.");
        }

        var neighbours = BuildVertexNeighbours(proposed);
        for (var pass = 0; pass < smoothingPasses; pass++)
        {
            var next = (double[])deltas.Clone();
            for (var index = 0; index < vertexCount; index++)
            {
                if (pinned[index] || !active[index] || neighbours[index].Count == 0) continue;
                next[index] = .5 * deltas[index] + .5 * neighbours[index].Average(neighbour => deltas[neighbour]);
            }
            deltas = next;
        }

        var activeIndexes = Enumerable.Range(0, vertexCount).Where(index => active[index] && !pinned[index]).ToList();
        var movableIndexes = Enumerable.Range(0, vertexCount)
            .Where(index => !pinned[index] && balanceWeights[index] > 1e-6)
            .ToList();
        if (activeIndexes.Count > 0 && movableIndexes.Count > 1 && balanceStrength > 0)
        {
            // Spread balancing cut over the whole unprotected interior instead of subtracting the
            // ridge mean from ridge vertices alone. The old approach could cancel the complete
            // deformation when a coarse mesh sampled similar values along every ridge band.
            var totalFill = movableIndexes.Sum(index => deltas[index]);
            var totalWeight = movableIndexes.Sum(index => balanceWeights[index]);
            var correction = totalWeight <= 1e-9 ? 0 : totalFill / totalWeight * balanceStrength;
            foreach (var index in movableIndexes)
                deltas[index] -= correction * balanceWeights[index];
        }

        for (var index = 0; index < vertexCount; index++)
        {
            var vertex = proposed.Vertices.Point3dAt(index);
            proposed.Vertices.SetVertex(index, new Point3f((float)vertex.X, (float)vertex.Y, (float)(vertex.Z + deltas[index])));
        }
        proposed.Normals.ComputeNormals();
        proposed.Compact();

        var ridgeGuides = new List<Curve>();
        foreach (var axis in axes)
        foreach (var distance in new[] { ridgeOffset, -ridgeOffset })
        {
            var offsets = axis.Offset(Plane.WorldXY, distance, tolerance, CurveOffsetCornerStyle.Smooth);
            if (offsets is not null) ridgeGuides.AddRange(offsets);
        }

        var maximumCut = deltas.Where(delta => delta < 0).Select(delta => -delta).DefaultIfEmpty(0).Max();
        var maximumFill = deltas.Where(delta => delta > 0).DefaultIfEmpty(0).Max();
        var meanActive = activeIndexes.Count == 0 ? 0 : activeIndexes.Average(index => deltas[index]);
        data.SetData(0, proposed);
        data.SetDataList(1, ridgeGuides);
        data.SetDataList(2, axes);
        data.SetDataList(3, barahas);
        data.SetDataList(4, deltas);
        data.SetData(5, maximumCut);
        data.SetData(6, maximumFill);
        data.SetData(7, meanActive);
        data.SetData(8,
            $"Generated preliminary morphology on {vertexCount} vertices ({ridgeAffectedCount} ridge-affected, {movableIndexes.Count} movable) from {axes.Count} valley axes and {barahas.Count} selected Barahas; landscape height {landscapeHeight:0.##} m, architectural height {architecturalHeight:0.##} m in {architecturalZones.Count} explicit zones, ridge offset {ridgeOffset:0.##} m, half-width {ridgeHalfWidth:0.##} m, balance strength {balanceStrength:0.##}, smoothing {smoothingPasses}. Maximum vertex cut/fill {maximumCut:0.##}/{maximumFill:0.##} m. Verify volumes with CutFill and route slopes with RouteTerrain.");
    }

    private static bool Contains(Curve curve, Point3d point, double tolerance) =>
        curve.IsClosed && curve.Contains(point, Plane.WorldXY, tolerance) != PointContainment.Outside;

    private static double DistanceToCurveXY(Curve curve, Point3d point)
    {
        if (!curve.ClosestPoint(point, out var parameter)) return double.MaxValue;
        var closest = curve.PointAt(parameter);
        var dx = point.X - closest.X;
        var dy = point.Y - closest.Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }

    private static double SmoothBump(double value, double center, double halfWidth)
    {
        var normalized = Math.Abs(value - center) / halfWidth;
        return normalized >= 1 ? 0 : .5 * (1 + Math.Cos(Math.PI * normalized));
    }

    private static double SmoothStep(double value) => value * value * (3 - 2 * value);

    private static List<HashSet<int>> BuildVertexNeighbours(Mesh mesh)
    {
        var neighbours = Enumerable.Range(0, mesh.Vertices.Count).Select(_ => new HashSet<int>()).ToList();
        foreach (var face in mesh.Faces)
        {
            var indices = face.IsTriangle ? new[] { face.A, face.B, face.C } : new[] { face.A, face.B, face.C, face.D };
            for (var index = 0; index < indices.Length; index++)
            {
                var a = indices[index];
                var b = indices[(index + 1) % indices.Length];
                neighbours[a].Add(b);
                neighbours[b].Add(a);
            }
        }
        return neighbours;
    }
}
