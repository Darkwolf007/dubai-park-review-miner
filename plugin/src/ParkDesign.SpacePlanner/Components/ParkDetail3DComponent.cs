using Grasshopper.Kernel;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class ParkDetail3DComponent : GH_Component
{
    public ParkDetail3DComponent() : base("Generate Park Detail 3D", "ParkDetail3D",
        "Generates simple, non-construction program massing from validated space footprints.",
        "Park Design", "Detail") { }
    public override Guid ComponentGuid => new("BD031DCF-6668-4F15-A77C-E8BB59E7C67E");
    protected override System.Drawing.Bitmap? Icon => null;
    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddCurveParameter("Spaces", "S", "Validated closed program footprints.", GH_ParamAccess.list);
        p.AddTextParameter("Program IDs", "ID", "IDs matching footprints.", GH_ParamAccess.list);
        p.AddTextParameter("Program Names", "N", "Names matching footprints.", GH_ParamAccess.list);
        p.AddBooleanParameter("Run", "R", "Generate massing.", GH_ParamAccess.item, false);
    }
    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddBrepParameter("Massing", "M", "Simple category-based massing Breps.", GH_ParamAccess.list);
        p.AddTextParameter("Layers", "L", "Suggested Rhino layers matching massing.", GH_ParamAccess.list);
        p.AddTextParameter("Detail Data", "D", "Program, height and representation status.", GH_ParamAccess.list);
    }
    protected override void SolveInstance(IGH_DataAccess data)
    {
        var spaces = new List<Curve>(); var ids = new List<string>(); var names = new List<string>(); var run = false;
        data.GetDataList(0, spaces); data.GetDataList(1, ids); data.GetDataList(2, names); data.GetData(3, ref run);
        if (!run) return;
        if (spaces.Count != ids.Count || spaces.Count != names.Count)
        { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "Spaces, IDs and Names must match."); return; }
        var breps = new List<Brep>(); var layers = new List<string>(); var records = new List<string>();
        for (var index = 0; index < spaces.Count; index++)
        {
            if (!spaces[index].IsClosed) { AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"'{ids[index]}' is open and was skipped."); continue; }
            var height = Height(ids[index], names[index]);
            var extrusion = Extrusion.Create(spaces[index], height, true);
            if (extrusion is null) continue;
            breps.Add(extrusion.ToBrep());
            var category = DetailCategory(ids[index], names[index]);
            layers.Add($"Park Design::Detail 3D::{category}");
            records.Add(System.Text.Json.JsonSerializer.Serialize(new { program_id = ids[index], name = names[index],
                height_m = height, representation = "simple_high_level_massing", construction_status = "not_detailed" }));
        }
        data.SetDataList(0, breps); data.SetDataList(1, layers); data.SetDataList(2, records);
    }
    private static double Height(string id, string name)
    {
        var value = $"{id} {name}";
        if (Contains(value, "operation", "maintenance")) return 3.5;
        if (Contains(value, "play", "fitness")) return 1.2;
        if (Contains(value, "plaza", "court", "drop", "lawn")) return .15;
        if (Contains(value, "garden", "nature")) return .6;
        return .3;
    }
    private static string DetailCategory(string id, string name)
    {
        var value = $"{id} {name}";
        if (Contains(value, "operation", "maintenance")) return "Operations";
        if (Contains(value, "play")) return "Play";
        if (Contains(value, "court", "fitness")) return "Active";
        if (Contains(value, "plaza", "drop", "entrance")) return "Arrival";
        if (Contains(value, "garden", "nature")) return "Landscape";
        return "Programs";
    }
    private static bool Contains(string value, params string[] terms) => terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
}
