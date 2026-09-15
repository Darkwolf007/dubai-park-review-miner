namespace ParkDesign.SpacePlanner.Core.Models;

/// <summary>Design heuristics only. Values in this model never become regulatory constraints.</summary>
public sealed record StrategyGenome(
    IReadOnlyList<string> AnchorProgramIds,
    double CentralityBias,
    double EdgeAffinity,
    double ClusteringStrength,
    double DispersionStrength,
    double RouteInfluence,
    double EntranceInfluence,
    double EnvironmentalInfluence,
    double RelationshipInfluence,
    double OrientationX,
    double OrientationY,
    double LoopPreference,
    double BranchingPreference);

public sealed record StrategyObjectiveWeights(
    double AreaCompliance = 1,
    double RelationshipSatisfaction = 1,
    double MovementEfficiency = 1,
    double SiteSuitability = 1,
    double ThermalComfort = 1,
    double Accessibility = 1,
    double Biodiversity = 1,
    double Cost = 1);

public sealed record StrategyGenerationSettings(int CandidateCount = 5, int PlacementsPerStrategy = 2,
    double MinimumCentreDisplacement = 0.08);

public sealed record StrategyRationale(IReadOnlyList<string> SiteForces, IReadOnlyList<string> UnresolvedInputs);

public sealed record GeneratedStrategy(string StrategyId, int Seed, StrategyGenome Organisation,
    StrategyObjectiveWeights ObjectiveWeights, StrategyRationale Rationale);
