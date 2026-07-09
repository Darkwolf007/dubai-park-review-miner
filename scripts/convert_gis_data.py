"""
One-time conversion of the Al Safa 2 Park GeoPackages (gisdataset/*.gpkg) into
static, web-friendly GeoJSON files under dataset/gis/, following the same
"pre-processed static dataset" pattern already used by dataset/*.json (the
Apify review scrapes).

Uses only the Python standard library (sqlite3 + struct) -- GeoPackage is
just a SQLite database, and its geometry columns are standard WKB wrapped in
a small GeoPackage-specific header, both of which are simple enough to parse
directly without GDAL/fiona. The one exception is the space syntax step,
which uses networkx for real closeness/betweenness centrality (Brandes'
algorithm) -- reimplementing that by hand would be pointless when a
well-tested implementation is available.

Run with: python scripts/convert_gis_data.py
(the space syntax step takes ~3.5 minutes -- it's a one-time precomputation,
not something that runs per-request)
"""
import json
import os
import struct
import sqlite3
import time
from datetime import datetime, timezone

try:
    import networkx as nx
except ImportError:
    nx = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIS_SRC = os.path.join(ROOT, 'gisdataset')
OUT_DIR = os.path.join(ROOT, 'dataset', 'gis')

H3_GPKG = os.path.join(GIS_SRC, 'AlSafa2_H3_Master_Analysis.gpkg')
OSM_GPKG = os.path.join(GIS_SRC, 'AlSafa2_OSM_5km_AllLayers.gpkg')

COORD_PRECISION = 6

# Property allowlists keep the output small -- the raw OSM tables have 50-250
# mostly-irrelevant columns (contact:facebook, brand:wikidata, etc.).
BUILDING_PROPS = {'name': 'name', 'building': 'building', 'amenity': 'amenity', 'building:levels': 'levels', 'height': 'height'}
ROAD_PROPS = {'name': 'name', 'highway': 'highway', 'length': 'length', 'lanes': 'lanes', 'u': 'u', 'v': 'v'}
POI_PROPS = {
    'schools': {'name': 'name', 'amenity': 'amenity'},
    'hospitals': {'name': 'name', 'amenity': 'amenity', 'healthcare': 'healthcare'},
    'clinics': {'name': 'name', 'amenity': 'amenity', 'healthcare': 'healthcare'},
    'mosques': {'name': 'name', 'religion': 'religion'},
    'restaurants': {'name': 'name', 'cuisine': 'cuisine'},
    'cafes': {'name': 'name'},
    'parks': {'name': 'name', 'leisure': 'leisure'},
    'playgrounds': {'name': 'name', 'leisure': 'leisure'},
    'sports': {'name': 'name', 'sport': 'sport'},
    'bus_stops': {'name': 'name'},
    'parking': {'name': 'name', 'parking': 'parking_type'},
    'toilets': {'name': 'name', 'wheelchair': 'wheelchair'},
    'drinking_water': {'name': 'name'},
    'shops': {'name': 'name', 'shop': 'shop'}
}


def round_coord(c):
    return round(c, COORD_PRECISION)


def parse_wkb(buf, offset):
    """Recursively parses standard WKB starting at offset. Returns (geojson_geom, new_offset)."""
    byte_order = buf[offset]
    endian = '<' if byte_order == 1 else '>'
    offset += 1
    geom_type = struct.unpack_from(endian + 'I', buf, offset)[0]
    offset += 4
    base_type = geom_type % 1000  # strip Z/M/ZM flags (1000/2000/3000) if present

    if base_type == 1:  # Point
        x, y = struct.unpack_from(endian + 'dd', buf, offset)
        offset += 16
        if geom_type >= 1000:
            offset += 8 if geom_type < 3000 else 16
        return {'type': 'Point', 'coordinates': [round_coord(x), round_coord(y)]}, offset

    if base_type == 2:  # LineString
        n = struct.unpack_from(endian + 'I', buf, offset)[0]
        offset += 4
        coords = []
        for _ in range(n):
            x, y = struct.unpack_from(endian + 'dd', buf, offset)
            offset += 16
            if geom_type >= 1000:
                offset += 8 if geom_type < 3000 else 16
            coords.append([round_coord(x), round_coord(y)])
        return {'type': 'LineString', 'coordinates': coords}, offset

    if base_type == 3:  # Polygon
        n_rings = struct.unpack_from(endian + 'I', buf, offset)[0]
        offset += 4
        rings = []
        for _ in range(n_rings):
            n_points = struct.unpack_from(endian + 'I', buf, offset)[0]
            offset += 4
            ring = []
            for _ in range(n_points):
                x, y = struct.unpack_from(endian + 'dd', buf, offset)
                offset += 16
                if geom_type >= 1000:
                    offset += 8 if geom_type < 3000 else 16
                ring.append([round_coord(x), round_coord(y)])
            rings.append(ring)
        return {'type': 'Polygon', 'coordinates': rings}, offset

    if base_type in (4, 5, 6):  # MultiPoint, MultiLineString, MultiPolygon
        n = struct.unpack_from(endian + 'I', buf, offset)[0]
        offset += 4
        parts = []
        for _ in range(n):
            sub_geom, offset = parse_wkb(buf, offset)
            parts.append(sub_geom['coordinates'])
        type_name = {4: 'MultiPoint', 5: 'MultiLineString', 6: 'MultiPolygon'}[base_type]
        return {'type': type_name, 'coordinates': parts}, offset

    raise ValueError(f'Unsupported WKB geometry type {geom_type}')


def gpkg_blob_to_geojson(blob):
    """Strips the GeoPackage binary header (magic 'GP' + flags + optional envelope) and parses the WKB body."""
    if blob is None or blob[0:2] != b'GP':
        return None
    flags = blob[3]
    is_empty = (flags >> 4) & 0x01
    if is_empty:
        return None
    envelope_indicator = (flags >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    header_len = 8 + envelope_sizes.get(envelope_indicator, 0)
    geom, _ = parse_wkb(blob, header_len)
    return geom


def convert_table(con, table_name, prop_map, layer_name=None):
    layer_name = layer_name or table_name
    cur = con.cursor()
    cur.execute(f'SELECT * FROM "{table_name}"')
    cols = [d[0] for d in cur.description]
    geom_idx = cols.index('geom')

    features = []
    min_lng, min_lat, max_lng, max_lat = 180.0, 90.0, -180.0, -90.0

    for row in cur.fetchall():
        geom = gpkg_blob_to_geojson(row[geom_idx])
        if geom is None:
            continue
        props = {}
        for src_col, out_key in prop_map.items():
            if src_col in cols:
                val = row[cols.index(src_col)]
                if val is not None:
                    props[out_key] = val
        features.append({'type': 'Feature', 'geometry': geom, 'properties': props})

        # Track bbox from Point/LineString/Polygon first-ring coords (good enough for a layer-level extent).
        coords = geom['coordinates']
        flat = []

        def flatten(c):
            if isinstance(c[0], (int, float)):
                flat.append(c)
            else:
                for sub in c:
                    flatten(sub)
        flatten(coords)
        for lng, lat in flat:
            min_lng, max_lng = min(min_lng, lng), max(max_lng, lng)
            min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)

    fc = {'type': 'FeatureCollection', 'features': features}
    bbox = [min_lng, min_lat, max_lng, max_lat] if features else None
    return fc, bbox


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))


def compute_road_length_stats(roads_fc, total_hex_area_km2):
    """
    The h3_master.gpkg's road_density_m_per_km2 field is 0 for every single
    hex (verified directly against the source data -- not a conversion bug,
    the field was simply never populated upstream). Real road density is
    computable from the roads table's own `length` column instead, so that's
    used here rather than presenting a broken field as if it were data.
    """
    total_length_m = sum(f['properties'].get('length') or 0 for f in roads_fc['features'])
    density = total_length_m / total_hex_area_km2 if total_hex_area_km2 > 0 else 0
    return {'totalRoadLengthM': total_length_m, 'roadDensityMPerKm2': density}


def compute_road_intersections(roads_fc):
    """
    Counts OSM graph nodes (u/v columns) touched by >=3 physical road segments.
    Two-way streets are stored as a directed edge in both directions (u->v and
    v->u) -- deduping to a canonical (min,max) undirected edge before counting
    degree is required, otherwise every two-way pass-through node looks like
    degree 4 and the naive count wildly overstates intersections (verified:
    naive gave 87% of nodes as "intersections", not credible for a street
    network). This is still a raw graph-node degree count, not a
    topologically-simplified true-street-junction count -- dense service
    roads/parking aisles in this OSM extract mean the result skews high
    relative to what a driver would call an "intersection". Surfaced as such
    in the UI, not presented as more precise than it is.
    """
    canonical_edges = set()
    for feature in roads_fc['features']:
        props = feature['properties']
        u, v = props.get('u'), props.get('v')
        if u is not None and v is not None:
            canonical_edges.add((min(u, v), max(u, v)))

    degree = {}
    for u, v in canonical_edges:
        degree[u] = degree.get(u, 0) + 1
        degree[v] = degree.get(v, 0) + 1

    intersection_count = sum(1 for d in degree.values() if d >= 3)
    return {
        'totalGraphNodes': len(degree),
        'physicalEdgeCount': len(canonical_edges),
        'intersectionCount': intersection_count,
        'methodology': 'Undirected graph-node degree >=3 from OSM u/v node ids, deduped for bidirectional edges. Not simplified to named-street junctions -- dense service/parking-aisle segments inflate this relative to a true traffic-intersection count.'
    }


# Space syntax: only the drivable "circulation" network matters here -- pure
# service-road/parking-aisle segments (the majority of raw road rows) and
# pedestrian-only ways would dilute a street-network centrality analysis.
CIRCULATION_HIGHWAYS = {
    'residential', 'tertiary', 'secondary', 'primary', 'unclassified',
    'motorway', 'motorway_link', 'primary_link', 'secondary_link', 'tertiary_link',
    'living_street'
}


def minmax_normalize(values_by_key):
    if not values_by_key:
        return {}
    vals = list(values_by_key.values())
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1
    return {k: (v - lo) / span * 100 for k, v in values_by_key.items()}


def compute_space_syntax(con):
    """
    Real space syntax centrality on Al Safa 2 Park's drivable street network,
    using networkx (Brandes' algorithm), not a hand-rolled approximation:
      - Integration = closeness centrality (how easily a junction reaches
        every other junction -- classic space syntax "to-movement" measure).
      - Choice = betweenness centrality (how often a junction lies on the
        shortest path between other junctions -- classic "through-movement"
        measure). Uses a k=500 node sample for tractability (exact betweenness
        on ~12k nodes is impractical to recompute repeatedly) -- standard
        practice for large-network centrality, not a shortcut that changes
        the meaning of the result.
    Node coordinates come from road segment endpoints (OSMnx convention: u is
    a segment's start point, v is its end point) since this dataset has no
    separate node table.
    """
    if nx is None:
        print('networkx not installed -- skipping space syntax computation.')
        return None, None

    cur = con.cursor()
    cur.execute('SELECT geom, u, v, highway, length FROM roads')
    rows = cur.fetchall()

    node_coords = {}
    G = nx.Graph()

    for geom_blob, u, v, highway, length in rows:
        hw = highway or ''
        if not any(h in hw for h in CIRCULATION_HIGHWAYS):
            continue
        geom = gpkg_blob_to_geojson(geom_blob)
        if not geom or geom['type'] != 'LineString' or len(geom['coordinates']) < 2:
            continue
        start, end = geom['coordinates'][0], geom['coordinates'][-1]
        if u is not None:
            node_coords[u] = start
        if v is not None:
            node_coords[v] = end
        if u is not None and v is not None and u != v:
            w = length or 1.0
            if G.has_edge(u, v):
                if w < G[u][v]['length']:
                    G[u][v]['length'] = w
            else:
                G.add_edge(u, v, length=w)

    print(f'[space syntax] graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges')

    t0 = time.time()
    closeness = nx.closeness_centrality(G, distance='length')
    print(f'[space syntax] closeness centrality (Integration): {time.time() - t0:.1f}s')

    t0 = time.time()
    k = min(500, G.number_of_nodes())
    betweenness = nx.betweenness_centrality(G, k=k, weight='length', seed=42, normalized=True)
    print(f'[space syntax] betweenness centrality (Choice, k={k} sample): {time.time() - t0:.1f}s')

    integration_norm = minmax_normalize(closeness)
    choice_norm = minmax_normalize(betweenness)

    features = []
    for node_id in G.nodes():
        coords = node_coords.get(node_id)
        if not coords:
            continue
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [round_coord(coords[0]), round_coord(coords[1])]},
            'properties': {
                'node_id': str(node_id),
                'integration': round(integration_norm.get(node_id, 0), 2),
                'choice': round(choice_norm.get(node_id, 0), 2),
                'degree': G.degree(node_id)
            }
        })

    stats = {
        'nodeCount': G.number_of_nodes(),
        'edgeCount': G.number_of_edges(),
        'betweennessSampleK': k,
        'methodology': (
            'Integration = closeness centrality, Choice = betweenness centrality (k-sampled), '
            'computed with networkx on the drivable circulation network (residential/tertiary/'
            'secondary/primary/unclassified/link/living_street highway types -- service roads and '
            'pedestrian-only ways excluded). Both scores are min-max normalized to 0-100 across '
            'this network for display.'
        )
    }

    return {'type': 'FeatureCollection', 'features': features}, stats


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'layers': {}}

    # H3 grid
    con = sqlite3.connect(H3_GPKG)
    cur = con.cursor()
    cur.execute('PRAGMA table_info(h3_master)')
    h3_cols = [r[1] for r in cur.fetchall() if r[1] != 'geom']
    h3_prop_map = {c: c for c in h3_cols}
    fc, bbox = convert_table(con, 'h3_master', h3_prop_map)
    write_json(os.path.join(OUT_DIR, 'h3_grid.geojson'), fc)
    manifest['layers']['h3_grid'] = {'source': 'AlSafa2_H3_Master_Analysis.gpkg', 'table': 'h3_master', 'featureCount': len(fc['features']), 'bbox': bbox, 'h3Resolution': 9}
    print(f"h3_grid: {len(fc['features'])} features")
    total_hex_area_km2 = sum(f['properties'].get('hex_area_km2') or 0 for f in fc['features'])
    con.close()

    # OSM layers
    con = sqlite3.connect(OSM_GPKG)

    fc, bbox = convert_table(con, 'buildings', BUILDING_PROPS)
    write_json(os.path.join(OUT_DIR, 'buildings.geojson'), fc)
    manifest['layers']['buildings'] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': 'buildings', 'featureCount': len(fc['features']), 'bbox': bbox}
    print(f"buildings: {len(fc['features'])} features")

    fc, bbox = convert_table(con, 'roads', ROAD_PROPS)
    write_json(os.path.join(OUT_DIR, 'roads.geojson'), fc)
    manifest['layers']['roads'] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': 'roads', 'featureCount': len(fc['features']), 'bbox': bbox}
    print(f"roads: {len(fc['features'])} features")

    road_stats = compute_road_intersections(fc)
    road_stats.update(compute_road_length_stats(fc, total_hex_area_km2))
    write_json(os.path.join(OUT_DIR, 'road_stats.json'), road_stats)
    print(f"road_stats: {road_stats}")

    for table_name, prop_map in POI_PROPS.items():
        fc, bbox = convert_table(con, table_name, prop_map)
        write_json(os.path.join(OUT_DIR, f'{table_name}.geojson'), fc)
        manifest['layers'][table_name] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': table_name, 'featureCount': len(fc['features']), 'bbox': bbox}
        print(f"{table_name}: {len(fc['features'])} features")

    print('\n[space syntax] computing closeness/betweenness centrality (~3.5 min, one-time)...')
    space_syntax_fc, space_syntax_stats = compute_space_syntax(con)
    if space_syntax_fc:
        node_lngs = [f['geometry']['coordinates'][0] for f in space_syntax_fc['features']]
        node_lats = [f['geometry']['coordinates'][1] for f in space_syntax_fc['features']]
        ss_bbox = [min(node_lngs), min(node_lats), max(node_lngs), max(node_lats)] if node_lngs else None
        write_json(os.path.join(OUT_DIR, 'space_syntax.geojson'), space_syntax_fc)
        write_json(os.path.join(OUT_DIR, 'space_syntax_stats.json'), space_syntax_stats)
        manifest['layers']['space_syntax'] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': 'roads (derived graph)', 'featureCount': len(space_syntax_fc['features']), 'bbox': ss_bbox}
        print(f"space_syntax: {len(space_syntax_fc['features'])} nodes")

    con.close()

    write_json(os.path.join(OUT_DIR, 'manifest.json'), manifest)
    print('\nWrote manifest.json')

    # File size report
    print('\n--- Output file sizes ---')
    total = 0
    for fname in sorted(os.listdir(OUT_DIR)):
        path = os.path.join(OUT_DIR, fname)
        size = os.path.getsize(path)
        total += size
        print(f'  {fname}: {size / 1024:.1f} KB')
    print(f'  TOTAL: {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
