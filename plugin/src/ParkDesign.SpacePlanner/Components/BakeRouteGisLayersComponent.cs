using Grasshopper.Kernel;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class BakeRouteGisLayersComponent : GH_Component
{
    private bool _lastBake;

    public BakeRouteGisLayersComponent()
        : base("Bake Route GIS Layers", "BakeRoutes", "Bakes route centerlines into named, color-coded Rhino GIS overlay layers on a button pulse.", "Park Design", "GIS") { }

    public override Guid ComponentGuid => new("EED12872-8C3B-424D-8B27-85CD6779E53D");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddCurveParameter("Routes", "R", "Connect ParkBubbles Routes.", GH_ParamAccess.list);
        parameters.AddTextParameter("Route Names", "N", "Connect ParkBubbles Route Names.", GH_ParamAccess.list);
        parameters.AddTextParameter("GIS Layers", "L", "Connect ParkBubbles Route GIS Layers.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Bake", "B", "Connect a Button. Geometry is baked only on the rising pulse.", GH_ParamAccess.item, false);
        parameters.AddBooleanParameter("Replace Previous", "RP", "Replace only objects previously baked by this component instance.", GH_ParamAccess.item, true);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddTextParameter("Object IDs", "ID", "Rhino object IDs created by the latest bake.", GH_ParamAccess.list);
        parameters.AddTextParameter("Layer Paths", "L", "Resolved Rhino layer paths.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Bake result.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var routes = new List<Curve>();
        var names = new List<string>();
        var layers = new List<string>();
        var bake = false;
        var replacePrevious = true;
        data.GetDataList(0, routes);
        data.GetDataList(1, names);
        data.GetDataList(2, layers);
        data.GetData(3, ref bake);
        data.GetData(4, ref replacePrevious);

        var risingPulse = bake && !_lastBake;
        _lastBake = bake;
        if (!risingPulse) return;
        if (routes.Count == 0)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "No route curves were supplied.");
            return;
        }
        if (layers.Count != routes.Count)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"Routes ({routes.Count}) and GIS Layers ({layers.Count}) must have matching list lengths.");
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
        for (var index = 0; index < routes.Count; index++)
        {
            var layerPath = string.IsNullOrWhiteSpace(layers[index])
                ? "PARK_DESIGN_GIS::Movement::Other Routes"
                : layers[index];
            var layerIndex = EnsureLayerPath(document, layerPath);
            if (layerIndex < 0)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"Could not create layer {layerPath}.");
                continue;
            }

            var attributes = new ObjectAttributes { LayerIndex = layerIndex, Name = index < names.Count ? names[index] : $"Route {index + 1}" };
            attributes.SetUserString("ParkDesignBakeComponent", componentKey);
            attributes.SetUserString("ParkDesignGisLayer", layerPath);
            var id = document.Objects.AddCurve(routes[index], attributes);
            if (id == Guid.Empty) continue;
            objectIds.Add(id);
            resolvedLayers.Add(layerPath);
        }

        document.Views.Redraw();
        data.SetDataList(0, objectIds.Select(id => id.ToString("D")));
        data.SetDataList(1, resolvedLayers);
        data.SetData(2, $"Baked {objectIds.Count}/{routes.Count} route curves into {resolvedLayers.Distinct(StringComparer.Ordinal).Count()} Rhino GIS overlay layers.");
    }

    private static int EnsureLayerPath(RhinoDoc document, string fullPath)
    {
        var parts = fullPath.Split(new[] { "::" }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return -1;
        Guid parentId = Guid.Empty;
        var currentIndex = -1;
        foreach (var part in parts)
        {
            var existing = document.Layers.FirstOrDefault(layer => !layer.IsDeleted && layer.Name == part && layer.ParentLayerId == parentId);
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
                Color = LayerColor(part)
            };
            currentIndex = document.Layers.Add(layer);
            if (currentIndex < 0) return -1;
            parentId = document.Layers[currentIndex].Id;
        }
        return currentIndex;
    }

    private static System.Drawing.Color LayerColor(string name)
    {
        if (name.Contains("Cycl", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(14, 165, 233);
        if (name.Contains("Jogg", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(244, 63, 94);
        if (name.Contains("Walk", StringComparison.OrdinalIgnoreCase) || name.Contains("Accessible", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(16, 185, 129);
        if (name.Contains("Service", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(245, 158, 11);
        if (name.Contains("Shade", StringComparison.OrdinalIgnoreCase)) return System.Drawing.Color.FromArgb(139, 92, 246);
        return System.Drawing.Color.FromArgb(100, 116, 139);
    }
}
