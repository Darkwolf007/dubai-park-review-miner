using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public sealed class AccessCombinationResult
{
    public bool IsValid { get; init; }
    public List<string> Violations { get; init; } = [];
    public AccessCandidateDefinition? Main { get; init; }
    public AccessCandidateDefinition? Secondary { get; init; }
    public AccessCandidateDefinition? Service { get; init; }
    public double CombinedPopulationServed { get; init; }
    public double AdditionalPopulationFromSecondary { get; init; }
    public double CatchmentOverlapRatio { get; init; }
    public double PublicEntranceSeparationM { get; init; }
    public IReadOnlyList<string> FitnessNames { get; init; } = [];
    public IReadOnlyList<double> FitnessValues { get; init; } = [];
}

public static class AccessCombinationEvaluator
{
    private const double InvalidFitness = 1_000_000_000;

    public static AccessCombinationResult Evaluate(DesignPackage package, int mainIndex, int secondaryIndex, int serviceIndex)
    {
        var violations = new List<string>();
        var main = CandidateAt(package, mainIndex, "main", violations);
        var secondary = CandidateAt(package, secondaryIndex, "secondary", violations);
        var service = CandidateAt(package, serviceIndex, "service", violations);

        if (mainIndex == secondaryIndex) violations.Add("Main and secondary entrances must use different candidates.");
        if (mainIndex == serviceIndex || secondaryIndex == serviceIndex) violations.Add("Service entrance must use a candidate distinct from both public entrances.");
        if (main is not null && (!main.EligibleRoles.MainEntrance || main.HardExclusions.Count > 0))
            violations.Add($"{main.CandidateId} is not eligible for the main entrance: {Exclusions(main)}.");
        if (secondary is not null && (!secondary.EligibleRoles.SecondaryEntrance || secondary.HardExclusions.Count > 0))
            violations.Add($"{secondary.CandidateId} is not eligible for the secondary entrance: {Exclusions(secondary)}.");
        if (service is not null && (!service.EligibleRoles.ServiceEntrance || service.HardExclusions.Count > 0))
            violations.Add($"{service.CandidateId} is not eligible for the service entrance: {Exclusions(service)}.");

        AccessCandidatePairDefinition? pair = null;
        if (main is not null && secondary is not null)
        {
            pair = package.AccessCandidatePairs.FirstOrDefault(item =>
                (item.CandidateA == main.CandidateId && item.CandidateB == secondary.CandidateId)
                || (item.CandidateA == secondary.CandidateId && item.CandidateB == main.CandidateId));
            if (pair is null) violations.Add("No exported pair metrics exist for the selected public entrances.");
        }

        var names = new[]
        {
            "maximize_combined_population_served",
            "maximize_additional_population_from_secondary",
            "minimize_catchment_overlap",
            "maximize_public_entrance_separation",
            "maximize_public_transit_access",
            "maximize_public_intersection_connectivity",
            "maximize_service_road_access",
            "maximize_low_barrier_access"
        };
        if (violations.Count > 0 || main is null || secondary is null || service is null || pair is null)
            return new AccessCombinationResult
            {
                IsValid = false,
                Violations = violations,
                Main = main,
                Secondary = secondary,
                Service = service,
                FitnessNames = names,
                FitnessValues = names.Select(_ => InvalidFitness).ToArray()
            };

        var additionalSecondary = SecondaryAdditionalPopulation(pair, main, secondary);
        var transit = main.MetricsNormalized.TransitAccess + secondary.MetricsNormalized.TransitAccess;
        var intersections = main.MetricsNormalized.IntersectionConnectivity + secondary.MetricsNormalized.IntersectionConnectivity;
        var lowBarrier = (main.MetricsNormalized.LowBarrierAccess + secondary.MetricsNormalized.LowBarrierAccess + service.MetricsNormalized.LowBarrierAccess) / 3;
        return new AccessCombinationResult
        {
            IsValid = true,
            Main = main,
            Secondary = secondary,
            Service = service,
            CombinedPopulationServed = pair.CombinedPopulationServed,
            AdditionalPopulationFromSecondary = additionalSecondary,
            CatchmentOverlapRatio = pair.CatchmentOverlapRatio,
            PublicEntranceSeparationM = pair.DistanceM,
            FitnessNames = names,
            // Wallacei minimizes fitness values, so maximization objectives are negated.
            FitnessValues =
            [
                -pair.CombinedPopulationServed,
                -additionalSecondary,
                pair.CatchmentOverlapRatio,
                -pair.DistanceM,
                -transit,
                -intersections,
                -service.MetricsNormalized.RoadAccess,
                -lowBarrier
            ]
        };
    }

    private static AccessCandidateDefinition? CandidateAt(DesignPackage package, int index, string role, List<string> violations)
    {
        if (index >= 0 && index < package.AccessCandidates.Count) return package.AccessCandidates[index];
        violations.Add($"The {role} candidate index {index} is outside 0..{Math.Max(0, package.AccessCandidates.Count - 1)}.");
        return null;
    }

    private static string Exclusions(AccessCandidateDefinition candidate) =>
        candidate.HardExclusions.Count == 0 ? "role disabled" : string.Join(", ", candidate.HardExclusions);

    private static double SecondaryAdditionalPopulation(AccessCandidatePairDefinition pair, AccessCandidateDefinition main, AccessCandidateDefinition secondary)
    {
        if (pair.CandidateB == secondary.CandidateId) return pair.AdditionalPopulationServedByB;
        if (pair.AdditionalPopulationServedByA.HasValue) return pair.AdditionalPopulationServedByA.Value;
        // v1.1 packages produced before the bidirectional field can still be evaluated from the pair union and main catchment.
        return Math.Max(0, pair.CombinedPopulationServed - main.MetricsRaw.PopulationWithinCatchment);
    }
}
