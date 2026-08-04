using Grasshopper.Kernel;

namespace ParkDesign.SpacePlanner;

public sealed class SpacePlannerAssemblyInfo : GH_AssemblyInfo
{
    public override string Name => "Park Design Space Planner";
    public override string Description => "Evidence-aware program bubble distribution for georeferenced park sites.";
    public override Guid Id => new("6C42AB67-7B08-4DBB-A06B-C3F79FD42D60");
    public override string AuthorName => "Park Design";
    public override string AuthorContact => string.Empty;
}
