"""Upgrade the checked-in Al Safa 2 sample package to the governed v1.2 contract."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "dataset" / "al_safa_2_park_design_package"

OVERLAPS = [
    ("flexibleEventLawn", "multipurposeLawn", 0.95, "temporal_shared_footprint", "The same open turf supports daily recreation and scheduled events."),
    ("flexibleRecreation", "multipurposeLawn", 0.80, "temporal_shared_footprint", "Flexible recreation can occupy the multipurpose lawn outside programmed events."),
    ("flexibleRecreation", "flexibleEventLawn", 0.65, "temporal_shared_footprint", "Event and recreation demand occur at different times."),
    ("smallEventZone", "communityPlaza", 0.75, "baraha_shared_footprint", "Small gatherings can occupy a defined part of the community baraha."),
    ("picnicArea", "treePlanting", 0.95, "landscape_overlay", "Picnic occupation depends on canopy rather than a separate unplanted parcel."),
    ("picnicArea", "nativePlanting", 0.75, "landscape_overlay", "Native planting can form picnic-pocket enclosure."),
    ("quietGarden", "sensoryGarden", 0.70, "distributed_pockets", "Sensory pockets can form part of a larger quiet garden."),
    ("sensoryGarden", "nativePlanting", 0.85, "landscape_overlay", "The sensory garden is implemented through climate-adapted planting."),
    ("naturePlay", "nativePlanting", 0.90, "landscape_overlay", "Nature play and native planting share terrain and vegetation."),
    ("naturePlay", "biodiversityHabitat", 0.75, "landscape_overlay", "Controlled nature play can overlap robust habitat edges."),
    ("wellnessZone", "treePlanting", 0.70, "landscape_overlay", "Wellness stations require shaded planted pockets."),
    ("outdoorFitness", "treePlanting", 0.55, "edge_canopy", "Tree canopy may overlap fitness edges while preserving equipment clearances."),
    ("inclusivePlayground", "treePlanting", 0.55, "edge_canopy", "Canopy overlaps play edges subject to root and safety review."),
    ("toddlerPlay", "treePlanting", 0.60, "edge_canopy", "Toddler play requires strong shade with supervised clear zones."),
    ("olderChildrenPlay", "treePlanting", 0.55, "edge_canopy", "Canopy overlaps play edges subject to activity clearances."),
    ("communityPlaza", "treePlanting", 0.45, "edge_canopy", "The civic clearing retains a partially planted shaded edge."),
    ("bioswale", "nativePlanting", 0.90, "landscape_overlay", "The bioswale is a planted water-sensitive system."),
    ("bioswale", "biodiversityHabitat", 0.90, "landscape_overlay", "Water-sensitive corridors contribute to habitat connectivity."),
    ("treePlanting", "nativePlanting", 1.00, "landscape_overlay", "Native planting and canopy systems are nested landscape layers."),
    ("biodiversityHabitat", "nativePlanting", 0.95, "landscape_overlay", "Habitat is implemented through native planting communities."),
    ("mainEntrancePlaza", "treePlanting", 0.35, "edge_canopy", "Gateway canopy shades plaza edges while retaining arrival visibility."),
]

OVERLAY_IDS = {"biodiversityHabitat", "nativePlanting", "treePlanting", "bioswale"}
SHARED_IDS = {"flexibleEventLawn", "multipurposeLawn", "flexibleRecreation", "smallEventZone", "sensoryGarden", "picnicArea", "naturePlay", "wellnessZone"}


def load(name: str):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def save(name: str, value):
    (PACKAGE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def spatial_mode(program_id: str) -> str:
    if program_id in OVERLAY_IDS:
        return "overlay"
    if program_id in SHARED_IDS:
        return "shared"
    return "exclusive"


def upgrade_program_file(name: str):
    doc = load(name)
    doc["schema_version"] = "1.2.0"
    for program in doc.get("programs", []):
        program["synthesis_selected"] = bool(program.get("selected"))
        program["selected"] = True
        program["mandatory"] = True
        program["decision_authority"] = "competition_scope_and_designer_confirmation"
        program["spatial_mode"] = spatial_mode(program["id"])
        program["fragmentation_policy"] = (
            "may_fragment_and_overlap" if program["spatial_mode"] == "overlay"
            else "may_split_or_share_compatible_territory" if program["spatial_mode"] == "shared"
            else "single_primary_territory"
        )
        if name == "area_programs.json":
            quantified = isinstance(program.get("target_area_m2"), (int, float)) and program["target_area_m2"] > 0
            program["representation_status"] = (
                "quantified_area" if quantified
                else "landscape_overlay_intent" if program["spatial_mode"] == "overlay"
                else "area_intent_anchor"
            )
            program["placement_status"] = (
                "place_as_area_territory" if quantified
                else "represent_as_overlapping_landscape_system" if program["spatial_mode"] == "overlay"
                else "represent_as_ranked_intent_anchor"
            )
            if not quantified:
                program["area_status"] = "coverage_target_pending" if program["spatial_mode"] == "overlay" else "designer_extent_pending"
    save(name, doc)


route_programs = load("route_programs.json")
if not any(program.get("id") == "exerciseCyclingLoop" for program in route_programs.get("programs", [])):
    route_programs.setdefault("programs", []).append({
        "id": "exerciseCyclingLoop",
        "name": "Exercise Cycling Loop",
        "category": "Movement",
        "geometry_type": "linear",
        "scale": "route",
        "selected": True,
        "priority": 0.5,
        "scores": {},
        "primary_users": ["Exercise cyclists", "Adults", "Residents"],
        "evidence_sources": ["brief-optional", "movement-driven", "designer-assumption"],
        "evidence": ["Added from the current 44-space Opportunity Lab catalog; terrain slope, curvature, width and pedestrian conflict remain downstream Rhino evaluations."],
        "suitability_field": "exercise_cycling_route_suitability",
        "attractors": ["Both public entrances", "Perimeter continuity", "Low slope from Rhino terrain mesh"],
        "repellers": ["High slope", "Tight curvature", "High pedestrian conflict"],
        "constraints": [],
        "placement_status": "generate_after_area_layout",
        "target_length_m": None,
        "target_width_m": None,
    })
    save("route_programs.json", route_programs)

for file_name in ("area_programs.json", "node_programs.json", "route_programs.json"):
    upgrade_program_file(file_name)

landscape_programs = [program for program in load("area_programs.json").get("programs", []) if program.get("spatial_mode") == "overlay"]
save("landscape_systems.json", {
    "schema_version": "1.2.0",
    "systems": [
        {
            "id": program["id"],
            "name": program["name"],
            "geometry_role": "environmental_network_region" if program["id"] == "bioswale" else "overlay_region",
            "measurement": "canopy_coverage_percent" if program["id"] == "treePlanting" else "coverage_area_or_percent",
            "target": None,
            "mandatory": True,
            "representation_status": "landscape_overlay_system",
            "extent_status": "designer_coverage_target_pending",
            "overlap_policy": "may_cross_compatible_landscape_regions" if program["id"] == "bioswale" else "may_overlap_program_areas",
            "suitability_field": program.get("suitability_field"),
            "authority": "unresolved_requires_designer_or_approved_standard",
            "objective": "grow_contiguous_high_suitability_regions",
        }
        for program in landscape_programs
    ],
})

relationships = load("relationships.json")
known = {program["id"] for file_name in ("area_programs.json", "node_programs.json", "route_programs.json") for program in load(file_name).get("programs", [])}
relationships["schema_version"] = "1.2.0"
relationships["designer_relationships"] = [
    {
        "id": f"designer:overlap:{source}:{target}",
        "source": source,
        "target": target,
        "type": "overlap_compatible",
        "graph_layer": "territory_overlap",
        "mandatory": False,
        "accepted": True,
        "directed": False,
        "authority": "designer_approved_competition_input",
        "compatibility_score": score,
        "overlap_mode": mode,
        "reason": reason,
        "source_provenance": "Competition scope + designer-confirmed mandatory program; compatibility scored by the design system for human review.",
    }
    for source, target, score, mode, reason in OVERLAPS
    if source in known and target in known
]
save("relationships.json", relationships)

climate = {
    "schema_version": "1.2.0",
    "authority": "designer_approved_competition_input",
    "source_lineage": {
        "regional_weather": {
            "station": "Dubai.Intl.AP 411940",
            "source": "ARE_DU_Dubai.Intl.AP.411940_TMYx.epw",
            "evidence_nature": "weather-file",
            "hours": 8760,
            "hours_at_or_above_35c": 1673,
            "hours_at_or_above_40c": 285,
            "evening_hours_at_or_above_35c": 559,
            "wind_sector_hours": {"N": 673, "NE": 600, "E": 986, "SE": 754, "S": 1657, "SW": 665, "W": 1590, "NW": 1509},
            "dominant_wind_sectors": ["S", "W", "NW"],
        },
        "review_and_user_evidence": "Program evidence_sources, evidence, primary_users and scores are embedded in program records.",
    },
    "site_axes": {
        "principal_long_axis_azimuth_deg_from_north": 21.0,
        "primary_sikka": {"id": "primary_sikka", "role": "ventilated_accessible_valley", "azimuth_deg_from_north": 21.0, "offset_m": 0, "basis": "site_long_axis_plus_southerly_epw_wind"},
        "ventilation_cuts": [
            {"id": "west_east_ventilation_cut", "role": "wind_erosion_passage", "azimuth_deg_from_north": 90, "offset_m": -18, "basis": "westerly_epw_wind"},
            {"id": "northwest_southeast_ventilation_cut", "role": "wind_erosion_passage", "azimuth_deg_from_north": 135, "offset_m": 18, "basis": "northwesterly_epw_wind"},
        ],
    },
    "baraha_rules": {
        "generator": "movement_route_intersection",
        "minimum_distinct_routes": 2,
        "cluster_distance_m": 6,
        "minimum_radius_m": 6,
        "maximum_radius_m": 14,
        "social_program_ids": ["communityPlaza", "smallEventZone", "flexibleEventLawn", "mainEntrancePlaza"],
        "designer_review_required": True,
    },
    "terrain_rules": {
        "existing_ground_character": "nearly_flat",
        "observed_relief_m": 1.372,
        "observed_triangle_slope_percent": {"median": 1.7, "p95": 3.19, "maximum": 4.28},
        "preferred_landscape_ridge_height_m": {"minimum": 0.6, "maximum": 1.8},
        "architectural_ridge_height_m": {"minimum": 2.5, "maximum": 4.0},
        "hollow_policy": "retain_near_existing_grade_and_form_protection_with_surrounding_ridges",
        "cut_fill_balance_required": True,
    },
    "coordinate_transform": {"obj_axis_convention": "rhino_y_up", "utm_easting": "obj_x", "utm_northing": "-obj_z", "elevation": "obj_y"},
}
save("climate_morphology.json", climate)

planting = {
    "schema_version": "1.2.0",
    "source_file": "UAE_MiddleEast_200_Plant_Database_Simulation.csv",
    "source_authority": "simulation_dataset_competition_design_support_only",
    "automation_policy": "candidate_generation_only_until_horticultural_safety_verification",
    "hydrozones": [
        {"id": "HZ-CREST", "name": "Desert Crest", "water_demand": "very_low", "morphology": "exposed_ridges_and_boundaries"},
        {"id": "HZ-SLOPE", "name": "Stabilized Slope", "water_demand": "low", "morphology": "dune_slopes_and_buffers"},
        {"id": "HZ-HOLLOW", "name": "Shaded Hollow", "water_demand": "moderate", "morphology": "play_picnic_quiet_and_social_oases"},
        {"id": "HZ-WATER", "name": "Specialized Water", "water_demand": "specialized_or_high", "morphology": "bioswale_or_exception_only"},
    ],
    "optimization_objectives": ["minimize_irrigation_pipe_length", "minimize_hardscape_crossings", "minimize_hydrozone_fragmentation", "minimize_water_demand", "meet_canopy_shade_targets", "avoid_root_conflicts"],
    "required_unverified_fields": ["thorn_hazard", "toxicity_risk", "allergen_risk", "fruit_litter_risk", "fragrance", "uae_nursery_availability", "establishment_period_months"],
}
save("planting_strategy.json", planting)

for optional_versioned in ("grid.json", "unresolved.json"):
    document = load(optional_versioned)
    if isinstance(document, dict):
        document["schema_version"] = "1.2.0"
        save(optional_versioned, document)

manifest = load("manifest.json")
manifest["schema_version"] = "1.2.0"
all_package_files = {
    "site": "site.json",
    "area_programs": "area_programs.json",
    "node_programs": "node_programs.json",
    "route_programs": "route_programs.json",
    "landscape_systems": "landscape_systems.json",
    "access_candidates": "access_candidates.json",
    "access_pair_metrics": "access_pair_metrics.json",
    "movement_requirements": "movement_requirements.json",
    "terrain_requirements": "terrain_requirements.json",
    "climate_morphology": "climate_morphology.json",
    "planting_strategy": "planting_strategy.json",
    "masterplan_settings": "masterplan_settings.json",
    "grid": "grid.json",
    "relationships": "relationships.json",
    "unresolved": "unresolved.json",
}
manifest["files"] = {key: filename for key, filename in all_package_files.items() if (PACKAGE / filename).exists()}
manifest["counts"]["area_programs"] = len(load("area_programs.json").get("programs", []))
manifest["counts"]["selected_area_programs"] = manifest["counts"]["area_programs"]
manifest["counts"]["node_programs"] = len(load("node_programs.json").get("programs", []))
manifest["counts"]["route_programs"] = len(load("route_programs.json").get("programs", []))
manifest["counts"]["landscape_systems"] = len(landscape_programs)
manifest["counts"]["designer_relationships"] = len(relationships["designer_relationships"])
manifest.setdefault("safety_policy", {})["mandatory_programs"] = "All scope programs are mandatory; spatial modes and overlap permissions prevent false deletion when target areas exceed the net site."
manifest["safety_policy"]["plant_automation"] = "Plant candidates remain blocked from automatic placement until horticultural safety fields are verified."
manifest["safety_policy"]["unresolved_extents"] = "Mandatory programs without approved extents remain represented as landscape overlays or area intent anchors; they are never treated as omitted."
save("manifest.json", manifest)

(PACKAGE / "README.txt").write_text(
    "Park Design Grasshopper Package v1.2\n\n"
    "All competition-scope programs are mandatory. Spatial mode and designer-approved overlap relationships allow compatible uses to share territory.\n"
    "climate_morphology.json carries EPW lineage, the primary sikka, ventilation cuts, terrain rules, OBJ/UTM transformation and baraha-generation rules.\n"
    "planting_strategy.json defines hydrozones and blocks automatic plant placement until horticultural safety verification.\n"
    "Only accepted_rule_edges are regulatory constraints; designer_relationships are explicit competition design decisions.\n",
    encoding="utf-8",
)

print(json.dumps({"package": str(PACKAGE), "schema_version": "1.2.0", "designer_relationships": len(relationships["designer_relationships"]), "mandatory_programs": len(known)}, indent=2))
