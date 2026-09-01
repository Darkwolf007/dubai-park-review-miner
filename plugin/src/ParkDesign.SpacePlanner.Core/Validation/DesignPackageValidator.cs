using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Validation;

public sealed record ValidationMessage(string Code, string Message, bool IsError);

public static class DesignPackageValidator
{
    public static IReadOnlyList<ValidationMessage> Validate(DesignPackage package)
    {
        var messages = new List<ValidationMessage>();

        if (!IsUtmZone40N(package.CoordinateSystem.Crs))
            messages.Add(new("CRS_UNSUPPORTED", $"Expected EPSG:32640 but received {package.CoordinateSystem.Crs}.", true));
        if (!string.Equals(package.CoordinateSystem.Units, "meters", StringComparison.OrdinalIgnoreCase))
            messages.Add(new("UNITS_UNSUPPORTED", $"Expected meters but received {package.CoordinateSystem.Units}.", true));
        if (package.Programs.Count == 0)
            messages.Add(new("PROGRAMS_EMPTY", "The package contains no programs.", true));

        foreach (var duplicate in package.Programs.GroupBy(program => program.Id).Where(group => string.IsNullOrWhiteSpace(group.Key) || group.Count() > 1))
            messages.Add(new("PROGRAM_ID_INVALID", $"Program id '{duplicate.Key}' is blank or duplicated.", true));

        var unresolved = package.Programs.Where(program => program.Selected && program.TargetAreaM2 is null or <= 0).ToList();
        var landscapeOverlays = unresolved.Where(program => program.RepresentationStatus == "landscape_overlay_intent").ToList();
        var areaIntents = unresolved.Where(program => program.RepresentationStatus != "landscape_overlay_intent").ToList();
        if (landscapeOverlays.Count > 0)
            messages.Add(new("PROGRAM_COVERAGE_UNRESOLVED",
                $"{landscapeOverlays.Count} mandatory landscape systems are represented as overlay intent anchors until coverage targets are approved: {string.Join(", ", landscapeOverlays.Select(program => program.Name))}.", false));
        if (areaIntents.Count > 0)
            messages.Add(new("PROGRAM_AREA_UNRESOLVED",
                $"{areaIntents.Count} mandatory programs are represented as area intent anchors until designer-approved extents are supplied: {string.Join(", ", areaIntents.Select(program => program.Name))}.", false));

        if (package.AdaptedFromLegacyManifest)
            messages.Add(new("LEGACY_MANIFEST", "Loaded the current compact Results manifest. It has no grid fields or accepted relationship graph.", false));
        if (package.Grid.Cells.Count == 0)
            messages.Add(new("GRID_EMPTY", "No suitability grid is present; placement uses boundary geometry and location-zone intent only.", false));
        if (package.Relationships.Count == 0)
            messages.Add(new("RELATIONSHIPS_EMPTY", "No accepted relationships are present; adjacency forces are disabled.", false));

        return messages;
    }

    private static bool IsUtmZone40N(string? crs)
    {
        if (string.IsNullOrWhiteSpace(crs)) return false;
        var normalized = crs
            .ToUpperInvariant()
            .Replace(" ", string.Empty)
            .Replace("_", string.Empty)
            .Replace("-", string.Empty);
        return normalized.Contains("EPSG:32640", StringComparison.Ordinal)
            || normalized.Contains("UTMZONE40N", StringComparison.Ordinal)
            || normalized == "32640";
    }
}
