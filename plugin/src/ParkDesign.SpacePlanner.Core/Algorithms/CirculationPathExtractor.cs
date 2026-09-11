using System.Security.Cryptography;
using System.Text;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class CirculationPathExtractor
{
    public static List<CirculationPathChain> Extract(CirculationResult result)
    {
        var chains = new List<CirculationPathChain>();
        foreach (var group in result.Edges.GroupBy(edge => (edge.Network, edge.Hierarchy))
                     .OrderBy(group => group.Key.Network, StringComparer.Ordinal)
                     .ThenBy(group => group.Key.Hierarchy, StringComparer.Ordinal))
            chains.AddRange(ExtractGroup(group.ToList()));
        return chains.OrderBy(chain => chain.Network, StringComparer.Ordinal)
            .ThenBy(chain => HierarchyRank(chain.Hierarchy))
            .ThenBy(chain => chain.Id, StringComparer.Ordinal).ToList();
    }

    private static IEnumerable<CirculationPathChain> ExtractGroup(IReadOnlyList<CirculationEdge> edges)
    {
        var byId = edges.ToDictionary(edge => edge.Id, StringComparer.Ordinal);
        var incident = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var edge in edges)
        {
            Add(incident, edge.StartNodeId, edge.Id);
            Add(incident, edge.EndNodeId, edge.Id);
        }
        foreach (var list in incident.Values) list.Sort(StringComparer.Ordinal);

        var unused = edges.Select(edge => edge.Id).ToHashSet(StringComparer.Ordinal);
        var starts = incident.Where(pair => pair.Value.Count != 2).Select(pair => pair.Key)
            .OrderBy(id => id, StringComparer.Ordinal).ToList();
        foreach (var start in starts)
        foreach (var edgeId in incident[start].Where(unused.Contains).ToList())
            yield return Walk(start, edgeId, unused, incident, byId);

        while (unused.Count > 0)
        {
            var edgeId = unused.OrderBy(id => id, StringComparer.Ordinal).First();
            yield return Walk(byId[edgeId].StartNodeId, edgeId, unused, incident, byId);
        }
    }

    private static CirculationPathChain Walk(
        string startNodeId,
        string firstEdgeId,
        ISet<string> unused,
        IReadOnlyDictionary<string, List<string>> incident,
        IReadOnlyDictionary<string, CirculationEdge> byId)
    {
        var points = new List<Point2>();
        var edgeIds = new List<string>();
        var currentNode = startNodeId;
        var currentEdgeId = firstEdgeId;
        while (unused.Remove(currentEdgeId))
        {
            var edge = byId[currentEdgeId];
            var forward = edge.StartNodeId == currentNode;
            var segment = forward ? edge.Centerline : edge.Centerline.Reverse<Point2>().ToList();
            if (points.Count == 0) points.AddRange(segment);
            else points.AddRange(segment.Skip(1));
            edgeIds.Add(edge.Id);
            currentNode = forward ? edge.EndNodeId : edge.StartNodeId;
            if (!incident.TryGetValue(currentNode, out var nextEdges) || nextEdges.Count != 2) break;
            var next = nextEdges.Where(unused.Contains).OrderBy(id => id, StringComparer.Ordinal).FirstOrDefault();
            if (next is null) break;
            currentEdgeId = next;
        }

        var sample = byId[edgeIds[0]];
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("|", edgeIds)));
        return new(
            $"chain-{Convert.ToHexString(digest)[..12].ToLowerInvariant()}",
            sample.Network,
            sample.Hierarchy,
            sample.WidthM,
            points,
            edgeIds,
            edgeIds.Max(id => byId[id].TotalFlow));
    }

    private static void Add(IDictionary<string, List<string>> incident, string nodeId, string edgeId)
    {
        if (!incident.TryGetValue(nodeId, out var edges)) incident[nodeId] = edges = [];
        edges.Add(edgeId);
    }

    private static int HierarchyRank(string hierarchy) => hierarchy switch
    {
        "primary" => 0,
        "secondary" => 1,
        "tertiary" => 2,
        "service" => 3,
        _ => 4
    };
}
