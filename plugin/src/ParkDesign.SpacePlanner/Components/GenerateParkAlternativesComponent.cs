using System.Text.Json;
using System.Security.Cryptography;
using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Models;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class GenerateParkAlternativesComponent : GH_Component
{
    private string? _generationKey;
    private PlanningResult? _generationResult;
    private Task<(DesignPackage Package, PlanningResult Result)>? _pending;
    private string? _pendingKey;
    private DesignPackage? _resultPackage;
    public GenerateParkAlternativesComponent() : base("Generate Park Alternatives", "ParkOptions",
        "Generates distinct deterministic planning proxies from the registered package boundary. Select an option to preview; no document baking occurs.",
        "Park Design", "Planning") { }

    public override Guid ComponentGuid => new("2CB2B234-00F8-454D-9249-9B4979A73A6D");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager p)
    {
        p.AddTextParameter("Design Package", "J", "ZIP, extracted package folder or canonical JSON path. Must contain a georeferenced site boundary.", GH_ParamAccess.item);
        p.AddIntegerParameter("Seed", "S", "Reproducible seed.", GH_ParamAccess.item, 1);
        p.AddIntegerParameter("Alternatives", "A", "Requested alternatives, 1–20. Constraints and duplicate rejection may yield fewer.", GH_ParamAccess.item, 5);
        p.AddNumberParameter("Diversity", "D", "Minimum mean program-centre displacement divided by site scale, 0–1.", GH_ParamAccess.item, .08);
        p.AddIntegerParameter("Selected Option", "O", "Zero-based index in the ranked result list.", GH_ParamAccess.item, 0);
        p.AddBooleanParameter("Run", "R", "Enable deterministic generation. Start with two alternatives on large packages.", GH_ParamAccess.item, false);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager p)
    {
        p.AddCurveParameter("Spaces", "SP", "Selected option's per-program area proxies; shared and overlay circles are not additive physical footprints.", GH_ParamAccess.list);
        p.AddPointParameter("Centres", "C", "Selected program centres in EPSG:32640 metres.", GH_ParamAccess.list);
        p.AddTextParameter("Program IDs", "ID", "Stable IDs matching Spaces and Centres.", GH_ParamAccess.list);
        p.AddCurveParameter("Routes", "P", "Selected conceptual route centre lines. Widths and terrain accessibility are unresolved.", GH_ParamAccess.list);
        p.AddPointParameter("Nodes", "N", "Selected point programs and unresolved area-intent anchors.", GH_ParamAccess.list);
        p.AddCurveParameter("Relationships", "L", "Selected relationship diagnostic lines.", GH_ParamAccess.list);
        p.AddTextParameter("Scenario Records", "SC", "JSON metrics, genome, seed, diagnostics and evidence per ranked option. Solver validity is not regulatory compliance.", GH_ParamAccess.list);
        p.AddTextParameter("Selected Scenario", "SS", "Full selected planning result JSON for inspection; geometry is deterministic planning proxy data.", GH_ParamAccess.item);
        p.AddTextParameter("Warnings", "W", "Selected unresolved inputs and warnings.", GH_ParamAccess.list);
        p.AddCurveParameter("Site", "B", "Exact package boundary; no translation or scaling.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var path = ""; var seed = 1; var count = 5; var diversity = .08; var selected = 0; var run = false;
        if (!data.GetData(0, ref path)) return;
        data.GetData(1, ref seed); data.GetData(2, ref count); data.GetData(3, ref diversity);
        data.GetData(4, ref selected); data.GetData(5, ref run);
        if (!run) return;
        try
        {
            if (RhinoDoc.ActiveDoc is not { ModelUnitSystem: UnitSystem.Meters })
                throw new InvalidOperationException("An active Rhino document using metres is required.");
            if (count is < 1 or > 20) throw new ArgumentException("Alternatives must be between 1 and 20.");
            var key = $"{PackageFingerprint(path)}|{seed}|{count}|{diversity:R}";
            if (_pending is not null)
            {
                if (!_pending.IsCompleted)
                {
                    Message = "Generating…";
                    data.SetDataList(8, new[] { "Deterministic generation is running in the background. Rhino remains available." });
                    return;
                }
                var finished = _pending;
                _pending = null;
                var completed = finished.GetAwaiter().GetResult();
                _generationResult = completed.Result;
                _resultPackage = completed.Package;
                _generationKey = _pendingKey;
            }
            if (_generationKey != key || _generationResult is null)
            {
                var document = OnPingDocument();
                _pendingKey = key;
                _pending = Task.Run(() =>
                {
                    var loaded = DesignPackageLoader.LoadFile(path);
                    if (loaded.PackageBoundary.Count < 3)
                        throw new ArgumentException("Package has no georeferenced site boundary. Export a package with site.json.");
                    var generated = PlanningEngine.GenerateCandidates(loaded.PackageBoundary, loaded, seed,
                        new StrategyGenerationSettings(count, 1, diversity));
                    return (loaded, generated);
                });
                _ = _pending.ContinueWith(_ => document?.ScheduleSolution(1, _ => ExpireSolution(false)), TaskScheduler.Default);
                Message = "Generating…";
                data.SetDataList(8, new[] { "Generation started in the background; results will appear automatically." });
                return;
            }
            Message = $"{_generationResult.Scenarios.Count} options";
            var package = _resultPackage!;
            var result = _generationResult;
            var scenarios = result.Scenarios.Take(count).ToList();
            if (selected < 0 || selected >= scenarios.Count)
                throw new ArgumentException($"Selected Option must be between 0 and {scenarios.Count - 1}.");
            var option = scenarios[selected];
            data.SetDataList(0, option.Areas.Placements.Select(p =>
                new Circle(new Plane(ToRhino(p.Center), Vector3d.ZAxis), p.Radius).ToNurbsCurve()));
            data.SetDataList(1, option.Areas.Placements.Select(p => ToRhino(p.Center)));
            data.SetDataList(2, option.Areas.Placements.Select(p => p.ProgramId));
            data.SetDataList(3, option.Routes.Where(p => p.Points.Count >= 2).Select(p =>
                new PolylineCurve(p.Points.Select(ToRhino))));
            data.SetDataList(4, option.Nodes.Concat(option.AreaAnchors).Select(p => ToRhino(p.Point)));
            data.SetDataList(5, option.RelationshipLines.Select(p => new LineCurve(ToRhino(p.Source), ToRhino(p.Target))));
            data.SetDataList(6, scenarios.Select((s, index) => JsonSerializer.Serialize(new {
                option_index = index, strategy = s.GeneratedStrategy, seed = s.Seed, score = s.Score,
                area_program_count = s.Areas.Placements.Count, route_count = s.Routes.Count,
                average_suitability = s.Areas.AverageSuitability, solver_diagnostics = s.SolverDiagnostics,
                regulatory_status = "not_validated", warnings = s.Warnings })));
            data.SetData(7, JsonSerializer.Serialize(option));
            data.SetDataList(8, option.Warnings.Concat(package.Unresolved).Append("Planning proxies: thermal comfort, budget and regulatory compliance require measured validation."));
            var ring = package.PackageBoundary.Select(ToRhino).ToList(); ring.Add(ring[0]);
            data.SetData(9, new PolylineCurve(ring));
            if (scenarios.Count < count)
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, $"Returned {scenarios.Count}/{count} distinct solver-valid alternatives; no duplicates were added to fill the request.");
        }
        catch (Exception e) { AddRuntimeMessage(GH_RuntimeMessageLevel.Error, e.Message); }
    }

    private static Point3d ToRhino(Point2 p) => new(p.X, p.Y, 0);

    private static string PackageFingerprint(string path)
    {
        path = path.Trim().Trim('"');
        if (!File.Exists(path) && File.Exists(path + ".zip")) path += ".zip";
        var files = Directory.Exists(path)
            ? Directory.GetFiles(path, "*.json", SearchOption.TopDirectoryOnly).OrderBy(p => p, StringComparer.Ordinal).ToArray()
            : new[] { path };
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var file in files)
        {
            hash.AppendData(System.Text.Encoding.UTF8.GetBytes(Path.GetFileName(file)));
            hash.AppendData(File.ReadAllBytes(file));
        }
        return Convert.ToHexString(hash.GetHashAndReset());
    }
}
