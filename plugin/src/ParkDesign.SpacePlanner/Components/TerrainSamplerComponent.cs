using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Terrain;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class TerrainSamplerComponent : GH_Component
{
    public TerrainSamplerComponent()
        : base("Sample Park Terrain", "TerrainGrid", "Samples an authoritative terrain mesh into elevation, slope, and aspect metrics for optimization.", "Park Design", "Terrain") { }

    public override Guid ComponentGuid => new("31E7FA70-8331-48DF-A83E-BD32DE99681E");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddMeshParameter("Terrain Mesh", "M", "Terrain mesh in metre XY/Z units.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Grid Spacing", "G", "Horizontal sampling spacing in metres.", GH_ParamAccess.item, 5);
        parameters.AddBooleanParameter("Run", "R", "Sample the terrain mesh.", GH_ParamAccess.item, false);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddPointParameter("Sample Points", "P", "Terrain sample points.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Elevation", "Z", "Elevation matching Sample Points.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Slope Percent", "S", "Local mesh slope percentage.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Aspect Degrees", "A", "Downslope aspect clockwise from north.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Terrain sampling summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        Mesh? mesh = null;
        var spacing = 5d;
        var run = false;
        if (!data.GetData(0, ref mesh) || mesh is null) return;
        data.GetData(1, ref spacing);
        data.GetData(2, ref run);
        if (!run) return;
        if (spacing <= 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Grid Spacing must be greater than zero metres.");
            return;
        }
        try
        {
            var samples = TerrainMeshSampler.SampleGrid(mesh, spacing);
            if (samples.Count == 0)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "No vertical terrain samples were found on the mesh.");
                return;
            }
            data.SetDataList(0, samples.Select(sample => sample.Point));
            data.SetDataList(1, samples.Select(sample => sample.Point.Z));
            data.SetDataList(2, samples.Select(sample => sample.SlopePercent));
            data.SetDataList(3, samples.Select(sample => sample.AspectDegrees));
            data.SetData(4, $"{samples.Count} terrain samples at {spacing:0.##} m | elevation {samples.Min(sample => sample.Point.Z):0.##}..{samples.Max(sample => sample.Point.Z):0.##} m | slope avg {samples.Average(sample => sample.SlopePercent):0.##}% max {samples.Max(sample => sample.SlopePercent):0.##}%");
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, exception.Message);
        }
    }
}
