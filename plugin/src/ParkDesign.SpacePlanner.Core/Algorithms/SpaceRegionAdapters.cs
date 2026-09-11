using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class SpaceRegionAdapters
{
    public static List<SpaceRegion> FromBubbles(
        IEnumerable<BubblePlacement> bubbles,
        Func<BubblePlacement, SpaceCirculationBehavior>? behavior = null,
        int segmentCount = 24)
    {
        segmentCount = Math.Max(8, segmentCount);
        return bubbles.OrderBy(bubble => bubble.ProgramId, StringComparer.Ordinal).Select(bubble =>
        {
            var ring = Enumerable.Range(0, segmentCount)
                .Select(index =>
            {
                var angle = Math.PI * 2 * index / segmentCount;
                return new Point2(
                    bubble.Center.X + Math.Cos(angle) * bubble.Radius,
                    bubble.Center.Y + Math.Sin(angle) * bubble.Radius);
            }).ToList();
            return new SpaceRegion(
                bubble.ProgramId,
                bubble.ProgramName,
                ring,
                behavior?.Invoke(bubble) ?? SpaceCirculationBehavior.DestinationOnly,
                AccessPointCount: null,
                PreviewOnly: true);
        }).ToList();
    }
}
