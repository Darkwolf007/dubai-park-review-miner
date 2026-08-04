using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using ParkDesign.SpacePlanner.Core.Validation;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class DistributeSpacesComponent : GH_Component
{
    public DistributeSpacesComponent()
        : base(
            "Distribute Park Spaces",
            "ParkBubbles",
            "Loads a Park Design Package and places area-correct program bubbles inside a georeferenced EPSG:32640 boundary.",
            "Park Design",
            "Planning")
    {
    }

    public override Guid ComponentGuid => new("3A69D610-1AF8-45E0-AB27-719BA81BFE05");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Boundary", "B", "Closed planar site boundary in EPSG:32640 metre coordinates.", GH_ParamAccess.item);
        parameters.AddTextParameter("Design Package", "J", "Path to ParkDesignPackage JSON or the current Results Grasshopper JSON.", GH_ParamAccess.item);
        parameters.AddIntegerParameter("Seed", "S", "Deterministic placement seed.", GH_ParamAccess.item, 1);
        parameters.AddBooleanParameter("Run", "R", "Run deterministic bubble distribution.", GH_ParamAccess.item, false);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Bubbles", "B", "Area-correct program bubble curves.", GH_ParamAccess.list);
        parameters.AddPointParameter("Centers", "C", "Program bubble centers.", GH_ParamAccess.list);
        parameters.AddTextParameter("Names", "N", "Program names matching the bubble order.", GH_ParamAccess.list);
        parameters.AddTextParameter("Warnings", "W", "Validation and unresolved-placement messages.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Package and placement summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Curve? boundary = null;
        var jsonPath = string.Empty;
        var seed = 1;
        var run = false;
        if (!data.GetData(0, ref boundary) || boundary is null) return;
        if (!data.GetData(1, ref jsonPath)) return;
        data.GetData(2, ref seed);
        data.GetData(3, ref run);
        if (!run) return;

        var warnings = new List<string>();
        if (!boundary.IsClosed)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be closed.");
            return;
        }
        if (!boundary.IsPlanar())
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary must be planar.");
            return;
        }
        if (RhinoDoc.ActiveDoc is { ModelUnitSystem: not UnitSystem.Meters })
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Rhino document units must be metres for EPSG:32640 input.");
            return;
        }

        DesignPackage package;
        try
        {
            package = DesignPackageLoader.LoadFile(jsonPath);
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"Could not load design package: {exception.Message}");
            return;
        }

        var validation = DesignPackageValidator.Validate(package);
        foreach (var message in validation)
        {
            AddRuntimeMessage(message.IsError ? GH_RuntimeMessageLevel.Error : GH_RuntimeMessageLevel.Warning, message.Message);
            warnings.Add($"{message.Code}: {message.Message}");
        }
        if (validation.Any(message => message.IsError))
        {
            data.SetDataList(3, warnings);
            return;
        }

        var parameters = boundary.DivideByCount(256, true);
        if (parameters is null || parameters.Length < 3)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Boundary could not be sampled into a valid polygon.");
            return;
        }
        var polygon = parameters.Select(parameter => boundary.PointAt(parameter)).Select(point => new Point2(point.X, point.Y)).ToList();
        if (polygon.Count > 1 && polygon[0] == polygon[^1]) polygon.RemoveAt(polygon.Count - 1);

        var result = BubbleDistributor.Distribute(polygon, package.Programs, seed);
        warnings.AddRange(result.Warnings);
        foreach (var warning in result.Warnings)
            AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, warning);

        var bubbles = result.Placements
            .Select(placement => new Circle(new Point3d(placement.Center.X, placement.Center.Y, 0), placement.Radius).ToNurbsCurve())
            .ToList();
        var centers = result.Placements.Select(placement => new Point3d(placement.Center.X, placement.Center.Y, 0)).ToList();
        var names = result.Placements.Select(placement => placement.ProgramName).ToList();
        var summary = $"{package.Project.SiteName} | {package.CoordinateSystem.Crs} | placed {result.Placements.Count}/{package.Programs.Count(program => program.Selected)} programs | program area {result.RequestedProgramAreaM2:0} m2 / boundary area {result.BoundaryAreaM2:0} m2";

        data.SetDataList(0, bubbles);
        data.SetDataList(1, centers);
        data.SetDataList(2, names);
        data.SetDataList(3, warnings);
        data.SetData(4, summary);
    }
}
