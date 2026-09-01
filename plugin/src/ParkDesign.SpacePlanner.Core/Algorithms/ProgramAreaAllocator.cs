using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public sealed record ProgramAreaAllocation(List<ProgramDefinition> Programs, string Mode, List<string> Warnings);

public static class ProgramAreaAllocator
{
    public static ProgramAreaAllocation AllocateAll(IEnumerable<ProgramDefinition> source, double boundaryAreaM2)
    {
        var resolved = source.Where(program => program.TargetAreaM2 is > 0).ToList();
        var targetTotal = resolved.Sum(program => program.TargetAreaM2!.Value);
        var minimumTotal = resolved.Sum(program => program.MinimumAreaM2 ?? program.TargetAreaM2!.Value);
        var useMinimum = targetTotal > boundaryAreaM2 && minimumTotal <= boundaryAreaM2;
        var warnings = new List<string>();
        if (useMinimum)
            warnings.Add($"All defined area programs are included. Their target total ({targetTotal:0} m2) exceeds the boundary ({boundaryAreaM2:0} m2), so documented minimum areas are used ({minimumTotal:0} m2). No area was scaled below its exported minimum.");
        else if (minimumTotal > boundaryAreaM2)
            warnings.Add($"The documented minimum program total ({minimumTotal:0} m2) exceeds the boundary ({boundaryAreaM2:0} m2). All minimums are retained; infeasible placements will remain explicit.");

        var programs = resolved.Select(program => Clone(program, useMinimum ? program.MinimumAreaM2 ?? program.TargetAreaM2 : program.TargetAreaM2)).ToList();
        return new ProgramAreaAllocation(programs, useMinimum ? "documented_minimums" : "exported_targets", warnings);
    }

    private static ProgramDefinition Clone(ProgramDefinition source, double? area) => new()
    {
        Id = source.Id,
        Name = source.Name,
        TargetAreaM2 = area,
        MinimumAreaM2 = source.MinimumAreaM2,
        MaximumAreaM2 = source.MaximumAreaM2,
        LocationZone = source.LocationZone,
        GeometryType = source.GeometryType,
        Priority = source.Priority,
        Selected = true,
        Mandatory = source.Mandatory,
        SpatialMode = source.SpatialMode,
        FragmentationPolicy = source.FragmentationPolicy,
        DecisionAuthority = source.DecisionAuthority,
        SynthesisSelected = source.SynthesisSelected,
        SuitabilityField = source.SuitabilityField,
        AreaStatus = source.AreaStatus,
        RepresentationStatus = source.RepresentationStatus,
        PlacementStatus = source.PlacementStatus,
        Attractors = source.Attractors,
        Repellers = source.Repellers,
        Constraints = source.Constraints,
        Category = source.Category,
        PrimaryUsers = source.PrimaryUsers,
        EvidenceSources = source.EvidenceSources,
        Evidence = source.Evidence,
        Scores = source.Scores,
        Ontology = source.Ontology,
        SpatialBehavior = source.SpatialBehavior,
        UserGroupIds = source.UserGroupIds,
        TemporalProfile = source.TemporalProfile,
        SeasonalProfile = source.SeasonalProfile,
        PerformanceAttributes = source.PerformanceAttributes,
        Commercial = source.Commercial,
        DuneCompatibility = source.DuneCompatibility,
        PathDuneOperations = source.PathDuneOperations
    };
}
