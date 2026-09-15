using System.Security.Cryptography;
using System.Text;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.RhinoBridge;

/// <summary>Bounded in-process RhinoCommon commands. A future local transport may call only these methods.</summary>
public sealed class RhinoDesignBridge
{
    private const string Root = "ParkDesign";
    private readonly Dictionary<uint, string> _registeredSites = new();

    public RhinoDocumentState GetDocumentState(RhinoDoc document) => new(document.RuntimeSerialNumber,
        document.ModelUnitSystem == UnitSystem.Meters, _registeredSites.ContainsKey(document.RuntimeSerialNumber));

    public void RegisterSite(RhinoDoc document, string crs, IReadOnlyList<Point2> boundary)
    {
        if (document.ModelUnitSystem != UnitSystem.Meters || crs != "EPSG:32640" || boundary.Count < 3
            || boundary.Any(p => !double.IsFinite(p.X) || !double.IsFinite(p.Y))
            || Math.Abs(PolygonMath.SignedArea(boundary)) <= 0)
            throw new InvalidOperationException("A metre Rhino document and explicit EPSG:32640 site boundary are required.");
        _registeredSites[document.RuntimeSerialNumber] = crs;
    }

    public IReadOnlyList<Guid> PreviewScenario(RhinoDoc document, string runId, string scenarioId,
        LayoutScenarioResult scenario)
    {
        EnsureReady(document);
        var ids = new List<Guid>();
        OnUiThread(() =>
        {
            var undo = document.BeginUndoRecord("ParkDesign preview scenario");
            try
            {
                ClearPreviewCore(document, runId, scenarioId);
                foreach (var space in scenario.Areas.Placements)
                {
                    var curve = new Circle(new Plane(new Point3d(space.Center.X, space.Center.Y, 0), Vector3d.ZAxis), space.Radius).ToNurbsCurve();
                    AddCurve(document, curve, runId, scenarioId, "Spaces", space.ProgramId, ids);
                }
                foreach (var route in scenario.Routes)
                    if (route.Points.Count >= 2)
                        AddCurve(document, new PolylineCurve(route.Points.Select(p => new Point3d(p.X, p.Y, 0))),
                            runId, scenarioId, "Paths", route.ProgramId, ids);
                document.Views.Redraw();
            }
            finally { document.EndUndoRecord(undo); }
        });
        return ids;
    }

    public void ClearPreview(RhinoDoc document, string runId, string scenarioId)
    {
        EnsureReady(document);
        OnUiThread(() =>
        {
            var undo = document.BeginUndoRecord("ParkDesign clear preview");
            try { ClearPreviewCore(document, runId, scenarioId); document.Views.Redraw(); }
            finally { document.EndUndoRecord(undo); }
        });
    }

    public IReadOnlyList<Guid> BakeApprovedScenario(RhinoDoc document, string runId, string scenarioId,
        LayoutScenarioResult scenario, DesignerApproval approval)
    {
        EnsureReady(document);
        if (approval.ScenarioId != scenarioId || !approval.Approved || string.IsNullOrWhiteSpace(approval.DesignerId)
            || scenario.SolverDiagnostics?.Valid != true)
            throw new InvalidOperationException("A matching explicit designer approval and solver-valid scenario are required to bake.");
        var ids = new List<Guid>();
        OnUiThread(() =>
        {
            var undo = document.BeginUndoRecord("ParkDesign bake approved scenario");
            try
            {
                foreach (var space in scenario.Areas.Placements)
                {
                    var curve = new Circle(new Plane(new Point3d(space.Center.X, space.Center.Y, 0), Vector3d.ZAxis), space.Radius).ToNurbsCurve();
                    AddCurve(document, curve, runId, scenarioId, "Approved::Spaces", space.ProgramId, ids);
                }
                foreach (var route in scenario.Routes)
                    if (route.Points.Count >= 2)
                        AddCurve(document, new PolylineCurve(route.Points.Select(p => new Point3d(p.X, p.Y, 0))),
                            runId, scenarioId, "Approved::Paths", route.ProgramId, ids);
                document.Views.Redraw();
            }
            finally { document.EndUndoRecord(undo); }
        });
        return ids;
    }

    private void EnsureReady(RhinoDoc document)
    {
        if (document.ModelUnitSystem != UnitSystem.Meters || !_registeredSites.TryGetValue(document.RuntimeSerialNumber, out var crs)
            || crs != "EPSG:32640")
            throw new InvalidOperationException("Rhino document must use metres and have a registered EPSG:32640 site.");
    }

    private static void ClearPreviewCore(RhinoDoc document, string runId, string scenarioId)
    {
        foreach (var obj in document.Objects.GetObjectList(ObjectType.Curve)
            .Where(obj => obj.Attributes.GetUserString("ParkDesignStatus") == "preview"
                && obj.Attributes.GetUserString("ParkDesignRunId") == runId
                && obj.Attributes.GetUserString("ParkDesignScenarioId") == scenarioId).ToList())
            document.Objects.Delete(obj, quiet: true);
    }

    private static void AddCurve(RhinoDoc document, Curve curve, string runId, string scenarioId,
        string category, string elementId, List<Guid> ids)
    {
        var preview = !category.StartsWith("Approved", StringComparison.Ordinal);
        var layer = preview ? $"{Root}::AgentRuns::{Safe(runId)}::{Safe(scenarioId)}::{category}"
            : $"{Root}::{category}";
        var objectId = StableId(runId, scenarioId, category, elementId, ids.Count);
        if (document.Objects.FindId(objectId) is not null)
            throw new InvalidOperationException($"Rhino already contains the stable object ID for {elementId}.");
        var attributes = new ObjectAttributes { LayerIndex = EnsureLayer(document, layer), Name = elementId,
            ObjectId = objectId };
        attributes.SetUserString("ParkDesignRunId", runId);
        attributes.SetUserString("ParkDesignScenarioId", scenarioId);
        attributes.SetUserString("ParkDesignElementId", elementId);
        attributes.SetUserString("ParkDesignStatus", preview ? "preview" : "approved");
        var id = document.Objects.AddCurve(curve, attributes);
        if (id == Guid.Empty) throw new InvalidOperationException($"Rhino rejected {elementId}.");
        if (id != objectId) throw new InvalidOperationException("Rhino did not preserve the requested stable object ID.");
        ids.Add(id);
    }

    private static int EnsureLayer(RhinoDoc document, string path)
    {
        var parent = Guid.Empty;
        var index = -1;
        foreach (var name in path.Split("::", StringSplitOptions.RemoveEmptyEntries))
        {
            var existing = document.Layers.FirstOrDefault(l => l.Name == name && l.ParentLayerId == parent);
            if (existing is null)
            {
                var layer = new Layer { Name = name, ParentLayerId = parent };
                index = document.Layers.Add(layer);
                if (index < 0) throw new InvalidOperationException($"Could not create Rhino layer {path}.");
                parent = document.Layers[index].Id;
            }
            else { index = existing.Index; parent = existing.Id; }
        }
        return index;
    }

    private static string Safe(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Any(c => !(char.IsLetterOrDigit(c) || c is '-' or '_')))
            throw new ArgumentException("Run and scenario IDs must be non-empty alphanumeric identifiers.");
        return value;
    }

    private static Guid StableId(string runId, string scenarioId, string category,
        string elementId, int ordinal)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"ParkDesign|{runId}|{scenarioId}|{category}|{elementId}|{ordinal}"));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private static void OnUiThread(Action action) => RhinoApp.InvokeOnUiThread(action);
}

public sealed record RhinoDocumentState(uint DocumentSerialNumber, bool UnitsAreMetres, bool SiteRegistered);
public sealed record DesignerApproval(string ScenarioId, string DesignerId, bool Approved);
