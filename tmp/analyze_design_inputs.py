import csv
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(r"C:\Users\shyle\source\repos\dubai-park-review-miner\dataset")


def load_json(name):
    return json.loads((ROOT / "al_safa_2_park_design_package" / name).read_text(encoding="utf-8"))


def as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("programs", "items", "relationships", "nodes", "routes"):
            if isinstance(value.get(key), list):
                return value[key]
    return []


def summarize_package():
    manifest = load_json("manifest.json")
    site = load_json("site.json")
    areas = as_list(load_json("area_programs.json"))
    nodes = as_list(load_json("node_programs.json"))
    routes = as_list(load_json("route_programs.json"))
    rel_raw = load_json("relationships.json")
    accepted = rel_raw.get("accepted_rule_edges", []) if isinstance(rel_raw, dict) else []
    advisory = rel_raw.get("advisory_relationships", []) if isinstance(rel_raw, dict) else as_list(rel_raw)

    def number(item, *keys):
        for key in keys:
            val = item.get(key)
            if isinstance(val, (int, float)):
                return float(val)
        return 0.0

    area_rows = []
    for item in areas:
        area_rows.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "min": number(item, "minimum_area_m2", "min_area_m2"),
            "target": number(item, "target_area_m2"),
            "max": number(item, "maximum_area_m2", "max_area_m2"),
            "status": item.get("area_status"),
            "selected": item.get("selected"),
            "category": item.get("category"),
        })
    print("=== DESIGN PACKAGE ===")
    print(json.dumps({
        "manifest": manifest,
        "site_keys": list(site) if isinstance(site, dict) else None,
        "counts": {"areas": len(areas), "nodes": len(nodes), "routes": len(routes), "accepted_edges": len(accepted), "advisory_edges": len(advisory)},
        "area_sums_m2": {k: round(sum(r[k] for r in area_rows), 2) for k in ("min", "target", "max")},
        "area_status": Counter(str(r["status"]) for r in area_rows),
        "selected": Counter(str(r["selected"]) for r in area_rows),
        "area_programs": area_rows,
        "node_names": [x.get("name") for x in nodes],
        "route_names": [x.get("name") for x in routes],
        "relationship_types": Counter(str(x.get("type") or x.get("relationship_type")) for x in accepted + advisory),
    }, indent=2, default=lambda x: dict(x)))


def summarize_plants():
    path = ROOT / "UAE_MiddleEast_200_Plant_Database_Simulation.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    numeric_fields = ["Mature Height (m)", "Mature Canopy Diameter (m)", "Clear Trunk Height / Branch Clearance (m)", "Trunk Diameter at Breast Height - DBH (m)"]
    numeric = {}
    for field in numeric_fields:
        vals = []
        for row in rows:
            try:
                vals.append(float(row[field]))
            except (ValueError, TypeError):
                pass
        numeric[field] = {"count": len(vals), "min": min(vals) if vals else None, "mean": round(sum(vals) / len(vals), 2) if vals else None, "max": max(vals) if vals else None}

    duplicate_scientific = [k for k, v in Counter(r["Scientific Name"].strip() for r in rows).items() if k and v > 1]
    print("=== PLANT DATABASE ===")
    print(json.dumps({
        "rows": len(rows),
        "columns": len(rows[0]) if rows else 0,
        "blank_cells": sum(not str(value).strip() for row in rows for value in row.values()),
        "duplicate_scientific_names": duplicate_scientific,
        "native_status": Counter(r["Native / Foreign Status"] for r in rows),
        "habit": Counter(r["Habit Type (3D Form)"] for r in rows),
        "water": Counter(r["Water Demand Level"] for r in rows),
        "drought": Counter(r["Drought Tolerance"] for r in rows),
        "salinity": Counter(r["Salt / Salinity Tolerance"] for r in rows),
        "foliage_density": Counter(r["Foliage Density (Shade Factor)"] for r in rows),
        "leaf_retention": Counter(r["Leaf Retention"] for r in rows),
        "numeric": numeric,
    }, indent=2, default=lambda x: dict(x)))


def summarize_epw():
    path = ROOT / "climate data" / "ARE_DU_Dubai.Intl.AP.411940_TMYx.epw"
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = [next(reader) for _ in range(8)]
        data = [row for row in reader if len(row) >= 35]

    months = {m: [] for m in range(1, 13)}
    for r in data:
        months[int(r[1])].append(r)

    monthly = []
    for month, rows in months.items():
        temps = [float(r[6]) for r in rows]
        rhs = [float(r[8]) for r in rows]
        winds = [float(r[21]) for r in rows]
        ghi = [float(r[13]) for r in rows]
        monthly.append({
            "month": month,
            "dry_bulb_mean_c": round(sum(temps) / len(temps), 1),
            "dry_bulb_max_c": max(temps),
            "rh_mean_pct": round(sum(rhs) / len(rhs), 1),
            "wind_mean_m_s": round(sum(winds) / len(winds), 2),
            "ghi_sum_kwh_m2": round(sum(ghi) / 1000, 1),
        })

    valid_dirs = [(float(r[20]), float(r[21])) for r in data if float(r[21]) > 0.2 and float(r[20]) < 360]
    sectors = Counter()
    names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    for direction, speed in valid_dirs:
        sectors[names[int(((direction + 22.5) % 360) // 45)]] += 1

    hottest = max(data, key=lambda r: float(r[6]))
    humid_hot = max(data, key=lambda r: float(r[6]) + 0.08 * float(r[8]))
    print("=== EPW ===")
    print(json.dumps({
        "location": header[0],
        "hours": len(data),
        "monthly": monthly,
        "wind_sector_hours": sectors,
        "hottest_hour": {"month": int(hottest[1]), "day": int(hottest[2]), "hour": int(hottest[3]), "dry_bulb_c": float(hottest[6]), "rh_pct": float(hottest[8]), "wind_dir_deg": float(hottest[20]), "wind_m_s": float(hottest[21])},
        "hot_humid_proxy_hour": {"month": int(humid_hot[1]), "day": int(humid_hot[2]), "hour": int(humid_hot[3]), "dry_bulb_c": float(humid_hot[6]), "rh_pct": float(humid_hot[8]), "wind_dir_deg": float(humid_hot[20]), "wind_m_s": float(humid_hot[21])},
        "hours_over_35c": sum(float(r[6]) >= 35 for r in data),
        "hours_over_40c": sum(float(r[6]) >= 40 for r in data),
        "evening_hours_over_35c": sum(float(r[6]) >= 35 and int(r[3]) in (17,18,19,20,21,22,23) for r in data),
    }, indent=2, default=lambda x: dict(x)))


def summarize_obj(filename):
    path = ROOT / "3d_data" / filename
    vertices = []
    faces = []
    objects = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("v "):
                parts = line.split()
                vertices.append(tuple(map(float, parts[1:4])))
            elif line.startswith("f "):
                idx = []
                for token in line.split()[1:]:
                    idx.append(int(token.split("/")[0]) - 1)
                if len(idx) >= 3:
                    faces.append(idx)
            elif line.startswith("o ") or line.startswith("g "):
                objects.append(line[2:].strip())

    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    zs = [v[2] for v in vertices]
    slopes = []
    for face in faces:
        a, b, c = (vertices[face[i]] for i in range(3))
        ab = tuple(b[i] - a[i] for i in range(3))
        ac = tuple(c[i] - a[i] for i in range(3))
        normal = (
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        )
        # OBJ was exported from Rhino/Y-up coordinates: X/Z are plan and Y is elevation.
        vertical_normal = abs(normal[1])
        horizontal_normal = math.hypot(normal[0], normal[2])
        if vertical_normal > 1e-9:
            slopes.append(100 * horizontal_normal / vertical_normal)
    slopes.sort()

    def pct(q):
        return round(slopes[min(len(slopes) - 1, int(q * (len(slopes) - 1)))], 2) if slopes else None

    return {
        "file": filename,
        "vertices": len(vertices),
        "faces": len(faces),
        "objects_groups": objects[:30],
        "bbox": {"x": [min(xs), max(xs)], "y": [min(ys), max(ys)], "z": [min(zs), max(zs)]} if vertices else None,
        "dimensions": {"x_plan": round(max(xs)-min(xs), 3), "y_elevation": round(max(ys)-min(ys), 3), "z_plan": round(max(zs)-min(zs), 3)} if vertices else None,
        "triangle_slope_percent": {"p50": pct(0.5), "p90": pct(0.9), "p95": pct(0.95), "max": round(max(slopes), 2) if slopes else None},
    }


if __name__ == "__main__":
    summarize_package()
    summarize_plants()
    summarize_epw()
    print("=== OBJ ===")
    print(json.dumps([summarize_obj("topography.obj"), summarize_obj("trees.obj")], indent=2))
