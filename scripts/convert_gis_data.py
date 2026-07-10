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
    dead_end_count = sum(1 for d in degree.values() if d == 1)
    return {
        'totalGraphNodes': len(degree),
        'physicalEdgeCount': len(canonical_edges),
        'intersectionCount': intersection_count,
        'deadEndCount': dead_end_count,
        'methodology': 'Undirected graph-node degree >=3 from OSM u/v node ids, deduped for bidirectional edges. Not simplified to named-street junctions -- dense service/parking-aisle segments inflate this relative to a true traffic-intersection count. Dead ends are degree-1 nodes on the same graph.'
    }


# Space syntax: only the drivable "circulation" network matters here -- pure
# service-road/parking-aisle segments (the majority of raw road rows) and
# pedestrian-only ways would dilute a street-network centrality analysis.
CIRCULATION_HIGHWAYS = {
    'residential', 'tertiary', 'secondary', 'primary', 'unclassified',
    'motorway', 'motorway_link', 'primary_link', 'secondary_link', 'tertiary_link',
    'living_street'
}

# Road hierarchy buckets for Urban Analysis -- Road Network Analysis section.
ROAD_HIERARCHY_GROUPS = {
    'primary': {'motorway', 'motorway_link', 'primary', 'primary_link', 'trunk', 'trunk_link'},
    'secondary': {'secondary', 'secondary_link', 'tertiary', 'tertiary_link'},
    'local': {'residential', 'living_street', 'unclassified'},
    'service': {'service', 'track'},
    'pedestrianCycling': {'footway', 'path', 'steps', 'pedestrian', 'corridor', 'cycleway'}
}


def compute_road_hierarchy_stats(roads_fc):
    """Groups road segments into a standard hierarchy (Primary/Secondary/Local/Service/Pedestrian) by highway tag, with real segment-length totals per tier."""
    buckets = {k: {'count': 0, 'lengthM': 0.0} for k in ROAD_HIERARCHY_GROUPS}
    buckets['other'] = {'count': 0, 'lengthM': 0.0}

    def classify(hw):
        for group, tags in ROAD_HIERARCHY_GROUPS.items():
            if any(t in hw for t in tags):
                return group
        return 'other'

    for feature in roads_fc['features']:
        props = feature['properties']
        hw = props.get('highway') or ''
        group = classify(hw)
        buckets[group]['count'] += 1
        buckets[group]['lengthM'] += props.get('length') or 0

    return buckets


def build_hex_lookup(h3_fc):
    """Prepares hex polygons + bboxes for fast point-in-polygon lookup."""
    hexes = []
    for f in h3_fc['features']:
        ring = f['geometry']['coordinates'][0]
        lngs = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        hexes.append({
            'h3_id': f['properties']['h3_id'],
            'ring': ring,
            'bbox': (min(lngs), min(lats), max(lngs), max(lats))
        })
    return hexes


def point_in_ring(lng, lat, ring):
    """Standard ray-casting point-in-polygon test."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def compute_per_hex_road_length(roads_fc, hex_lookup):
    """
    Real spatial join: attributes each road segment's length to whichever H3
    hex contains its midpoint (bbox pre-filter, then exact ray-casting
    point-in-polygon for candidates -- straightforward given ~860 hexes).
    This is the genuine per-cell equivalent of the aggregate road density fix
    above; the source h3_master.gpkg has no usable per-hex road figure at all.
    """
    per_hex_length = {}
    for feature in roads_fc['features']:
        coords = feature['geometry'].get('coordinates')
        if not coords or len(coords) < 2:
            continue
        mid = coords[len(coords) // 2]
        mlng, mlat = mid[0], mid[1]
        length = feature['properties'].get('length') or 0
        for hex_entry in hex_lookup:
            bx0, by0, bx1, by1 = hex_entry['bbox']
            if mlng < bx0 or mlng > bx1 or mlat < by0 or mlat > by1:
                continue
            if point_in_ring(mlng, mlat, hex_entry['ring']):
                per_hex_length[hex_entry['h3_id']] = per_hex_length.get(hex_entry['h3_id'], 0) + length
                break
    return per_hex_length


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

    # H3 grid -- writing is deferred until after the per-hex road-length join below,
    # so h3_fc is kept around instead of being written immediately.
    con = sqlite3.connect(H3_GPKG)
    cur = con.cursor()
    cur.execute('PRAGMA table_info(h3_master)')
    h3_cols = [r[1] for r in cur.fetchall() if r[1] != 'geom']
    h3_prop_map = {c: c for c in h3_cols}
    h3_fc, h3_bbox = convert_table(con, 'h3_master', h3_prop_map)
    manifest['layers']['h3_grid'] = {'source': 'AlSafa2_H3_Master_Analysis.gpkg', 'table': 'h3_master', 'featureCount': len(h3_fc['features']), 'bbox': h3_bbox, 'h3Resolution': 9}
    print(f"h3_grid: {len(h3_fc['features'])} features")
    total_hex_area_km2 = sum(f['properties'].get('hex_area_km2') or 0 for f in h3_fc['features'])
    con.close()

    # OSM layers
    con = sqlite3.connect(OSM_GPKG)

    fc, bbox = convert_table(con, 'buildings', BUILDING_PROPS)
    write_json(os.path.join(OUT_DIR, 'buildings.geojson'), fc)
    manifest['layers']['buildings'] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': 'buildings', 'featureCount': len(fc['features']), 'bbox': bbox}
    print(f"buildings: {len(fc['features'])} features")

    roads_fc, bbox = convert_table(con, 'roads', ROAD_PROPS)
    write_json(os.path.join(OUT_DIR, 'roads.geojson'), roads_fc)
    manifest['layers']['roads'] = {'source': 'AlSafa2_OSM_5km_AllLayers.gpkg', 'table': 'roads', 'featureCount': len(roads_fc['features']), 'bbox': bbox}
    print(f"roads: {len(roads_fc['features'])} features")

    road_stats = compute_road_intersections(roads_fc)
    road_stats.update(compute_road_length_stats(roads_fc, total_hex_area_km2))
    road_stats['hierarchy'] = compute_road_hierarchy_stats(roads_fc)
    print(f"road hierarchy: {road_stats['hierarchy']}")

    print('\n[urban morphology] joining road segments to H3 hexes (real point-in-polygon spatial join, one-time)...')
    t_join = time.time()
    hex_lookup = build_hex_lookup(h3_fc)
    per_hex_road_length = compute_per_hex_road_length(roads_fc, hex_lookup)
    print(f'[urban morphology] road-to-hex join: {time.time() - t_join:.1f}s, {len(per_hex_road_length)} hexes matched')

    for f in h3_fc['features']:
        h3_id = f['properties']['h3_id']
        length_m = per_hex_road_length.get(h3_id, 0)
        area_km2 = f['properties'].get('hex_area_km2') or 0
        f['properties']['real_road_length_m'] = round(length_m, 1)
        f['properties']['real_road_density_m_per_km2'] = round(length_m / area_km2, 1) if area_km2 > 0 else 0

    write_json(os.path.join(OUT_DIR, 'h3_grid.geojson'), h3_fc)
    print(f"h3_grid: wrote {len(h3_fc['features'])} features (with real per-hex road length attached)")

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

        # Block count estimate via Euler's formula for planar graphs (faces = edges - nodes + 2)
        # on the drivable circulation network -- a real graph-theoretic estimate, not a
        # true block-polygon extraction (which would need building-parcel boundaries).
        euler_faces = space_syntax_stats['edgeCount'] - space_syntax_stats['nodeCount'] + 2
        block_count_estimate = max(1, euler_faces - 1)  # subtract the graph's single unbounded outer face
        road_stats['blockCountEstimate'] = block_count_estimate
        road_stats['avgBlockSizeKm2'] = round(total_hex_area_km2 / block_count_estimate, 4)
        road_stats['blockEstimateMethodology'] = "Euler's formula for planar graphs (faces = edges - nodes + 2) on the drivable circulation network -- a graph-theoretic estimate, not a true block-polygon extraction from parcel boundaries."

    con.close()

    write_json(os.path.join(OUT_DIR, 'road_stats.json'), road_stats)
    print(f"\nroad_stats (final): {road_stats}")

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
