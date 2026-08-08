using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Terrain;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class RouteTerrainMetricsComponent : GH_Component
{
    public RouteTerrainMetricsComponent()
        : base("Evaluate Terrain Routes", "RouteTerrain", "Projects walking, jogging, or exercise-cycling routes onto a terrain mesh and reports raw Wallacei-ready metrics.", "Park Design", "Terrain") { }

    public override Guid ComponentGuid => new("1E728D90-1F36-4B99-9D64-B06403ADB38A");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddMeshParameter("Terrain Mesh", "M", "Authoritative terrain mesh.", GH_ParamAccess.item);
        parameters.AddCurveParameter("Routes", "C", "Walking, jogging, cycling, or service route centerlines.", GH_ParamAccess.list);
        parameters.AddTextParameter("Mode", "T", "Metric label such as Walking, Jogging, or Exercise Cycling.", GH_ParamAccess.item, "Walking");
        parameters.AddNumberParameter("Sample Spacing", "G", "Distance between route terrain samples in metres.", GH_ParamAccess.item, 2);
        parameters.AddBooleanParameter("Enforce Max Slope", "E", "When True, report route length exceeding the supplied approved maximum slope.", GH_ParamAccess.item, false);
        parameters.AddNumberParameter("Max Slope Percent", "MS", "Designer-approved or cited maximum slope percentage. No hidden default is applied.", GH_ParamAccess.item, 0);
        parameters.AddBooleanParameter("Run", "R", "Evaluate the routes.", GH_ParamAccess.item, false);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddCurveParameter("Terrain Routes", "TC", "Routes projected vertically onto the terrain mesh.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Horizontal Length", "L2", "Plan length in metres.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Terrain Length", "L3", "Three-dimensional terrain length in metres.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Elevation Gain", "EG", "Accumulated elevation gain in metres.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Elevation Loss", "EL", "Accumulated elevation loss in metres.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Maximum Slope", "MX", "Maximum sampled segment slope percentage.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Average Slope", "AV", "Horizontal-length-weighted average absolute slope percentage.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Slope Violation Length", "VL", "Plan length exceeding Max Slope Percent; zero when disabled.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Total Length", "TL", "Total terrain length across all evaluated routes.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Total Gain", "TG", "Total elevation gain across all evaluated routes.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Worst Slope", "WS", "Worst sampled slope across all evaluated routes.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Total Violation", "TV", "Total slope-violation length across all evaluated routes.", GH_ParamAccess.item);
        parameters.AddTextParameter("Summary", "I", "Mode and route metric summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Mesh? mesh = null;
        var curves = new List<Curve>();
        var mode = "Walking";
        var spacing = 2d;
        var enforceSlope = false;
        var maximumSlope = 0d;
        var run = false;
        if (!data.GetData(0, ref mesh) || mesh is null) return;
        if (!data.GetDataList(1, curves) || curves.Count == 0) return;
        data.GetData(2, ref mode);
        data.GetData(3, ref spacing);
        data.GetData(4, ref enforceSlope);
        data.GetData(5, ref maximumSlope);
        data.GetData(6, ref run);
        if (!run) return;
        if (spacing <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Sample Spacing must be greater than zero metres.");
            return;
        }
        if (enforceSlope && maximumSlope <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Enforce Max Slope requires a positive, approved Max Slope Percent.");
            return;
        }

        var results = new List<RouteTerrainResult>();
        for (var index = 0; index < curves.Count; index++)
        {
            try
            {
                results.Add(TerrainMeshSampler.SampleRoute(mesh, curves[index], spacing, enforceSlope ? maximumSlope : null));
            }
            catch (Exception exception)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"Route {index}: {exception.Message}");
            }
        }
        if (results.Count == 0) return;

        data.SetDataList(0, results.Select(result => result.Curve));
        data.SetDataList(1, results.Select(result => result.HorizontalLength));
        data.SetDataList(2, results.Select(result => result.TerrainLength));
        data.SetDataList(3, results.Select(result => result.ElevationGain));
        data.SetDataList(4, results.Select(result => result.ElevationLoss));
        data.SetDataList(5, results.Select(result => result.MaximumSlopePercent));
        data.SetDataList(6, results.Select(result => result.AverageSlopePercent));
        data.SetDataList(7, results.Select(result => result.SlopeViolationLength));
        data.SetData(8, results.Sum(result => result.TerrainLength));
        data.SetData(9, results.Sum(result => result.ElevationGain));
        data.SetData(10, results.Max(result => result.MaximumSlopePercent));
        data.SetData(11, results.Sum(result => result.SlopeViolationLength));
        data.SetData(12, $"{mode}: {results.Count}/{curves.Count} routes | terrain length {results.Sum(result => result.TerrainLength):0.##} m | gain {results.Sum(result => result.ElevationGain):0.##} m | worst slope {results.Max(result => result.MaximumSlopePercent):0.##}% | violation {results.Sum(result => result.SlopeViolationLength):0.##} m");
    }
}
