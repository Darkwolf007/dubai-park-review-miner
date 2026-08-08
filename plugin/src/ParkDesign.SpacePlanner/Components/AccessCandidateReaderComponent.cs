using Grasshopper.Kernel;
using ParkDesign.SpacePlanner.Core.Serialization;
using Rhino.Geometry;

namespace ParkDesign.SpacePlanner.Components;

public sealed class AccessCandidateReaderComponent : GH_Component
{
    public AccessCandidateReaderComponent()
        : base("Read Access Candidates", "AccessCandidates", "Reads every data-driven entrance candidate and its evidence from a Park Design Package v1.1.", "Park Design", "Optimization") { }

    public override Guid ComponentGuid => new("6E8F41A6-E7E9-45D9-AB44-88A3A7452463");
    protected override System.Drawing.Bitmap? Icon => null;

    protected override void RegisterInputParams(GH_InputParamManager parameters)
    {
        parameters.AddTextParameter("Design Package", "P", "Path to the Park Design Package ZIP or extracted folder.", GH_ParamAccess.item);
        parameters.AddBooleanParameter("Run", "R", "Read access candidates.", GH_ParamAccess.item, true);
    }

    protected override void RegisterOutputParams(GH_OutputParamManager parameters)
    {
        parameters.AddPointParameter("Candidate Points", "P", "Georeferenced EPSG:32640 access candidate points.", GH_ParamAccess.list);
        parameters.AddTextParameter("Candidate IDs", "ID", "Stable candidate identifiers; list index is the optimization gene value.", GH_ParamAccess.list);
        parameters.AddTextParameter("Edge IDs", "E", "Boundary edge identifiers.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Main Eligible", "M", "Eligible as main public entrance.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Secondary Eligible", "S", "Eligible as secondary public entrance.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Drop-off Eligible", "D", "Eligible as drop-off location.", GH_ParamAccess.list);
        parameters.AddBooleanParameter("Service Eligible", "V", "Eligible as service entrance.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Population Pull", "PP", "Raw modeled population pull; this is potential demand, not measured footfall.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Population Catchment", "PC", "Raw population within the configured access catchment.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Transit Access", "TA", "Normalized transit-access score, 0..1.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Intersection Connectivity", "IC", "Normalized intersection-connectivity score, 0..1.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Road Access", "RA", "Normalized road-access score, 0..1.", GH_ParamAccess.list);
        parameters.AddNumberParameter("Low Barrier Access", "BA", "Normalized low-barrier score, 0..1.", GH_ParamAccess.list);
        parameters.AddTextParameter("Hard Exclusions", "X", "Hard exclusion reasons per candidate; blank means none.", GH_ParamAccess.list);
        parameters.AddTextParameter("Summary", "I", "Candidate and package summary.", GH_ParamAccess.item);
    }

    protected override void SolveInstance(IGH_DataAccess data)
    {
        var path = string.Empty;
        var run = true;
        if (!data.GetData(0, ref path)) return;
        data.GetData(1, ref run);
        if (!run) return;

        try
        {
            var package = DesignPackageLoader.LoadFile(path);
            var candidates = package.AccessCandidates;
            if (candidates.Count == 0)
            {
                AddRuntimeMessage(GH_RuntimeMessageLevel.Warning, "ACCESS_CANDIDATES_EMPTY: Export a Park Design Package v1.1 with access_candidates.json.");
                data.SetData(14, $"{package.Project.SiteName} | no access candidates in package");
                return;
            }

            data.SetDataList(0, candidates.Select(item => new Point3d(item.Coordinates.X, item.Coordinates.Y, 0)));
            data.SetDataList(1, candidates.Select(item => item.CandidateId));
            data.SetDataList(2, candidates.Select(item => item.EdgeId));
            data.SetDataList(3, candidates.Select(item => item.EligibleRoles.MainEntrance && item.HardExclusions.Count == 0));
            data.SetDataList(4, candidates.Select(item => item.EligibleRoles.SecondaryEntrance && item.HardExclusions.Count == 0));
            data.SetDataList(5, candidates.Select(item => item.EligibleRoles.DropOff && item.HardExclusions.Count == 0));
            data.SetDataList(6, candidates.Select(item => item.EligibleRoles.ServiceEntrance && item.HardExclusions.Count == 0));
            data.SetDataList(7, candidates.Select(item => item.MetricsRaw.PopulationPull));
            data.SetDataList(8, candidates.Select(item => item.MetricsRaw.PopulationWithinCatchment));
            data.SetDataList(9, candidates.Select(item => item.MetricsNormalized.TransitAccess));
            data.SetDataList(10, candidates.Select(item => item.MetricsNormalized.IntersectionConnectivity));
            data.SetDataList(11, candidates.Select(item => item.MetricsNormalized.RoadAccess));
            data.SetDataList(12, candidates.Select(item => item.MetricsNormalized.LowBarrierAccess));
            data.SetDataList(13, candidates.Select(item => string.Join(", ", item.HardExclusions)));
            var eligible = candidates.Count(item => item.EligibleRoles.MainEntrance && item.HardExclusions.Count == 0);
            data.SetData(14, $"{package.Project.SiteName} | {candidates.Count} candidates | {eligible} public-entrance eligible | {package.AccessCandidatePairs.Count} public pairs | gene range 0..{candidates.Count - 1}");
        }
        catch (Exception exception)
        {
            AddRuntimeMessage(GH_RuntimeMessageLevel.Error, $"Could not load access candidates: {exception.Message}");
        }
    }
}
