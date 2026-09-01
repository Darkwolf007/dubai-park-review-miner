using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Algorithms;

/// <summary>Compiles exported evidence into a deterministic graph. Advisory weights are design heuristics, not standards.</summary>
public static class SpatialRelationshipCompiler
{
    private static readonly Dictionary<string, double> BaseStrength = new(StringComparer.OrdinalIgnoreCase)
    { ["preferred"] = 0.75, ["avoid"] = 0.75, ["service"] = 0.65, ["movement"] = 0.65, ["visibility"] = 0.55, ["overlap_compatible"] = 1 };

    public static SpatialRelationshipCompilationResult Compile(DesignPackage package)
    {
        var programs = package.Programs.Concat(package.NodePrograms).Concat(package.RoutePrograms)
            .GroupBy(p => p.Id, StringComparer.Ordinal).Select(g => g.First()).OrderBy(p => p.Id, StringComparer.Ordinal).ToList();
        var nodes = programs.Select(p => new SpatialRelationshipNode(p.Id, p.Name, p.GeometryType,
            Role(p.GeometryType), Math.Clamp(p.Priority, 0, 1), p.Selected, p.Category)).ToList();
        var known = nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
        var warnings = new List<string>();
        var valid = package.Relationships.Where(r =>
        {
            var ok = known.Contains(r.Source) && known.Contains(r.Target);
            if (!ok) warnings.Add($"Relationship '{r.Id}' references unknown program '{(!known.Contains(r.Source) ? r.Source : r.Target)}'.");
            return ok;
        }).ToList();

        var normalized = valid.GroupBy(CanonicalKey, StringComparer.Ordinal).Select(group => BuildEdge(group.ToList(), programs)).ToList();
        var conflicts = new List<ConflictRecord>();
        foreach (var advisory in normalized.Where(e => e.Authority == RelationshipAuthority.Advisory).ToList())
        {
            var accepted = normalized.FirstOrDefault(e => e.Authority == RelationshipAuthority.AcceptedRule && SamePair(e, advisory) && Opposes(e.RelationshipType, advisory.RelationshipType));
            if (accepted is null) continue;
            conflicts.Add(new(advisory.SourceId, advisory.TargetId, advisory.RelationshipType, accepted.RelationshipType,
                "accepted_rule_precedence", "Designer-approved evidence takes precedence; advisory edge is retained only in conflict provenance."));
            normalized.Remove(advisory);
        }
        normalized = normalized.OrderBy(e => e.SourceId, StringComparer.Ordinal).ThenBy(e => e.TargetId, StringComparer.Ordinal).ThenBy(e => e.RelationshipType, StringComparer.Ordinal).ToList();
        var stats = new SpatialRelationshipStatistics { NodeCount = nodes.Count, EdgeCount = normalized.Count,
            AcceptedEdgeCount = normalized.Count(e => e.Authority == RelationshipAuthority.AcceptedRule), DesignerApprovedEdgeCount = normalized.Count(e => e.Authority == RelationshipAuthority.DesignerApproved), AdvisoryEdgeCount = normalized.Count(e => e.Authority == RelationshipAuthority.Advisory),
            PreferredPairs = normalized.Count(e => e.RelationshipType == "preferred"), AvoidPairs = normalized.Count(e => e.RelationshipType == "avoid"),
            OverlapPairs = normalized.Count(e => e.RelationshipType == "overlap_compatible"),
            MandatoryConstraints = normalized.Count(e => e.Mandatory), NumericConstraints = normalized.Count(e => e.NumericConstraint is not null), UnresolvedReferences = warnings.Count };
        return new() { Graph = new() { Nodes = nodes, Edges = normalized }, Conflicts = conflicts, Warnings = warnings, Statistics = stats };
    }

    private static SpatialRelationshipEdge BuildEdge(List<RelationshipDefinition> records, List<ProgramDefinition> programs)
    {
        var r = records.OrderBy(x => x.Id, StringComparer.Ordinal).First();
        var acceptedRule = records.Any(x => x.Authority.Equals("accepted_rule", StringComparison.OrdinalIgnoreCase));
        var designerApproved = !acceptedRule && records.Any(x => x.Accepted || x.Authority.Contains("designer_approved", StringComparison.OrdinalIgnoreCase));
        var accepted = acceptedRule || designerApproved;
        var type = NormalizeType(r.Type);
        var symmetric = type is "preferred" or "avoid" or "overlap_compatible";
        var source = symmetric && string.CompareOrdinal(r.Source, r.Target) > 0 ? r.Target : r.Source;
        var target = symmetric && string.CompareOrdinal(r.Source, r.Target) > 0 ? r.Source : r.Target;
        var sourcePriority = Math.Clamp(programs.First(p => p.Id == source).Priority, 0, 1);
        var targetPriority = Math.Clamp(programs.First(p => p.Id == target).Priority, 0, 1);
        var confidence = Math.Clamp(records.Where(x => x.Confidence.HasValue).Select(x => x.Confidence!.Value).DefaultIfEmpty(.5).Average(), 0, 1);
        var basis = BaseStrength.GetValueOrDefault(type, .5);
        var targetAdjustment = .5 + .5 * targetPriority;
        var confidenceAdjustment = .5 + .5 * confidence;
        var weight = accepted ? 1 : Math.Clamp(basis * sourcePriority * targetAdjustment * confidenceAdjustment, 0, 1);
        var compatibilityValues = records.Where(x => x.CompatibilityScore.HasValue).Select(x => x.CompatibilityScore!.Value).ToList();
        double? compatibility = compatibilityValues.Count == 0 ? null : Math.Clamp(compatibilityValues.Average(), 0, 1);
        var numeric = accepted && r.NumericValue is >= 0 && IsMetres(r.NumericUnit) && !string.IsNullOrWhiteSpace(r.NumericParameter)
            ? new NumericSpatialConstraint(r.NumericParameter!, r.NumericValue.Value) : null;
        return new() { Id = r.Id, SourceId = source, TargetId = target, RelationshipType = type,
            Authority = acceptedRule ? RelationshipAuthority.AcceptedRule : designerApproved ? RelationshipAuthority.DesignerApproved : RelationshipAuthority.Advisory,
            Mandatory = accepted && records.Any(x => x.Mandatory), HardConstraint = accepted && records.Any(x => x.Mandatory), Directed = !symmetric && r.Directed,
            Weight = weight, NumericConstraint = numeric, Confidence = r.Confidence,
            CompatibilityScore = compatibility,
            OverlapMode = records.Select(x => x.OverlapMode).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)),
            WeightComponents = accepted ? null : new(basis, sourcePriority, targetAdjustment, confidenceAdjustment, weight),
            Provenance = records.Select(x => x.SourceProvenance ?? x.Id).Distinct(StringComparer.Ordinal).ToList() };
    }

    private static string CanonicalKey(RelationshipDefinition r)
    {
        var type = NormalizeType(r.Type); var symmetric = type is "preferred" or "avoid" or "overlap_compatible";
        var a = symmetric && string.CompareOrdinal(r.Source, r.Target) > 0 ? r.Target : r.Source;
        var b = symmetric && string.CompareOrdinal(r.Source, r.Target) > 0 ? r.Source : r.Target;
        var authority = r.Authority.Equals("accepted_rule", StringComparison.OrdinalIgnoreCase) ? "accepted_rule" : r.Accepted || r.Authority.Contains("designer_approved", StringComparison.OrdinalIgnoreCase) ? "designer_approved" : "advisory";
        return $"{authority}|{a}|{b}|{type}|{(symmetric ? false : r.Directed)}";
    }
    private static string NormalizeType(string value) { var t = value.ToLowerInvariant(); if (t.Contains("overlap")) return "overlap_compatible"; if (t.Contains("avoid") || t.Contains("separat") || t.Contains("buffer")) return "avoid"; if (t.Contains("prefer") || t.Contains("adjacent") || t.Contains("near")) return "preferred"; if (t.Contains("service")) return "service"; if (t.Contains("movement") || t.Contains("connect")) return "movement"; if (t.Contains("visibility") || t.Contains("sight")) return "visibility"; if (t.Contains("distance")) return "distance"; return t.Trim(); }
    private static bool Opposes(string a, string b) => (a == "avoid" && b == "preferred") || (a == "preferred" && b == "avoid");
    private static bool SamePair(SpatialRelationshipEdge a, SpatialRelationshipEdge b) => (a.SourceId == b.SourceId && a.TargetId == b.TargetId) || (!a.Directed && !b.Directed && a.SourceId == b.TargetId && a.TargetId == b.SourceId);
    private static GeometryRole Role(string type) => type.ToLowerInvariant() switch { "area" => GeometryRole.Area, "point" or "node" => GeometryRole.Node, "linear" or "route" => GeometryRole.Route, _ => GeometryRole.System };
    private static bool IsMetres(string? unit) => unit?.Trim().ToLowerInvariant() is "m" or "meter" or "meters" or "metre" or "metres";
}
