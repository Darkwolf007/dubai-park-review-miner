using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class TerritoryConsolidator
{
    public static List<SharedTerritoryPlacement> ConsolidateShared(IEnumerable<ProgramDefinition> programs,
        IEnumerable<BubblePlacement> placements, IEnumerable<RelationshipDefinition> relationships)
    {
        var programMap = programs.ToDictionary(program => program.Id, StringComparer.Ordinal);
        var placementMap = placements.ToDictionary(placement => placement.ProgramId, StringComparer.Ordinal);
        var sharedIds = programMap.Values.Where(program => program.SpatialMode == "shared" && placementMap.ContainsKey(program.Id))
            .Select(program => program.Id).ToHashSet(StringComparer.Ordinal);
        var parents = placementMap.Keys.ToDictionary(id => id, id => id, StringComparer.Ordinal);
        string Find(string id) { while (parents[id] != id) { parents[id] = parents[parents[id]]; id = parents[id]; } return id; }
        void Union(string a, string b) { var rootA = Find(a); var rootB = Find(b); if (rootA != rootB) parents[rootB] = rootA; }

        var groupingEdges = relationships.Where(edge => edge.Accepted && edge.Type == "overlap_compatible"
            && placementMap.ContainsKey(edge.Source) && placementMap.ContainsKey(edge.Target)
            && (sharedIds.Contains(edge.Source) || sharedIds.Contains(edge.Target))
            && edge.OverlapMode is not "landscape_overlay" and not "edge_canopy").ToList();
        foreach (var edge in groupingEdges) Union(edge.Source, edge.Target);

        var groups = sharedIds.Select(id => Find(id)).Distinct(StringComparer.Ordinal)
            .Select(root => placementMap.Keys.Where(id => Find(id) == root).OrderBy(id => id, StringComparer.Ordinal).ToList())
            .ToList();
        var results = new List<SharedTerritoryPlacement>();
        foreach (var memberIds in groups)
        {
            var members = memberIds.Select(id => placementMap[id]).OrderByDescending(item => item.TargetAreaM2)
                .ThenBy(item => item.ProgramId, StringComparer.Ordinal).ToList();
            var host = members.Where(item => programMap[item.ProgramId].SpatialMode == "exclusive")
                .OrderByDescending(item => item.TargetAreaM2).ThenBy(item => item.ProgramId, StringComparer.Ordinal).FirstOrDefault();
            var anchor = host ?? members[0];
            var footprint = 0d; var accepted = new List<string>(); var compatibilities = new List<double>();
            foreach (var member in members)
            {
                var compatibility = accepted.Count == 0 ? 0 : groupingEdges
                    .Where(edge => accepted.Contains(edge.Source) && edge.Target == member.ProgramId
                        || accepted.Contains(edge.Target) && edge.Source == member.ProgramId)
                    .Select(edge => Math.Clamp(edge.CompatibilityScore ?? 0, 0, 1)).DefaultIfEmpty(0).Max();
                footprint += member.TargetAreaM2 * (1 - compatibility);
                if (accepted.Count > 0) compatibilities.Add(compatibility);
                accepted.Add(member.ProgramId);
            }
            var modes = groupingEdges.Where(edge => memberIds.Contains(edge.Source) && memberIds.Contains(edge.Target))
                .Select(edge => edge.OverlapMode).Where(mode => !string.IsNullOrWhiteSpace(mode)).Distinct(StringComparer.Ordinal).ToList();
            results.Add(new(
                $"shared:{string.Join("+", memberIds)}",
                string.Join(" + ", memberIds.Select(id => programMap[id].Name)), memberIds,
                anchor.Center, Math.Sqrt(footprint / Math.PI), footprint, members.Sum(item => item.TargetAreaM2),
                compatibilities.Count == 0 ? 0 : compatibilities.Average(),
                modes.Count == 0 ? "independent_shared_territory" : string.Join("+", modes), host?.ProgramId));
        }
        return results.OrderBy(result => result.TerritoryId, StringComparer.Ordinal).ToList();
    }

    public static List<LandscapeOverlayPlacement> BuildLandscapeOverlays(IEnumerable<ProgramDefinition> programs,
        IEnumerable<NodePlacement> areaAnchors, AreaReconciliationDefinition reconciliation)
    {
        var programsById = programs.ToDictionary(program => program.Id, StringComparer.Ordinal);
        var anchorsById = areaAnchors.ToDictionary(anchor => anchor.ProgramId, StringComparer.Ordinal);
        return reconciliation.CoverageTargets.Where(target => target.Percent > 0 && target.EquivalentAreaM2 > 0
                && programsById.ContainsKey(target.ProgramId) && anchorsById.ContainsKey(target.ProgramId))
            .Select(target => new LandscapeOverlayPlacement(target.ProgramId, programsById[target.ProgramId].Name,
                anchorsById[target.ProgramId].Point, Math.Sqrt(target.EquivalentAreaM2 / Math.PI),
                target.Percent, target.EquivalentAreaM2))
            .OrderBy(item => item.ProgramId, StringComparer.Ordinal).ToList();
    }
}
