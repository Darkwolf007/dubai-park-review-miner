using ParkDesign.SpacePlanner.Core.Geometry;
using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

public sealed record AreaSolverWeights(double Suitability, double Overlap, double Boundary, double Preferred,
    double Avoid, double Accepted, double Area)
{
    public static AreaSolverWeights For(LayoutStrategy strategy) => strategy switch
    {
        LayoutStrategy.Suitability => new(4, 80, 30, .7, .7, 30, 1),
        LayoutStrategy.Connectivity => new(1, 80, 30, 4, 2, 30, 1),
        _ => new(2, 80, 30, 2, 1.5, 30, 1)
    };
}

public sealed record AreaSolverOptions(int MaximumIterations = 360, double ConvergenceTolerance = .01,
    double Damping = .65, double MaximumMovementPerIteration = 3, double NumericalGradientStep = .5);

/// <summary>Deterministic centre relaxation in EPSG:32640 metres; bubbles remain debugging geometry.</summary>
public static class AreaRelaxationSolver
{
    public static AreaSolverResult Solve(IReadOnlyList<Point2> boundary, IEnumerable<ProgramDefinition> programs,
        IReadOnlyList<BubblePlacement> initial, GridDefinition grid, SpatialRelationshipGraph graph,
        LayoutStrategy strategy, AreaSolverOptions? options = null)
    {
        options ??= new(); var weights = AreaSolverWeights.For(strategy);
        var programMap = programs.ToDictionary(p => p.Id, StringComparer.Ordinal);
        var agents = initial.Where(p => programMap.TryGetValue(p.ProgramId, out var definition) && definition.AreaStatus != "unresolved")
            .Select(p => { var d = programMap[p.ProgramId]; return new AreaAgent(p.ProgramId, p.ProgramName, p.Center, p.TargetAreaM2,
                d.MinimumAreaM2, d.MaximumAreaM2, p.TargetAreaM2, p.Radius, d.Priority, d.Selected, d.SuitabilityField,
                SpatialMode: d.SpatialMode); }).ToList();
        var original = agents.ToDictionary(a => a.ProgramId, a => a.Position, StringComparer.Ordinal);
        var converged = false; var iterations = 0;
        for (; iterations < options.MaximumIterations; iterations++)
        {
            var maxMove = 0d; var next = new List<AreaAgent>(agents.Count);
            foreach (var agent in agents)
            {
                if (agent.ConstraintMode == AreaConstraintMode.Pinned) { next.Add(agent); continue; }
                var gradient = Gradient(agent, agents, boundary, grid, graph, weights, options.NumericalGradientStep);
                var magnitude = Math.Sqrt(gradient.X * gradient.X + gradient.Y * gradient.Y);
                var scale = magnitude <= 1e-12 ? 0 : Math.Min(options.MaximumMovementPerIteration, options.Damping * magnitude) / magnitude;
                var candidate = new Point2(agent.Position.X - gradient.X * scale, agent.Position.Y - gradient.Y * scale);
                candidate = KeepInside(candidate, agent.Radius, boundary, agent.Position);
                var movement = PolygonMath.Distance(candidate, agent.Position); maxMove = Math.Max(maxMove, movement);
                next.Add(agent with { Position = candidate });
            }
            agents = next;
            if (maxMove < options.ConvergenceTolerance) { converged = true; iterations++; break; }
        }
        agents = ProjectRequiredSeparations(agents, boundary, graph);
        var diagnostics = Diagnose(agents, original, boundary, grid, graph, weights, iterations, converged);
        return new() { Agents = agents, Diagnostics = diagnostics };
    }

    private static List<AreaAgent> ProjectRequiredSeparations(List<AreaAgent> source, IReadOnlyList<Point2> boundary,
        SpatialRelationshipGraph graph)
    {
        var agents = source.ToList();
        for (var iteration = 0; iteration < 240; iteration++)
        {
            var maximumCorrection = 0d;
            for (var i = 0; i < agents.Count; i++)
            for (var j = i + 1; j < agents.Count; j++)
            {
                var a = agents[i]; var b = agents[j];
                var required = RequiredSeparation(a, b, a.Radius + b.Radius, graph);
                var distance = PolygonMath.Distance(a.Position, b.Position);
                if (distance + .001 >= required) continue;

                var dx = b.Position.X - a.Position.X; var dy = b.Position.Y - a.Position.Y;
                if (distance <= 1e-9)
                {
                    var direction = StringComparer.Ordinal.Compare(a.ProgramId, b.ProgramId) <= 0 ? 1d : -1d;
                    dx = direction; dy = 0; distance = 1;
                }
                var correction = (required - distance) / 2 + .005;
                var ux = dx / distance; var uy = dy / distance;
                var movedA = KeepInside(new(a.Position.X - ux * correction, a.Position.Y - uy * correction), a.Radius, boundary, a.Position);
                var movedB = KeepInside(new(b.Position.X + ux * correction, b.Position.Y + uy * correction), b.Radius, boundary, b.Position);
                var appliedA = PolygonMath.Distance(a.Position, movedA);
                var appliedB = PolygonMath.Distance(b.Position, movedB);

                // If one bubble is boundary-blocked, give the remaining correction to the other.
                if (appliedA < correction * .25)
                    movedB = KeepInside(new(b.Position.X + ux * (2 * correction), b.Position.Y + uy * (2 * correction)), b.Radius, boundary, movedB);
                if (appliedB < correction * .25)
                    movedA = KeepInside(new(a.Position.X - ux * (2 * correction), a.Position.Y - uy * (2 * correction)), a.Radius, boundary, movedA);

                agents[i] = a with { Position = movedA };
                agents[j] = b with { Position = movedB };
                maximumCorrection = Math.Max(maximumCorrection, correction);
            }
            if (maximumCorrection < .001) break;
        }
        return agents;
    }

    private static Point2 Gradient(AreaAgent agent, List<AreaAgent> agents, IReadOnlyList<Point2> boundary, GridDefinition grid,
        SpatialRelationshipGraph graph, AreaSolverWeights weights, double h)
    {
        double At(Point2 p) { var changed = agents.Select(a => a.ProgramId == agent.ProgramId ? a with { Position = p } : a).ToList(); return Energy(changed, boundary, grid, graph, weights).Total; }
        return new((At(new(agent.Position.X + h, agent.Position.Y)) - At(new(agent.Position.X - h, agent.Position.Y))) / (2 * h),
            (At(new(agent.Position.X, agent.Position.Y + h)) - At(new(agent.Position.X, agent.Position.Y - h))) / (2 * h));
    }

    private static Point2 KeepInside(Point2 candidate, double radius, IReadOnlyList<Point2> boundary, Point2 fallback)
    {
        if (PolygonMath.Contains(boundary, candidate) && PolygonMath.DistanceToBoundary(boundary, candidate) + 1e-7 >= radius) return candidate;
        var low = 0d; var high = 1d;
        for (var i = 0; i < 32; i++) { var t = (low + high) / 2; var p = new Point2(fallback.X + (candidate.X - fallback.X) * t, fallback.Y + (candidate.Y - fallback.Y) * t); if (PolygonMath.Contains(boundary, p) && PolygonMath.DistanceToBoundary(boundary, p) + 1e-7 >= radius) low = t; else high = t; }
        return new(fallback.X + (candidate.X - fallback.X) * low, fallback.Y + (candidate.Y - fallback.Y) * low);
    }

    private static EnergyBreakdown Energy(List<AreaAgent> agents, IReadOnlyList<Point2> boundary, GridDefinition grid, SpatialRelationshipGraph graph, AreaSolverWeights w)
    {
        var suitability = agents.Sum(a => 1 - Suitability(a, grid)); var overlap = 0d; var boundaryPenalty = 0d; var preferred = 0d; var avoid = 0d; var accepted = 0d;
        foreach (var a in agents) { var clearance = PolygonMath.Contains(boundary, a.Position) ? PolygonMath.DistanceToBoundary(boundary, a.Position) : 0; boundaryPenalty += Math.Pow(Math.Max(0, a.Radius - clearance) / Math.Max(1, a.Radius), 2); }
        for (var i = 0; i < agents.Count; i++) for (var j = i + 1; j < agents.Count; j++) { var sum = agents[i].Radius + agents[j].Radius; var d = PolygonMath.Distance(agents[i].Position, agents[j].Position); var required = RequiredSeparation(agents[i], agents[j], sum, graph); overlap += Math.Pow(Math.Max(0, required - d) / Math.Max(1, sum), 2); }
        var byId = agents.ToDictionary(a => a.ProgramId, StringComparer.Ordinal);
        foreach (var edge in graph.Edges) { if (!byId.TryGetValue(edge.SourceId, out var a) || !byId.TryGetValue(edge.TargetId, out var b)) continue; var d = PolygonMath.Distance(a.Position, b.Position); var contact = a.Radius + b.Radius + .01;
            var penalty = edge.RelationshipType == "avoid" ? Math.Max(0, contact * 1.5 - d) / Math.Max(1, contact * 1.5) : Math.Abs(d - contact) / Math.Max(1, contact);
            if (edge.Authority == RelationshipAuthority.Advisory) { if (edge.RelationshipType == "avoid") avoid += edge.Weight * penalty * penalty; else if (edge.RelationshipType == "preferred") preferred += edge.Weight * penalty * penalty; }
            else accepted += AcceptedPenalty(edge, d);
        }
        var total = w.Suitability * suitability + w.Overlap * overlap + w.Boundary * boundaryPenalty + w.Preferred * preferred + w.Avoid * avoid + w.Accepted * accepted;
        return new(total, suitability, overlap, boundaryPenalty, preferred, avoid, accepted, 0);
    }

    private static double AcceptedPenalty(SpatialRelationshipEdge edge, double distance)
    {
        if (edge.NumericConstraint is not null) { var p = edge.NumericConstraint.Parameter.ToLowerInvariant(); var v = edge.NumericConstraint.ValueMetres; if (p.Contains("maximum") || p.Contains("within")) return Math.Pow(Math.Max(0, distance - v) / Math.Max(1, v), 2); if (p.Contains("minimum") || p.Contains("separation")) return Math.Pow(Math.Max(0, v - distance) / Math.Max(1, v), 2); }
        return edge.RelationshipType == "avoid" ? 1 / Math.Max(1, distance) : 0;
    }

    private static double Suitability(AreaAgent agent, GridDefinition grid)
    {
        var best = double.PositiveInfinity; var score = 0d; string? bestId = null;
        foreach (var cell in grid.Cells)
        {
            var value = CellScore(cell, agent);
            if (!value.HasValue) continue;
            var distance = PolygonMath.Distance(agent.Position, new(cell.X, cell.Y));
            if (distance > best || (distance == best && bestId is not null && StringComparer.Ordinal.Compare(cell.Id, bestId) >= 0)) continue;
            best = distance; bestId = cell.Id; score = value.Value;
        }
        return score;
    }
    private static double? CellScore(GridCell cell, AreaAgent agent) { if (cell.Constraint || cell.ProgramConstraints.ContainsKey(agent.ProgramId)) return null; foreach (var key in new[] { agent.SuitabilityField, $"{agent.ProgramId}_suitability", $"{agent.ProgramId}_opportunity" }.Where(k => !string.IsNullOrWhiteSpace(k))) if (cell.Scores.TryGetValue(key!, out var value) && value.HasValue) return Math.Clamp(value.Value, 0, 1); return 0; }

    private static AreaSolverDiagnostics Diagnose(List<AreaAgent> agents, Dictionary<string, Point2> original, IReadOnlyList<Point2> boundary, GridDefinition grid, SpatialRelationshipGraph graph, AreaSolverWeights weights, int iterations, bool converged)
    {
        var energy = Energy(agents, boundary, grid, graph, weights); var byId = agents.ToDictionary(a => a.ProgramId, StringComparer.Ordinal); var hard = 0; var edgeDiagnostics = new List<EdgeSolverDiagnostic>(); var satisfiedSoft = 0; var softCount = 0;
        for (var i = 0; i < agents.Count; i++)
        {
            var a = agents[i];
            if (!double.IsFinite(a.Position.X) || !double.IsFinite(a.Position.Y) || !PolygonMath.Contains(boundary, a.Position) || PolygonMath.DistanceToBoundary(boundary, a.Position) + 1e-7 < a.Radius)
            {
                hard++;
                edgeDiagnostics.Add(new($"boundary:{a.ProgramId}", PolygonMath.DistanceToBoundary(boundary, a.Position), false, false, null));
            }
            for (var j = i + 1; j < agents.Count; j++)
            {
                var b = agents[j];
                var sum = a.Radius + b.Radius;
                var distance = PolygonMath.Distance(a.Position, b.Position);
                var passed = distance + 1e-7 >= RequiredSeparation(a, b, sum, graph);
                if (!passed)
                {
                    hard++;
                    edgeDiagnostics.Add(new($"overlap:{a.ProgramId}:{b.ProgramId}", distance, false, false, null));
                }
            }
        }
        foreach (var edge in graph.Edges) { if (!byId.TryGetValue(edge.SourceId, out var a) || !byId.TryGetValue(edge.TargetId, out var b)) continue; var d = PolygonMath.Distance(a.Position, b.Position); bool? numericPassed = null; var passed = true; if (edge.NumericConstraint is not null) { var p = edge.NumericConstraint.Parameter.ToLowerInvariant(); numericPassed = p.Contains("maximum") || p.Contains("within") ? d <= edge.NumericConstraint.ValueMetres + 1e-7 : p.Contains("minimum") || p.Contains("separation") ? d + 1e-7 >= edge.NumericConstraint.ValueMetres : true; passed = numericPassed.Value; } else if (edge.RelationshipType == "avoid") passed = d + 1e-7 >= a.Radius + b.Radius; else if (edge.RelationshipType == "overlap_compatible") passed = d + 1e-7 >= RequiredSeparation(a, b, a.Radius + b.Radius, graph); if (edge.HardConstraint && !passed) hard++; if (edge.Authority == RelationshipAuthority.Advisory) { softCount++; if (passed) satisfiedSoft++; } edgeDiagnostics.Add(new(edge.Id, d, passed, edge.Authority != RelationshipAuthority.AcceptedRule || passed, numericPassed)); }
        var programs = agents.Select(a => new ProgramSolverDiagnostic(a.ProgramId, a.Position, Suitability(a, grid), PolygonMath.Distance(a.Position, original[a.ProgramId]), 0)).ToList();
        return new() { Energy = energy, IterationCount = iterations, Converged = converged, Valid = hard == 0, AverageSuitability = agents.Count == 0 ? 0 : programs.Average(p => p.Suitability), RelationshipSatisfactionRatio = softCount == 0 ? 1 : (double)satisfiedSoft / softCount, HardViolationCount = hard, Programs = programs, Edges = edgeDiagnostics };
    }

    private static double RequiredSeparation(AreaAgent a, AreaAgent b, double combinedRadius, SpatialRelationshipGraph graph)
    {
        var explicitCompatibility = graph.Edges
            .Where(edge => edge.RelationshipType == "overlap_compatible"
                && ((edge.SourceId == a.ProgramId && edge.TargetId == b.ProgramId) || (edge.SourceId == b.ProgramId && edge.TargetId == a.ProgramId)))
            .Select(edge => Math.Clamp(edge.CompatibilityScore ?? 0, 0, 1))
            .DefaultIfEmpty(-1)
            .Max();
        var compatibility = explicitCompatibility >= 0 ? explicitCompatibility
            : a.SpatialMode == "shared" || b.SpatialMode == "shared" ? .5 : 0;
        return combinedRadius * (1 - compatibility);
    }
}
