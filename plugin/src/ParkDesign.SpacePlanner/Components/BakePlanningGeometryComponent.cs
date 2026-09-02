using Grasshopper.Kernel;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class BakePlanningGeometryComponent : GH_Component
{
    private bool _lastBake;

    public BakePlanningGeometryComponent()
        : base(
            "Bake Park Planning Geometry",
            "BakePark",
            "Bakes the categorized ParkBubbles clean-geometry stream into a controlled Rhino layer hierarchy.",
            "Park Design",
            "GIS")
    {
    }

    public override Guid ComponentGuid => new("8F6D1E1B-238C-48B8-9FD0-5E050926721F");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Clean Geometry", "G", "Connect ParkBubbles Clean Geometry.", GH_ParamAccess.list);
        parameters.AddTextParameter("Geometry Names", "N", "Connect ParkBubbles Clean Geometry Names.", GH_ParamAccess.list);
        parameters.AddTextParameter("Layer Paths", "L", "Connect ParkBubbles Clean Geometry Layers.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Bake", "B", "Connect a Button. Geometry is baked only on the rising pulse.", GH_ParamAccess.item, false);
        parameters.AddBooleanParameter("Replace Previous", "RP", "Replace only objects previously baked by this component instance.", GH_ParamAccess.item, true);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddTextParameter("Object IDs", "ID", "Rhino object IDs created by the latest bake.", GH_ParamAccess.list);
        parameters.AddTextParameter("Layer Paths", "L", "Resolved Rhino layer paths matching the baked objects.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Bake result.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var geometry = new List<Curve>();
        var names = new List<string>();
        var layers = new List<string>();
        var bake = false;
        var replacePrevious = true;
        data.GetDataList(0, geometry);
        data.GetDataList(1, names);
        data.GetDataList(2, layers);
        data.GetData(3, ref bake);
        data.GetData(4, ref replacePrevious);

        var risingPulse = bake && !_lastBake;
        _lastBake = bake;
        if (!risingPulse) return;
        if (geometry.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "No clean planning geometry was supplied.");
            return;
        }
        if (names.Count != geometry.Count || layers.Count != geometry.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error,
                $"Clean Geometry ({geometry.Count}), Names ({names.Count}), and Layer Paths ({layers.Count}) must have matching list lengths.");
            return;
        }

        var document = RhinoDoc.ActiveDoc;
        if (document is null)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, "No active Rhino document is available.");
            return;
        }

        var componentKey = InstanceGuid.ToString("D");
        if (replacePrevious)
        {
            foreach (var obj in document.Objects.GetObjectList(ObjectType.Curve)
                         .Where(obj => obj.Attributes.GetUserString("ParkDesignBakeComponent") == componentKey)
                         .ToList())
                document.Objects.Delete(obj, quiet: true);
        }

        var objectIds = new List<Guid>();
        var resolvedLayers = new List<string>();
        for (var index = 0; index < geometry.Count; index++)
        {
            var layerPath = string.IsNullOrWhiteSpace(layers[index])
                ? "PARK_DESIGN::99_UNCLASSIFIED"
                : layers[index];
            var layerIndex = EnsureLayerPath(document, layerPath);
            if (layerIndex < 0)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"Could not create layer {layerPath}.");
                continue;
            }

            var attributes = new ObjectAttributes
            {
                LayerIndex = layerIndex,
                Name = string.IsNullOrWhiteSpace(names[index]) ? $"Park geometry {index + 1}" : names[index]
            };
            attributes.SetUserString("ParkDesignBakeComponent", componentKey);
            attributes.SetUserString("ParkDesignLayer", layerPath);
            attributes.SetUserString("ParkDesignGeometryStatus", GeometryStatus(layerPath));
            var id = document.Objects.AddCurve(geometry[index], attributes);
            if (id == Guid.Empty) continue;
            objectIds.Add(id);
            resolvedLayers.Add(layerPath);
        }

        document.Views.Redraw();
        data.SetDataList(0, objectIds.Select(id => id.ToString("D")));
        data.SetDataList(1, resolvedLayers);
        data.SetData(2,
            $"Baked {objectIds.Count}/{geometry.Count} clean planning curves into {resolvedLayers.Distinct(StringComparer.Ordinal).Count()} Rhino layers. Morphology remains guide/candidate geometry until terrain resolution.");
    }

    private static string GeometryStatus(string layerPath)
    {
        if (layerPath.Contains("Baraha Alternatives", StringComparison.OrdinalIgnoreCase)) return "alternative_candidate";
        if (layerPath.Contains("MORPHOLOGY", StringComparison.OrdinalIgnoreCase)) return "design_guide";
        if (layerPath.Contains("Coverage Overlays", StringComparison.OrdinalIgnoreCase)) return "non_additive_overlay_proxy";
        if (layerPath.Contains("Corridor Edges", StringComparison.OrdinalIgnoreCase)) return "width_aware_planning_proxy";
        return "planning_proxy";
    }

    private static int EnsureLayerPath(RhinoDoc document, string fullPath)
    {
        var parts = fullPath.Split(new[] { "::" }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return -1;
        Guid parentId = Guid.Empty;
        var currentIndex = -1;
        foreach (var part in parts)
        {
            var existing = document.Layers.FirstOrDefault(layer =>
                !layer.IsDeleted && layer.Name == part && layer.ParentLayerId == parentId);
            if (existing is not null)
            {
                currentIndex = existing.Index;
                parentId = existing.Id;
                continue;
            }

            var layer = new Layer
            {
                Name = part,
                ParentLayerId = parentId,
                Color = LayerColor(fullPath)
            };
            currentIndex = document.Layers.Add(layer);
            if (currentIndex < 0) return -1;
            parentId = document.Layers[currentIndex].Id;
        }
        return currentIndex;
    }

    private static System.Drawing.Color LayerColor(string path)
    {
        if (path.Contains("SITE", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(15, 23, 42);
        if (path.Contains("Exclusive", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(220, 38, 38);
        if (path.Contains("Shared", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(22, 163, 74);
        if (path.Contains("LANDSCAPE", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(101, 163, 13);
        if (path.Contains("Cycl", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(14, 165, 233);
        if (path.Contains("Jogg", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(244, 63, 94);
        if (path.Contains("Service", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(245, 158, 11);
        if (path.Contains("MOVEMENT", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(16, 185, 129);
        if (path.Contains("Baraha", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(168, 85, 247);
        if (path.Contains("MORPHOLOGY", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(180, 83, 9);
        return System.Drawing.Color.FromArgb(100, 116, 139);
    }
}
