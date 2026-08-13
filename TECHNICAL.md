# Technical notes: data sources, datum handling, and screening rules

Reference documentation for the data-quality findings behind QuarryCheck and the
rationale for its source selection and screening rules. Every claim below was
verified against live services and, where noted, against ground truth from
operating quarry permits.

## Datum findings

Reference frame for all measurements: NAD83(CSRS), the provincial survey datum
realized by the NL Geodetic Network (NLGN). A datum audit table renders in
every report.

### dnrmaps serves untransformed NAD27 as WGS84 (two services)

**Mineral_Lands (tenure database) — proven.** The service serves NAD27
coordinates labelled WGS84 with no datum transformation applied. Proof: the
served point for quarry permit 151600 matches a raw no-shift inverse projection
of its recorded NAD27 UTM coordinates (368308 E, 5274092 N, zone 21) to 0.0 m.
The true NAD27→NAD83 shift in NL is 52–74 m (NRCan NTv2 grid ca_nrc_ntv2_0),
predominantly eastward. The server ignores the `datumTransformation` query
parameter (four variants tested).

Consequence: the province's authoritative tenure map is 52–74 m wrong
province-wide relative to every modern dataset, and every conflict check run
against it inherits the error.

**Topographic (1:50k NTS layers) — corrected by pattern, magnitude not
independently confirmed.** The source spatial reference is NAD27-family and the
service shares the server pipeline with Mineral_Lands. The NTv2 correction is
applied to its water lines, water polygons, and building points. Post-correction
comparison against NLImagery orthophotos shows a residual misfit of 15–25 m in
varying directions — consistent with 1:50k cartographic generalization and pond
water-level differences rather than a datum error, which is the accuracy floor
of that source.

**Correction implementation.** Sources flagged `datum:'nad27null'` in app.js
are corrected client-side using `data/nad27_shift.json`, a 0.5-degree lattice
sampled from the NRCan NTv2 grid (<1 m interpolation error). Validated
end-to-end: permit 151600 moves +54.5 m E as predicted. Corrected features
carry `properties._datumCorrected`. Query distances on claims/mineral tenure
are widened (100→200 m) so the shift cannot push hits outside the query window.
The NL Topo raster basemap receives the equivalent correction via per-tile
bbox adjustment of export requests.

### Verified correct as served

- **Crown Lands (landuseatlasmaps)**: title boundaries match a surveyed
  boundary to <1 m.
- **Land Use Atlas road layers (39/40)**: linework sits on the pavement in
  orthophotos at two verification sites.
- **GNL ArcGIS Online layers**: native NAD83/Web Mercator.
- **dnrmaps Map_Layers roads**: datum correct (federal NRN import;
  ground-truthed at permit 151600: measured 104.7 m to Route 470 vs ~100 m
  ground truth) — but see vintage note below.

### Unverified

- **Land_Use layers** (municipal, planning, protected water supplies,
  LIL/LISA): datum unverified; given the server pattern, NAD27-null is
  suspected but no anchor has been tested. Results near 100 m thresholds
  should be treated as ±75 m until resolved.

## Road source selection

- **Primary (G3 verdicts + map rendering):** Land Use Atlas layers 39 (Primary
  Roads) and 40 (Secondary Roads). Current linework, verified on orthophotos at
  two sites.
- **Demoted:** dnrmaps Map_Layers/13 (Detailed Road Network). Datum-correct but
  2008-vintage; found offset/stale where roads were realigned since. Context
  only; produces no verdicts. Note: the AGOL `NRN_NL_7_0_ROADSEG` service is a
  293-segment Labrador subset, not the provincial network.
- **Forest access roads (G2):** FFA_ResourceRoads_NF (island, 12,431 segments)
  and FFA_ResourceRoads_LB, plus dnrmaps resource roads as fallback.

### G3 classification rule

The application form screens roads at 50 m (G3) but trails/forest access roads
at 15 m (G2). The Atlas road layers class some forest access roads as
"Collector". Rule: a G3 hit only stands as ENCROACHES if it is a real road —
named (route number or street name populated) or a paved-tier class
(Freeway/Expressway/Arterial). Unnamed hits classed Resource/Recreation or
coinciding (≤120 m) with a mapped FFA resource road downgrade to ADVISORY with
G2 governing. The override is per-road: a second, genuine road inside 50 m
still fails. Basis: permits have been issued adjacent to forest access roads
under the G2 framing.

## Water screening rules

The FFA forestry inventory maps drainage channels as "Stream" whether or not
they carry flow; at verified barrens sites these are predominantly dry. An
operating permit exists adjacent to such mapped lines. Rules:

- **G5 verdicts and E5 itemization: waterbody polygons (lakes/ponds) only**,
  from the forestry inventory and 1:50k topo.
- Mapped stream/drainage lines produce no verdicts and are not itemized. They
  are summarized once (count within 50 m in the G5 note; count within 200 m in
  E5 with a fill-in statement for the applicant to complete from site
  knowledge), so a form answer can never be contradicted by the department's
  own map.
- E5 clusters segments (40 m join) into distinct physical features.
- Stated limit: small waterbodies may be unmapped in both sources; "mapped" is
  the only claim made.

## Bundled snapshots (/data)

| File | Source | Notes |
|---|---|---|
| protected_roads.geojson | Municipal Affairs Protected Road Zoning KMZ | G4, with live Atlas layer 38 as co-source |
| building_control.geojson | Municipal Affairs Building Control Line KMZ | advisory |
| no_permit_areas.geojson | IET quarries site KMZ | 5 designated areas, s.5 Quarry Materials Regulations |
| qmels.geojson | IET quarries site KMZ dated 2024-10-25 | flagged stale in reports |
| quarry_tenure_snapshot.geojson | IET quarries site KMZ | 1,340 permit/lease polygons; datum-verified against permit 151600 (104.7 m to Route 470 vs ~100 m ground truth; area 2.00 ha exact) |
| nad27_shift.json | Sampled from NRCan NTv2 ca_nrc_ntv2_0 | 0.5° lattice |

Refresh procedure: re-download the KMZs, run `tools/kmz_to_geojson.py`, update
snapshot dates in app.js.

## Basemaps and reference layers

- **NL Imagery** (default): provincial orthophotos, NAD83(CSRS)-referenced,
  Web Mercator tile cache, levels 6–19 (~0.3 m/px). Island coverage only.
  Found as an operational layer of the Land Use Atlas webmap; not surfaced in
  the Atlas's own basemap gallery, which offers only commercial basemaps.
- **NL Topo**: dnrmaps Topographic export (datum-corrected per-tile) with
  Map_Layers roads overlay. Province-wide. Positions ±25–40 m vs imagery
  (1:50k source accuracy).
- **Esri World Imagery**: the Atlas's default satellite view; often newer
  vintage than NLImagery; useful for change detection.
- **Names overlay**: Canadian Geographical Names Database via the NRCan
  geoname API (the federal register fed by the provincial names authority),
  rendered as vector text. Road names labelled from queried road vectors.
- **Survey control**: nearest three NLGN monuments (Control_Monuments_Public,
  AGOL) in every report. Monument coordinates are MTM (zone field 1–6),
  not UTM.

## Known limitations

- Archaeology and rare-species data are not public by design; never screenable.
- Cabin access trails are unmapped in all provincial layers.
- Building data (Bing-derived + 1:50k symbols) is demonstrably incomplete;
  reports state that an empty result does not establish absence of structures.
- The Crown Lands server rejects non-browser user agents; G1 and the Atlas
  road/zone layers are browser-verified only.
- The No Permits Available listing is described by the province as
  work-in-progress; a clean NPA result is reported as advisory, not clearance.

## Validation record

- Permit 151600 (Rose Blanche): full regression anchor. Title match <1 m;
  road distance 104.7 m measured vs ~100 m ground truth; tenure snapshot area
  2.00 ha exact; datum correction +54.5 m E as predicted.
- Batteau Barrens candidate site: three marginal failures identified
  pre-application (road 13–14 m, pond 46 m, bog 19 m), with the road correctly
  identified as the Bateau Barrens forest access road by the FFA layer.
- Engine is Node-testable: `global.turf = require('@turf/turf');
  require('./app.js')`.
