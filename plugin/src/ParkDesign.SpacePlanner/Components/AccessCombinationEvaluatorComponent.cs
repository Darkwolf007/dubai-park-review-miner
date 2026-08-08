using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Algorithms;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class AccessCombinationEvaluatorComponent : GH_Component
{
    public AccessCombinationEvaluatorComponent()
        : base("Evaluate Access Combination", "AccessFitness", "Evaluates main, secondary, and service entrance genes using exported evidence and returns Wallacei minimization fitness values.", "Park Design", "Optimization") { }

    public override Guid ComponentGuid => new("AA0C6811-7E14-4AEF-AB67-1096986D75AA");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddTextParameter("Design Package", "P", "Path to the Park Design Package ZIP or extracted folder.", GH_ParamAccess.item);
        parameters.AddIntegerParameter("Main Index", "M", "Candidate list index for the main public entrance.", GH_ParamAccess.item, 0);
        parameters.AddIntegerParameter("Secondary Index", "S", "Candidate list index for the secondary public entrance.", GH_ParamAccess.item, 1);
        parameters.AddIntegerParameter("Service Index", "V", "Candidate list index for the service entrance.", GH_ParamAccess.item, 2);
        parameters.AddBooleanParameter("Run", "R", "Evaluate this access combination.", GH_ParamAccess.item, true);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddPointParameter("Main Point", "M", "Selected main-entrance point.", GH_ParamAccess.item);
        parameters.AddPointParameter("Secondary Point", "S", "Selected secondary-entrance point.", GH_ParamAccess.item);
        parameters.AddPointParameter("Service Point", "V", "Selected service-entrance point.", GH_ParamAccess.item);
        parameters.AddTextParameter("Selected IDs", "ID", "Main, secondary, and service candidate IDs.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Valid", "OK", "True only when all hard constraints pass.", GH_ParamAccess.item);
        parameters.AddTextParameter("Hard Violations", "X", "Hard-constraint violations; school/building-facing candidates cannot pass.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Combined Population", "CP", "Combined population served by the two public entrances.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Additional Population", "AP", "Population added by the secondary entrance beyond the main entrance.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Catchment Overlap", "CO", "Population-weighted catchment overlap ratio.", GH_ParamAccess.item);
        parameters.AddNumberParameter("Public Separation", "PS", "Distance between main and secondary entrances in metres.", GH_ParamAccess.item);
        parameters.AddTextParameter("Fitness Names", "FN", "Fitness labels with the intended objective direction.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Wallacei Fitness", "F", "Minimization-ready fitness values; maximization objectives are negated. Invalid combinations return 1e9.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Combination summary and important limitations.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var path = string.Empty;
        var mainIndex = 0;
        var secondaryIndex = 1;
        var serviceIndex = 2;
        var run = true;
        if (!data.GetData(0, ref path)) return;
        data.GetData(1, ref mainIndex);
        data.GetData(2, ref secondaryIndex);
        data.GetData(3, ref serviceIndex);
        data.GetData(4, ref run);
        if (!run) return;

        try
        {
            var package = DesignPackageLoader.LoadFile(path);
            var result = AccessCombinationEvaluator.Evaluate(package, mainIndex, secondaryIndex, serviceIndex);
            if (result.Main is not null) data.SetData(0, Point(result.Main));
            if (result.Secondary is not null) data.SetData(1, Point(result.Secondary));
            if (result.Service is not null) data.SetData(2, Point(result.Service));
            data.SetDataList(3, new[] { result.Main?.CandidateId ?? "invalid-main", result.Secondary?.CandidateId ?? "invalid-secondary", result.Service?.CandidateId ?? "invalid-service" });
            data.SetData(4, result.IsValid);
            data.SetDataList(5, result.Violations);
            data.SetData(6, result.CombinedPopulationServed);
            data.SetData(7, result.AdditionalPopulationFromSecondary);
            data.SetData(8, result.CatchmentOverlapRatio);
            data.SetData(9, result.PublicEntranceSeparationM);
            data.SetDataList(10, result.FitnessNames);
            data.SetDataList(11, result.FitnessValues);
            data.SetData(12, result.IsValid
                ? $"VALID | main {result.Main!.CandidateId} | secondary {result.Secondary!.CandidateId} | service {result.Service!.CandidateId} | population {result.CombinedPopulationServed:0} | secondary adds {result.AdditionalPopulationFromSecondary:0} | overlap {result.CatchmentOverlapRatio:P1} | separation {result.PublicEntranceSeparationM:0.0} m | service/public path conflict is not scored until route geometry exists"
                : $"INVALID | {string.Join(" | ", result.Violations)}");
            if (!result.IsValid)
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "Invalid access gene combination; Wallacei fitness penalty 1e9 applied.");
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"Could not evaluate access combination: {exception.Message}");
        }
    }

    private static Point3d Point(Core.Models.AccessCandidateDefinition candidate) =>
        new(candidate.Coordinates.X, candidate.Coordinates.Y, 0);
}
