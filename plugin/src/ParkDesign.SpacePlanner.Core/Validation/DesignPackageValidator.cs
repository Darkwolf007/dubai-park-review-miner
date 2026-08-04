using ParkDesign.SpacePlanner.Core.Models;

namespace ParkDesign.SpacePlanner.Core.Validation;

public sealed record ValidationMessage(string Code, string Message, bool IsError);

public static class DesignPackageValidator
{
    public static IReadOnlyList<ValidationMessage> Validate(DesignPackage package)
    {
        var messages = new List<ValidationMessage>();

        if (!string.Equals(package.CoordinateSystem.Crs, "EPSG:32640", StringComparison.OrdinalIgnoreCase))
            messages.Add(new("CRS_UNSUPPORTED", $"Expected EPSG:32640 but received {package.CoordinateSystem.Crs}.", true));
        if (!string.Equals(package.CoordinateSystem.Units, "meters", StringComparison.OrdinalIgnoreCase))
            messages.Add(new("UNITS_UNSUPPORTED", $"Expected meters but received {package.CoordinateSystem.Units}.", true));
        if (package.Programs.Count == 0)
            messages.Add(new("PROGRAMS_EMPTY", "The package contains no programs.", true));

        foreach (var duplicate in package.Programs.GroupBy(program => program.Id).Where(group => string.IsNullOrWhiteSpace(group.Key) || group.Count() > 1))
            messages.Add(new("PROGRAM_ID_INVALID", $"Program id '{duplicate.Key}' is blank or duplicated.", true));

        foreach (var program in package.Programs.Where(program => program.Selected))
        {
            if (program.TargetAreaM2 is null or <= 0)
                messages.Add(new("PROGRAM_AREA_UNRESOLVED", $"{program.Name} has no positive approved target area and will not be placed.", false));
        }

        if (package.AdaptedFromLegacyManifest)
            messages.Add(new("LEGACY_MANIFEST", "Loaded the current compact Results manifest. It has no grid fields or accepted relationship graph.", false));
        if (package.Grid.Cells.Count == 0)
            messages.Add(new("GRID_EMPTY", "No suitability grid is present; placement uses boundary geometry and location-zone intent only.", false));
        if (package.Relationships.Count == 0)
            messages.Add(new("RELATIONSHIPS_EMPTY", "No accepted relationships are present; adjacency forces are disabled.", false));

        return messages;
    }
}
