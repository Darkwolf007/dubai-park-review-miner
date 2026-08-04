# ParkDesignPackage v1

The plugin accepts the existing compact Results manifest through a compatibility adapter. The next web-exporter revision should emit this unified package directly.

Required top-level fields:

- `schema_version`
- `project.site_name`
- `coordinate_system.crs` (`EPSG:32640`)
- `coordinate_system.units` (`meters`)
- `programs`

Planned full-package fields:

- `grid.cells`: georeferenced analysis cells and named suitability scores
- `relationships`: individually accepted graph edges only
- `site`: source boundary, exclusions, entrances and existing assets
- `unresolved`: assumptions and rules excluded from computation

Program target areas must carry an explicit status. An unresolved program area is not placed. Candidate rules, chatbot prose and unaccepted graph edges must never enter the package as constraints.
