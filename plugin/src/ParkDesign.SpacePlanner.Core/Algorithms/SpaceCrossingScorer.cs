using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class SpaceCrossingScorer
{
    public static List<SpaceCrossingScore> Score(IEnumerable<ProgramDefinition> programs,
        IReadOnlyDictionary<string, RectanglePlacement>? rectangles = null)
    {
        var result = new List<SpaceCrossingScore>();
        foreach (var program in programs)
        {
            RectanglePlacement? rectangle = null;
            rectangles?.TryGetValue(program.Id, out rectangle);
            result.Add(ScoreMode(program, rectangle, "walking", 1.5, program.CirculationProfile.Walking));
            result.Add(ScoreMode(program, rectangle, "cycling", 2.5, program.CirculationProfile.Cycling));
            result.Add(ScoreMode(program, rectangle, "service", 3, program.CirculationProfile.Service));
        }
        return result;
    }

    private static SpaceCrossingScore ScoreMode(ProgramDefinition program, RectanglePlacement? rectangle,
        string mode, double defaultWidth, ModeCrossingRule authored)
    {
        var searchable = $"{program.Id} {program.Name} {program.Category}".ToLowerInvariant();
        var width = authored.MinimumClearWidthM is > 0 ? authored.MinimumClearWidthM.Value : defaultWidth;
        var (policy, baseScore, basis) = Defaults(searchable, mode);
        if (authored.DesignerScore.HasValue)
        {
            policy = authored.CrossingPolicy;
            baseScore = Math.Clamp(authored.DesignerScore.Value, 0, 1);
            basis = "designer-authored circulation profile";
        }
        var clearDimension = rectangle is null ? width * 2 : Math.Min(rectangle.WidthM, rectangle.HeightM);
        var geometryScore = Math.Clamp((clearDimension - width) / Math.Max(width * 3, 1), 0, 1);
        var score = 100 * (.65 * baseScore + .35 * geometryScore);
        var allowed = !policy.Equals("forbidden", StringComparison.OrdinalIgnoreCase) && clearDimension + 1e-6 >= width;
        if (!allowed) score = 0;
        return new(program.Id, mode, policy, Math.Round(score, 2), allowed, width,
            $"{basis}; clear dimension {clearDimension:0.##}m for {width:0.##}m corridor");
    }

    private static (string Policy, double Score, string Basis) Defaults(string value, string mode)
    {
        if (mode == "service")
            return ContainsAny(value, "operation", "maintenance", "service yard")
                ? ("destination_only", .8, "dedicated operations service access")
                : ("forbidden", 0, "service/public-space separation");
        if (mode == "walking")
        {
            if (ContainsAny(value, "operation", "maintenance")) return ("forbidden", 0, "operations hard barrier");
            if (ContainsAny(value, "playground", "toddler", "children play", "inclusive play"))
                return ("allowed", .55, "edge-biased playground walking crossing");
            if (ContainsAny(value, "plaza", "lawn", "flexible", "event")) return ("preferred", .9, "public permeable space");
            return ("allowed", .65, "default public walking permeability");
        }
        if (ContainsAny(value, "operation", "maintenance", "court", "playground", "toddler", "children play",
                "inclusive play", "sensory", "quiet garden", "drop-off", "drop off"))
            return ("forbidden", 0, "vulnerable users, enclosure, or vehicle conflict");
        if (ContainsAny(value, "main entrance", "gateway", "community plaza"))
            return ("controlled_only", .85, "controlled plaza cycling crossing");
        if (ContainsAny(value, "lawn", "flexible recreation"))
            return ("controlled_only", .7, "controlled open-space cycling crossing");
        return ("controlled_only", .35, "default cycling conflict precaution");
    }

    private static bool ContainsAny(string value, params string[] terms) => terms.Any(value.Contains);
}
