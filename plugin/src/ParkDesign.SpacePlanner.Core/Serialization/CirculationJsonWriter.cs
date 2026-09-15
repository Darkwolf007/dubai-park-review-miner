using System.Text.Json;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Serialization;

public static class CirculationJsonWriter
{
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public static string SerializeAccessPoints(AccessPointGenerationResult result)
    {
        return JsonSerializer.Serialize(new
        {
            schema_version = "1.0.0",
            access_points = result.Candidates.Select(point => new
            {
                id = point.Id,
                program_id = point.ProgramId,
                position = new { x = point.Point.X, y = point.Point.Y },
                approach_vector = new { x = point.ApproachVector.X, y = point.ApproachVector.Y },
                source = point.Source,
                access_type = point.AccessType,
                score = point.Score,
                selected = point.Selected,
                accessible = point.Accessible,
                allows_service = point.AllowsService
            }),
            warnings = result.Warnings
        }, Options);
    }

    public static string SerializeResult(CirculationResult result)
    {
        return JsonSerializer.Serialize(new
        {
            schema_version = result.SchemaVersion,
            hub_program_id = result.HubProgramId,
            access_points = result.AccessPoints.Select(point => new
            {
                id = point.Id,
                program_id = point.ProgramId,
                position = new { x = point.Point.X, y = point.Point.Y },
                source = point.Source,
                access_type = point.AccessType,
                selected = point.Selected,
                accessible = point.Accessible,
                allows_service = point.AllowsService
            }),
            nodes = result.Nodes.Select(node => new
            {
                id = node.Id,
                position = new { x = node.Point.X, y = node.Point.Y },
                node_type = node.NodeType,
                program_id = node.ProgramId,
                access_point_id = node.AccessPointId
            }),
            edges = result.Edges.Select(edge => new
            {
                id = edge.Id,
                start_node_id = edge.StartNodeId,
                end_node_id = edge.EndNodeId,
                centerline = edge.Centerline.Select(point => new[] { point.X, point.Y }),
                network = edge.Network,
                hierarchy = edge.Hierarchy,
                length_m = edge.LengthM,
                width_m = edge.WidthM,
                total_flow = edge.TotalFlow,
                accessible = edge.Accessible,
                reused_route_count = edge.ReusedRouteCount,
                environmental_costs = edge.EnvironmentalCosts,
                journey_ids = edge.JourneyIds,
                movement_demand_ids = edge.MovementDemandIds,
                lands_design = new
                {
                    target_class = "path",
                    stable_object_key = edge.Id,
                    layer = $"PARK_DESIGN_GIS::Movement::{edge.Network}::{edge.Hierarchy}",
                    surface_code = (string?)null,
                    material_code = (string?)null
                }
            }),
            od_assignments = result.OdAssignments.Select(assignment => new
            {
                id = assignment.Id,
                origin_id = assignment.OriginId,
                destination_id = assignment.DestinationId,
                weight = assignment.Weight,
                network = assignment.Network,
                found = assignment.Found,
                accumulated_cost = double.IsFinite(assignment.AccumulatedCost) ? assignment.AccumulatedCost : (double?)null,
                journey_ids = assignment.JourneyIds,
                edge_ids = assignment.EdgeIds
            }),
            display_paths = result.DisplayPaths.Select(path => new
            {
                id = path.Source.Id,
                network = path.Source.Network,
                hierarchy = path.Source.Hierarchy,
                width_m = path.Source.WidthM,
                maximum_flow = path.Source.MaximumFlow,
                refinement_status = path.Status,
                raw_point_count = path.RawPointCount,
                refined_point_count = path.RefinedPointCount,
                centerline = path.Points.Select(point => new[] { point.X, point.Y }),
                edge_ids = path.Source.EdgeIds,
                lands_design = new
                {
                    target_class = "path",
                    stable_object_key = path.Source.Id,
                    layer = $"PARK_DESIGN_GIS::Movement::{path.Source.Network}::{path.Source.Hierarchy}"
                }
            }),
            audit = new
            {
                valid = result.Audit.IsValid,
                disconnected_program_ids = result.Audit.DisconnectedProgramIds,
                blocked_access_point_ids = result.Audit.BlockedAccessPointIds,
                hard_barrier_intersection_edge_ids = result.Audit.HardBarrierIntersectionEdgeIds,
                excessive_detour_demand_ids = result.Audit.ExcessiveDetourDemandIds,
                warnings = result.Audit.Warnings
            }
        }, Options);
    }
}
