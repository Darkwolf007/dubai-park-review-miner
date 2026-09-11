using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class CirculationNetworkBuilder
{
    private sealed record RouteRequest(
        string Id,
        string OriginId,
        string DestinationId,
        Point2 Origin,
        Point2 Destination,
        double Weight,
        string Network,
        bool ForcePrimary,
        bool Accessible,
        IReadOnlyList<string> JourneyIds);

    private sealed record RoutedRequest(RouteRequest Request, GridPathResult Path);

    public static CirculationResult Build(IReadOnlyList<Point2> siteBoundary, CirculationInput input)
    {
        var access = AccessPointGenerator.Generate(siteBoundary, input.Spaces, input.Entrances,
            input.MovementDemands, input.ExplicitAccessPoints);
        var selectedByProgram = access.Selected.GroupBy(point => point.ProgramId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key,
                group => group.OrderByDescending(point => point.Score).ThenBy(point => point.Id, StringComparer.Ordinal).ToList(),
                StringComparer.Ordinal);
        var entranceById = input.Entrances.ToDictionary(entrance => entrance.Id, StringComparer.Ordinal);
        var destinationById = input.PointDestinations.ToDictionary(destination => destination.ProgramId, StringComparer.Ordinal);
        var availableEndpointIds = selectedByProgram.Keys.Concat(destinationById.Keys).Distinct(StringComparer.Ordinal);
        var hubId = ResolveHub(input, availableEndpointIds);
        var totalDemand = Math.Max(1, input.MovementDemands.Sum(demand => Math.Max(0, demand.Weight)));
        var publicRequests = new List<RouteRequest>();
        var preflightAssignments = new List<CirculationDemandAssignment>();

        foreach (var demand in input.MovementDemands.OrderByDescending(demand => demand.Weight)
                     .ThenBy(demand => demand.Origin, StringComparer.Ordinal)
                     .ThenBy(demand => demand.Destination, StringComparer.Ordinal))
        {
            var demandId = DemandId(demand.Origin, demand.Destination, demand.JourneyIds);
            if (!TryEndpoint(demand.Origin, selectedByProgram, destinationById, entranceById, "public", out var origin, out var originAccessible)
                || !TryEndpoint(demand.Destination, selectedByProgram, destinationById, entranceById, "public", out var destination, out var destinationAccessible))
            {
                preflightAssignments.Add(new()
                {
                    Id = demandId,
                    OriginId = demand.Origin,
                    DestinationId = demand.Destination,
                    Weight = Math.Max(0, demand.Weight),
                    Network = "public",
                    Found = false,
                    AccumulatedCost = double.PositiveInfinity,
                    JourneyIds = demand.JourneyIds.ToList()
                });
                continue;
            }
            publicRequests.Add(new(
                demandId,
                demand.Origin,
                demand.Destination,
                origin,
                destination,
                Math.Max(0, demand.Weight),
                "public",
                false,
                originAccessible && destinationAccessible,
                demand.JourneyIds));
        }

        if (hubId is not null
            && TryEndpoint(hubId, selectedByProgram, destinationById, entranceById, "public", out var hubPoint, out var hubAccessible))
        {
            foreach (var entrance in input.Entrances.Where(entrance => entrance.Type != SiteEntranceType.Service)
                         .OrderBy(entrance => entrance.Type).ThenBy(entrance => entrance.Id, StringComparer.Ordinal))
            {
                publicRequests.Add(new(
                    $"entrance-{entrance.Id}-hub-{hubId}",
                    entrance.Id,
                    hubId,
                    entrance.Point,
                    hubPoint,
                    totalDemand * Math.Max(0.1, entrance.DemandWeight),
                    "public",
                    true,
                    entrance.Accessible && hubAccessible,
                    []));
            }
        }

        var baseField = MovementCostFieldBuilder.Build(siteBoundary, input.Spaces, input.CostSettings);
        var routed = RouteWithReuse(baseField, publicRequests, input.CostSettings.RouteReuseBenefit);

        var serviceEntrance = input.Entrances.Where(entrance => entrance.Type == SiteEntranceType.Service)
            .OrderByDescending(entrance => entrance.DemandWeight).ThenBy(entrance => entrance.Id, StringComparer.Ordinal)
            .FirstOrDefault();
        if (serviceEntrance is not null)
        {
            var serviceRequests = input.Spaces.Where(space => space.RequiresService)
                .OrderBy(space => space.ProgramId, StringComparer.Ordinal)
                .Where(space => selectedByProgram.ContainsKey(space.ProgramId))
                .Select(space =>
                {
                    var accessPoint = selectedByProgram[space.ProgramId]
                        .FirstOrDefault(point => point.AllowsService || point.AccessType == "service")
                        ?? selectedByProgram[space.ProgramId][0];
                    return new RouteRequest(
                        $"service-{serviceEntrance.Id}-{space.ProgramId}",
                        serviceEntrance.Id,
                        space.ProgramId,
                        serviceEntrance.Point,
                        accessPoint.Point,
                        1,
                        "service",
                        false,
                        false,
                        []);
                }).ToList();
            routed.AddRange(RouteWithReuse(baseField, serviceRequests, input.CostSettings.RouteReuseBenefit));
        }

        var result = Merge(routed, preflightAssignments, input, access, hubId);
        foreach (var warning in access.Warnings) result.Audit.Warnings.Add(warning);
        return result;
    }

    private static List<RoutedRequest> RouteWithReuse(
        MovementCostField baseField,
        IReadOnlyList<RouteRequest> requests,
        double reuseBenefit)
    {
        var routed = new List<RoutedRequest>();
        var field = baseField;
        foreach (var request in requests.OrderByDescending(request => request.ForcePrimary)
                     .ThenByDescending(request => request.Weight).ThenBy(request => request.Id, StringComparer.Ordinal))
        {
            var path = GridPathfinder.FindPath(field, request.Origin, request.Destination);
            routed.Add(new(request, path));
            if (path.Found) field = DiscountPath(field, path.Points, reuseBenefit);
        }
        return routed;
    }

    private static MovementCostField DiscountPath(
        MovementCostField field,
        IReadOnlyList<Point2> path,
        double reuseBenefit)
    {
        var discount = Math.Clamp(reuseBenefit, 0, 0.9);
        var used = new HashSet<int>();
        foreach (var point in path)
        {
            var column = Math.Clamp((int)Math.Floor((point.X - field.OriginX) / field.CellSizeM), 0, field.ColumnCount - 1);
            var row = Math.Clamp((int)Math.Floor((point.Y - field.OriginY) / field.CellSizeM), 0, field.RowCount - 1);
            used.Add(field.Cell(column, row).Index);
        }
        return new MovementCostField
        {
            OriginX = field.OriginX,
            OriginY = field.OriginY,
            CellSizeM = field.CellSizeM,
            ColumnCount = field.ColumnCount,
            RowCount = field.RowCount,
            Cells = field.Cells.Select(cell => used.Contains(cell.Index) && cell.Traversable
                ? cell with { BaseCost = Math.Max(0.05, cell.BaseCost * (1 - discount)) }
                : cell).ToList()
        };
    }

    private static CirculationResult Merge(
        IReadOnlyList<RoutedRequest> routed,
        IReadOnlyList<CirculationDemandAssignment> preflightAssignments,
        CirculationInput input,
        AccessPointGenerationResult access,
        string? hubId)
    {
        var nodesByKey = new Dictionary<string, CirculationNode>(StringComparer.Ordinal);
        var edgesByKey = new Dictionary<string, CirculationEdge>(StringComparer.Ordinal);
        var forcedPrimaryEdges = new HashSet<string>(StringComparer.Ordinal);
        var assignments = new List<CirculationDemandAssignment>(preflightAssignments);

        foreach (var routedRequest in routed)
        {
            var request = routedRequest.Request;
            var path = routedRequest.Path;
            var edgeIds = new List<string>();
            if (path.Found)
            {
                for (var index = 0; index < path.Points.Count - 1; index++)
                {
                    var a = path.Points[index];
                    var b = path.Points[index + 1];
                    if (PolygonMath.Distance(a, b) <= 1e-9) continue;
                    var startNode = Node(nodesByKey, a, request, index == 0, access);
                    var endNode = Node(nodesByKey, b, request, index == path.Points.Count - 2, access);
                    var edgeKey = EdgeKey(startNode.Id, endNode.Id, request.Network);
                    if (!edgesByKey.TryGetValue(edgeKey, out var edge))
                    {
                        edge = new CirculationEdge
                        {
                            Id = StableId("edge", edgeKey),
                            StartNodeId = startNode.Id,
                            EndNodeId = endNode.Id,
                            Centerline = [a, b],
                            Network = request.Network,
                            LengthM = PolygonMath.Distance(a, b),
                            Accessible = request.Accessible
                        };
                        edgesByKey[edgeKey] = edge;
                    }
                    edge.TotalFlow += request.Weight;
                    edge.ReusedRouteCount++;
                    edge.Accessible |= request.Accessible;
                    foreach (var journeyId in request.JourneyIds)
                        if (!edge.JourneyIds.Contains(journeyId)) edge.JourneyIds.Add(journeyId);
                    if (!edge.MovementDemandIds.Contains(request.Id)) edge.MovementDemandIds.Add(request.Id);
                    if (request.ForcePrimary && request.Network == "public") forcedPrimaryEdges.Add(edge.Id);
                    edgeIds.Add(edge.Id);
                }
            }
            assignments.Add(new()
            {
                Id = request.Id,
                OriginId = request.OriginId,
                DestinationId = request.DestinationId,
                Weight = request.Weight,
                Network = request.Network,
                Found = path.Found,
                AccumulatedCost = path.AccumulatedCost,
                JourneyIds = request.JourneyIds.ToList(),
                EdgeIds = edgeIds.Distinct(StringComparer.Ordinal).ToList()
            });
        }

        Classify(edgesByKey.Values.ToList(), forcedPrimaryEdges, input.HierarchySettings);
        var disconnected = assignments.Where(assignment => !assignment.Found)
            .SelectMany(assignment => new[] { assignment.OriginId, assignment.DestinationId })
            .Where(id => input.Spaces.Any(space => space.ProgramId == id)
                || input.PointDestinations.Any(destination => destination.ProgramId == id))
            .Distinct(StringComparer.Ordinal).OrderBy(id => id, StringComparer.Ordinal).ToList();
        return new CirculationResult
        {
            AccessPoints = access.Candidates,
            Nodes = nodesByKey.Values.OrderBy(node => node.Id, StringComparer.Ordinal).ToList(),
            Edges = edgesByKey.Values.OrderBy(edge => edge.Id, StringComparer.Ordinal).ToList(),
            OdAssignments = assignments,
            HubProgramId = hubId,
            Audit = new CirculationAudit { DisconnectedProgramIds = disconnected }
        };
    }

    private static void Classify(
        IReadOnlyList<CirculationEdge> edges,
        IReadOnlySet<string> forcedPrimary,
        CirculationHierarchySettings settings)
    {
        var publicEdges = edges.Where(edge => edge.Network == "public").ToList();
        var flows = publicEdges.Select(edge => edge.TotalFlow).OrderBy(value => value).ToList();
        var primaryThreshold = Percentile(flows, settings.PrimaryFlowPercentile);
        var secondaryThreshold = Percentile(flows, settings.SecondaryFlowPercentile);
        foreach (var edge in edges)
        {
            if (edge.Network == "service")
            {
                edge.Hierarchy = "service";
                edge.WidthM = settings.ServiceWidthM;
            }
            else if (forcedPrimary.Contains(edge.Id) || edge.TotalFlow >= primaryThreshold)
            {
                edge.Hierarchy = "primary";
                edge.WidthM = settings.PrimaryWidthM;
            }
            else if (edge.TotalFlow >= secondaryThreshold)
            {
                edge.Hierarchy = "secondary";
                edge.WidthM = settings.SecondaryWidthM;
            }
            else
            {
                edge.Hierarchy = "tertiary";
                edge.WidthM = settings.TertiaryWidthM;
            }
        }
    }

    private static double Percentile(IReadOnlyList<double> sorted, double percentile)
    {
        if (sorted.Count == 0) return double.PositiveInfinity;
        var index = (int)Math.Ceiling(Math.Clamp(percentile, 0, 1) * (sorted.Count - 1));
        return sorted[index];
    }

    private static CirculationNode Node(
        IDictionary<string, CirculationNode> nodes,
        Point2 point,
        RouteRequest request,
        bool endpoint,
        AccessPointGenerationResult access)
    {
        var key = PointKey(point);
        if (nodes.TryGetValue(key, out var existing)) return existing;
        var matchingAccess = access.Selected.FirstOrDefault(candidate => PolygonMath.Distance(candidate.Point, point) <= 0.001);
        var endpointId = endpoint
            ? (PolygonMath.Distance(point, request.Origin) <= 0.001 ? request.OriginId : request.DestinationId)
            : null;
        var nodeType = matchingAccess is not null ? "program_access"
            : endpointId is not null ? "entrance"
            : "routing";
        var node = new CirculationNode(
            StableId("node", key),
            point,
            nodeType,
            matchingAccess?.ProgramId,
            matchingAccess?.Id);
        nodes[key] = node;
        return node;
    }

    private static bool TryEndpoint(
        string id,
        IReadOnlyDictionary<string, List<ProgramAccessPoint>> accessByProgram,
        IReadOnlyDictionary<string, CirculationDestination> destinationById,
        IReadOnlyDictionary<string, SiteEntrance> entranceById,
        string accessType,
        out Point2 point,
        out bool accessible)
    {
        if (entranceById.TryGetValue(id, out var entrance)
            && (accessType == "service" ? entrance.Type == SiteEntranceType.Service : entrance.Type != SiteEntranceType.Service))
        {
            point = entrance.Point;
            accessible = entrance.Accessible;
            return true;
        }
        if (destinationById.TryGetValue(id, out var destination)
            && (accessType == "service" ? destination.RequiresService : destination.PublicAccess))
        {
            point = destination.Point;
            accessible = destination.Accessible;
            return true;
        }
        if (accessByProgram.TryGetValue(id, out var accessPoints))
        {
            var accessPoint = accessPoints.FirstOrDefault(candidate => candidate.AccessType == accessType)
                ?? accessPoints[0];
            point = accessPoint.Point;
            accessible = accessPoint.Accessible;
            return true;
        }
        point = default;
        accessible = false;
        return false;
    }

    private static string? ResolveHub(CirculationInput input, IEnumerable<string> accessibleProgramIds)
    {
        var available = accessibleProgramIds.ToHashSet(StringComparer.Ordinal);
        if (input.DesignerHubProgramId is not null && available.Contains(input.DesignerHubProgramId))
            return input.DesignerHubProgramId;
        return input.MovementDemands
            .SelectMany(demand => new[]
            {
                (Id: demand.Origin, Weight: Math.Max(0, demand.Weight)),
                (Id: demand.Destination, Weight: Math.Max(0, demand.Weight))
            })
            .Where(item => available.Contains(item.Id))
            .GroupBy(item => item.Id, StringComparer.Ordinal)
            .Select(group => (Id: group.Key, Weight: group.Sum(item => item.Weight)))
            .OrderByDescending(item => item.Weight)
            .ThenBy(item => item.Id, StringComparer.Ordinal)
            .Select(item => item.Id)
            .FirstOrDefault()
            ?? available.OrderBy(id => id, StringComparer.Ordinal).FirstOrDefault();
    }

    private static string DemandId(string origin, string destination, IReadOnlyList<string> journeyIds) =>
        StableId("demand", $"{origin}|{destination}|{string.Join(",", journeyIds.OrderBy(id => id, StringComparer.Ordinal))}");

    private static string PointKey(Point2 point) =>
        $"{Math.Round(point.X, 3).ToString("0.000", CultureInfo.InvariantCulture)},{Math.Round(point.Y, 3).ToString("0.000", CultureInfo.InvariantCulture)}";

    private static string EdgeKey(string a, string b, string network) =>
        string.CompareOrdinal(a, b) <= 0 ? $"{network}|{a}|{b}" : $"{network}|{b}|{a}";

    private static string StableId(string prefix, string payload)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return $"{prefix}-{Convert.ToHexString(digest)[..12].ToLowerInvariant()}";
    }
}
