#!/usr/bin/env python3
"""Convert a KMZ (Google Earth) file to GeoJSON.

Used to refresh the bundled snapshots in /data from the Municipal Affairs
protected-road KMZs and the IET quarries-site KMZs (No Permits Available
areas, QMELs, permit/lease boundary polygons).

Usage: python3 kmz_to_geojson.py input.kmz output.geojson

Captures per-Placemark: <name>, <description> (HTML-stripped, 400 chars),
ExtendedData SimpleData/Data fields. Geometry: Polygon (outer+inner rings),
LineString, Point; multiple polygons per placemark become MultiPolygon.
Coordinates rounded to 6 decimal places (~0.1 m).
"""
import sys, zipfile, json, re
from xml.etree import ElementTree as ET

NS = '{http://www.opengis.net/kml/2.2}'

def convert(path, out):
    with zipfile.ZipFile(path) as z:
        kml = [n for n in z.namelist() if n.endswith('.kml')][0]
        root = ET.fromstring(z.read(kml))
    feats = []
    for pm in root.iter(NS + 'Placemark'):
        props = {}
        nm = pm.find(NS + 'name')
        if nm is not None and nm.text:
            props['name'] = nm.text.strip()
        desc = pm.find(NS + 'description')
        if desc is not None and desc.text:
            txt = re.sub(r'<[^>]+>', ' ', desc.text)
            props['description'] = re.sub(r'\s+', ' ', txt).strip()[:400]
        for sd in pm.iter(NS + 'SimpleData'):
            k = sd.get('name')
            if k and sd.text:
                props[k] = sd.text.strip()
        for dt in pm.iter(NS + 'Data'):
            k = dt.get('name'); v = dt.find(NS + 'value')
            if k and v is not None and v.text:
                props[k] = v.text.strip()
        polys, lines, pts = [], [], []
        for poly in pm.iter(NS + 'Polygon'):
            rings = []
            for b in list(poly.iter(NS + 'outerBoundaryIs')) + list(poly.iter(NS + 'innerBoundaryIs')):
                ce = b.find('.//' + NS + 'coordinates')
                if ce is None or not ce.text:
                    continue
                ring = []
                for tok in ce.text.split():
                    p = tok.split(',')
                    if len(p) >= 2:
                        ring.append([round(float(p[0]), 6), round(float(p[1]), 6)])
                if len(ring) >= 4:
                    rings.append(ring)
            if rings:
                polys.append(rings)
        for ls in pm.iter(NS + 'LineString'):
            ce = ls.find(NS + 'coordinates')
            if ce is not None and ce.text:
                lines.append([[round(float(t.split(',')[0]), 6), round(float(t.split(',')[1]), 6)]
                              for t in ce.text.split() if len(t.split(',')) >= 2])
        for pt in pm.iter(NS + 'Point'):
            ce = pt.find(NS + 'coordinates')
            if ce is not None and ce.text:
                p = ce.text.strip().split(',')
                pts.append([round(float(p[0]), 6), round(float(p[1]), 6)])
        geom = None
        if polys:
            geom = ({'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1
                    else {'type': 'MultiPolygon', 'coordinates': polys})
        elif lines:
            geom = ({'type': 'LineString', 'coordinates': lines[0]} if len(lines) == 1
                    else {'type': 'MultiLineString', 'coordinates': lines})
        elif pts:
            geom = {'type': 'Point', 'coordinates': pts[0]}
        if geom:
            feats.append({'type': 'Feature', 'properties': props, 'geometry': geom})
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'),
              separators=(',', ':'))
    print(f'{out}: {len(feats)} features')

if __name__ == '__main__':
    convert(sys.argv[1], sys.argv[2])
