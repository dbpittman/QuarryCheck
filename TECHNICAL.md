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

**Mineral_Lands (tenure database) — proven, two independent ways.**

*Single-permit proof.* The served point for quarry permit 151600 matches a raw
no-shift inverse projection of its recorded NAD27 UTM coordinates (368308 E,
5274092 N, zone 21) to 0.0 m. The true NAD27→NAD83 shift in NL is 52–74 m
(NRCan NTv2 grid ca_nrc_ntv2_0), predominantly eastward. The server ignores the
`datumTransformation` query parameter (four variants tested).

*Population-scale proof.* All 1,270 served permit/lease points (layers 8 and 9)
were compared against the 1,340 true boundary polygons in the department's own
permit-boundary KMZ (see /data snapshot), matched by file number: 1,113 pairs
province-wide (lon −67°..−53°, lat 46.7°..56.6°). Median offset from true
boundary to served point: **+64.9 m E, −6.1 m N**. NTv2-predicted NAD27→NAD83
shift at those same locations: **+66.4 m E, −3.4 m N**. Residual after applying
the correction: **0.0 m E** (per-permit scatter ±40 m reflects the served
representative point vs polygon centroid, not systematic error). Only 3% of
served points fall within 30 m of their true boundary as served.

The geographic fingerprint confirms the datum explanation uniquely — the
offset varies regionally exactly as the NAD27 grid predicts:

| Region | n | Observed E (median) | NTv2 predicted E |
|---|---|---|---|
| West island (lon < −57.5°) | 134 | +64.1 m | +56.2 m |
| Central island | 354 | +67.0 m | +65.1 m |
| East island (lon ≥ −55°) | 477 | +73.8 m | +70.0 m |
| Labrador (lat ≥ 52°) | 148 | +43.3 m | +55.8 m |

Four regions, four different offsets, each tracking the local grid value. No
mechanism other than an untransformed datum produces this vector field. This
comparison also independently validates the bundled NTv2 lattice
(`data/nad27_shift.json`) — it is what zeroes the residual — and the permit
KMZ itself as NAD83-clean.

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

**Datum sentinel.** The correction carries one standing risk: if the province
ever fixes the server pipeline, applying the NTv2 shift would add a ~65 m
error instead of removing one. Every run therefore checks a sentinel first:
permit 151600's served point is fetched and compared against its pinned
untransformed-NAD27 position. Within 5 m → corrections proceed (state shown in
the report's datum audit). Moved → corrections are withheld for the run and
the report flags all affected sources as unverified ±75 m. Sentinel
unreachable → corrections proceed on the standing verification, flagged.

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

### dnrmaps Land_Use — third service proven NAD27-null

The Land_Use service's own published spatial reference is `NF_GNL1_NAD27`.
Its WGS84 export was tested by matching 573 identical Public Water Supply
watershed polygons (joined on WS_NUM) against the NAD83-native copy of the
same dataset on the GNL ArcGIS Online host: median offset **+66.7 m E**
(IQR 61–72 m), 0% of pairs within 30 m as served — the NTv2 signature, on
both the island (n=542, +66.8 m) and Labrador (n=31, +62.5 m). All nine
Land_Use referral layers (municipal boundaries, planning areas, PWS,
protected areas, LIL/LISA, wind reserve, specified material lands) now carry
the NTv2 correction, with query distances widened 100→200 m.

Three independent dnrmaps services (Mineral_Lands, Topographic, Land_Use)
are now proven or shown to serve untransformed NAD27 as WGS84 — a
server-pipeline defect, not a per-layer accident. The Land Use Atlas road
layers on the Crown Lands host remain the verified exception.

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

## Building-control corridors (G4 note semantics)

The Municipal Affairs building-control features are corridor *polygons*
(verified: every outer ring closed; maximum interior half-width ~400 m across
all 159 features — consistent corridor geometry, no malformed placemarks), not
lines. A site overlapping a corridor therefore correctly measures 0 m; the
report states this as "boundary lies within the mapped building control area"
rather than a misleading "line 0 m away". Corridor extents are as mapped by
Municipal Affairs and are not survey-anchored.

## Wetland screening (G6) — NFCODE legend confirmed

The FFA_LandCover layers publish a coded-value domain for NFCODE
(`NonForestCode`). Wetland classes are **BOG (Bog), WBOG (Wet Bog), TBOG
(Treed Bog)**; **SB is Soil Barren and RB is Rock Barren** — dry-ground
classes, not wetlands. G6 accordingly screens all three bog classes as
definitive (the original BOG-only query silently missed Wet Bog and Treed
Bog) and excludes the barrens, ending the earlier SB/RB advisory. The
inventory can miss small marshes and fens; reports say so.

## Tenure-overlap flag (TEN)

A boundary intersecting mapped existing quarry tenure (live permit/lease/
subordinate layers, datum-corrected, plus the boundary-polygon snapshot) is
flagged as an application-fatal conflict in its own check and in the overall
verdict stamp, with holders named. The warning states the one legitimate
exception — the applicant's own tenure (renewal/expansion) — and directs
that it be declared in the application.

## Printed map

The live WebGL map does not reflow for print media, which clipped the map
and could lose the boundary. Printing now refits the view to the screened
boundary, waits for the render to settle, captures the canvas to a static
image (map initialized with preserveDrawingBuffer), and prints that image
centered with a caption; the live map is hidden in print. Browser-menu
printing captures the current view as a fallback.

## Draw and adjust

A boundary can be drawn directly on the map (click vertices, minimum three,
Finish closes and screens) and any screened boundary can be dragged to a new
position and re-screened; the report is titled with the displacement so
adjusted runs are distinguishable from the original. Rings and measurements
are explicitly flagged stale between moving and re-screening.

## Outage behavior

A failed source can never produce a clean answer. Section G verdicts degrade
to ADVISORY when any required source fails; Section E answers are gated so a
copy-onto-the-form answer never asserts absence when the sources that would
have shown presence did not respond (the answer is replaced with NOT
SCREENABLE and the copy button suppressed); a total blackout returns an
UNVERIFIABLE overall verdict rather than a pass of any kind. Bundled
snapshots carry machine-readable dates; any snapshot older than 180 days
triggers a stale-data banner in the report (QMELs currently trip it by
design).

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

## Referral forecast — live sources and standing block (added 2026-08)

Six live sources added after a survey of the province's AGOL organization and
the dnrmaps Map_Layers service:

| id | service | note |
|---|---|---|
| npa_live | AGOL No_Quarry_Permits_Available_VIEW/2 | 6 designated areas at time of adding — one more than the bundled snapshot's 5; the NPA check now cross-checks live + snapshot |
| qmel_live | AGOL Quarry_Material_Exploration_License/3 | 38 licences live; supplements the stale 2024-10-25 snapshot |
| q_proposed | AGOL Proposed_Quarries_Boundaries_view/0 | 431 pending application boundaries; feeds the Quarries Section referral line |
| agri_rfp | AGOL AgricultureBoundaries/8 | 71 agriculture development/RFP polygons |
| tx_nalcor | dnrmaps Map_Layers/15 | Nalcor transmission lines |
| tx_canvec | dnrmaps Map_Layers/16 | CanVec transmission lines |
| fp_aop_harv / fp_fyop_harv | AGOL FFA_ForestPlanning/0 and /6 | annual and five-year plan commercial harvest blocks (7,839 FYOP blocks) |
| fp_aop_silv / fp_fyop_silv | AGOL FFA_ForestPlanning/5 and /10 | silviculture treatment areas |
| fp_oa | AGOL FFA_ForestPlanning/11 | designated forestry operating areas (3,828) |
| domestic_nf / domestic_lb | AGOL FFA_DomesticHarvestBlocks | domestic (firewood) cutting blocks |
| fmd | AGOL FFA_ForestManagementDistricts_NL/6 | context only: names the reviewing forest management district in the forestry standing entry (MD_NAME can be null; the number always renders) |

Nine Crown LandUseDetails layers were added after the owner supplied the
server's layer catalog from a browser (the build sandbox cannot reach this
host): Bowater Land Sales (8) and the departmental land-use interest layers —
Forestry (30), Wildlife (29), Nalcor Hydro and NF Power (28), Agriculture
(27), Mines and Energy (22), Tourism/Culture/Recreation (18), Federal Lands
(25), and Municipal Plan Restrictions (37). Bowater + Forestry answer the
third-party timber question: Bowater parcels trace the paper-company land
dispositions, and the report warns that title on them may sit outside
ordinary Crown tenure. Same host as crown_titles (datum verified correct as
served). Attribute schemas are browser-verified only; nameFields are a
best-guess cascade and the display name falls back to OBJECTID if none match
— owner to eyeball the first live report over known ground and correct field
names if hits render anonymously.

Datum note: tx_nalcor/tx_canvec sit on the same Map_Layers service as the
roads layer (13/14) verified correct as served; they are treated as
NAD83-equivalent by service-level pattern, not independently proven. AGOL
layers are Web Mercator native and reproject cleanly.

The forecast also gained a monuments referral (NLGN marker within 100 m →
GIS and Mapping Division; 5 m protective buffer, Lands Act s.65 — the NLGN
data was already being queried for the Survey Control section) and a standing
authorizations block listed on every report. Two entries are computed:

- **EA registration, s.33(3)** (Environmental Assessment Regulations, 2003,
  NLR 54/03): quarrying covering more than 10 ha must be registered. The
  boundary area is compared to the threshold; over 10 ha renders a flagged
  REGISTRATION REQUIRED entry. Sub-threshold reports carry the s.52
  aggregation rule (extension + existing operation exceeding the threshold
  together must register).
- **Scheduled salmon rivers, s.28**: any undertaking within 200 m of the high
  water mark of a scheduled salmon river must register regardless of size.
  Mapped watercourses within 200 m flag this conditionally; the schedule
  itself is not determinable from the map layers and the wording says so.

The remaining standing entries (water use licence, cutting/fire permits, air
pollution and waste, fuel storage registration, OHS, DFO Projects Near Water,
ECCC migratory birds, highway access, tourism, and — Labrador only —
Indigenous consultation naming Nunatsiavut, Innu Nation, and NunatuKavut) are
sourced from the departmental advice record on a comparable quarry EA
(EA 2396, Peak Pond Quarry Extension) and are advisory wording only: they
carry no verdicts and no map queries. The forestry entry goes further at the
owner's direction: it states that cleared merchantable timber is Crown timber
carrying royalty/stumpage with salvage expected, warns that third-party
licensed timber limits (including pulp-and-paper interests) are not all
publicly mapped, and names the forest management district the boundary sits
in (from the fmd layer). Planned-harvest, silviculture, operating-area, and
domestic-block overlaps are mapped referral lines, not standing wording.

Department rename: IET became Energy and Mines in late October 2025; authority
strings updated accordingly ("Energy and Mines (formerly IET)").

## Validation record

- Permit 151600 (Rose Blanche): full regression anchor. Title match <1 m;
  road distance 104.7 m measured vs ~100 m ground truth; tenure snapshot area
  2.00 ha exact; datum correction +54.5 m E as predicted.
- Batteau Barrens candidate site: three marginal failures identified
  pre-application (road 13–14 m, pond 46 m, bog 19 m), with the road correctly
  identified as the Bateau Barrens forest access road by the FFA layer.
- Committed regression suite: `node test.js` (offline: lattice, distance
  engine, correction direction, bundled loaders, corridor validity, G4
  wording, sentinel degradation) and `TEST_LIVE=1 node test.js` (adds the
  live sentinel check). 15 assertions anchored on file 71113200 / permit
  151600. Note: permit numbers renumber on renewal (this file has carried
  150616 and 151600); the file number is the stable key.
