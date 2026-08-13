# Data source inventory

Every data source evaluated for QuarryCheck: what it provides, whether it is
used, and why. Status codes: **LIVE** (queried at screen time), **BUNDLED**
(snapshot in `/data`), **BASEMAP** (display only), **OMITTED** (evaluated and
excluded), **CANDIDATE** (plausibly useful; semantics or value unverified).
Datum column: **N27** = server serves untransformed NAD27 labelled WGS84;
client-side NTv2 correction applied (see TECHNICAL.md). **OK** = verified or
pattern-consistent correct as served.

The governing principle for inclusion: a source is used if it can change a
Section E answer, a Section G verdict, or the referral forecast. Display-only
and context sources are held to a lower bar; anything that could produce a
false PASS is held to a higher one.

---

## 1. dnrmaps.gov.nl.ca — Geoscience Atlas (ArcGIS Server)

Intermittent 503s; all queries run with per-attempt timeouts and a patient
retry. Three services proven to serve untransformed NAD27 (TECHNICAL.md).

### Mineral_Lands (live tenure database) — datum N27, sentinel-guarded

| Layer | Content | Status | Use / reasoning |
|---|---|---|---|
| 0 Map Staked Claims | active mineral claims | LIVE `claims` | Mineral Lands referral: staked claims near the boundary are a tenure conflict interest |
| 5 Mineral Tenure | mineral licences/leases | LIVE `min_tenure` | same referral line |
| 6 Quarries – New Applications | pending quarry applications (points) | LIVE `q_apps` | competing-application awareness; TEN check and Quarries Section referral |
| 7 Quarries – Subordinate Permits | subordinate permits | LIVE `q_sub` | same |
| 8 Quarries – Permits | issued permits (points) | LIVE `q_permits` | same; layer also hosts the datum sentinel (permit 151600 pinned point) |
| 9 Quarries – Leases | quarry leases | LIVE `q_leases` | same |
| 1–4 Original Boundaries / Historical Claims / Cancelled / Gazetted | title history | OMITTED | historical states do not bear on acceptance; current interests covered by 0/5 |
| 10 Permits Expired Last Year | recently expired permits | CANDIDATE | a recently expired permit signals a renewal likely in flight (permits must be re-applied for within two months of expiry); could pre-warn a conflict the active layers miss. Not yet wired |
| 11 Quarries – Archive | long-expired records | OMITTED | no bearing on acceptance; noise risk in reports |

### Land_Use (referral layers) — datum N27, all corrected

| Layer | Content | Status | Use / reasoning |
|---|---|---|---|
| 0 Protected Areas Plan 2020 | protected areas | LIVE `lu_protected` | parks/protected referral |
| 1 Specified Material Lands | specified materials designations | LIVE `lu_specified` | dedicated referral line; a specified-material overlap changes what may be extracted |
| 2 LIL / 3 LISA | Labrador Inuit Lands / Settlement Area | LIVE `lu_lil` `lu_lisa` | Nunatsiavut referral; work plans required on LIL |
| 4 Canadian Protected Conserved Areas | CPCAD | LIVE `lu_cpcad` | parks/protected referral |
| 5 Public Water Supplies | PWS areas | LIVE `lu_pws` | Water Resources referral; cross-checked against the NAD83-native AGOL twin (which also proved this service's datum defect, 573 polygons) |
| 6 Municipal Boundaries | municipalities | LIVE `lu_municipal` | municipal plan governs land use inside |
| 7 Planning Areas | planning areas incl. MPAB_LINK | LIVE `lu_planning` | links the governing plan document in reports |
| 8 Wind Energy Land Reserve | wind reserve | LIVE `lu_wind` | dedicated referral line |

### Map_Layers — datum OK (verified via roads layer 13)

| Layer | Content | Status | Use / reasoning |
|---|---|---|---|
| 13 Detailed Road Network | NRN roads, 2008 vintage | LIVE `roads_dnr` | demoted to context only: datum correct but geometry outdated; Atlas 39/40 are primary for G3 |
| 14 Resource Access Roads | resource roads | LIVE `res_roads_dnr` | corroborates the G3 unnamed-road reclassification rule (≤120 m coincidence test) |
| 15 Nalcor Transmission Line | NL Hydro lines | LIVE `tx_nalcor` | utility corridor referral |
| 16 Canvec Transmission Lines | federal compilation | LIVE `tx_canvec` | same; wider coverage than 15 |
| 1–3 Drill core/holes, MODS | geology sampling, mineral occurrences | OMITTED | exploration context, no acceptance or referral bearing |
| 4–10 grids | NTS/UTM gridlines | OMITTED | cartographic furniture |
| 11–12 regional road generalizations | small-scale roads | OMITTED | superseded by 13 and Atlas 39/40 |
| 17–20 water lines | display-scale water | OMITTED | screening water comes from Topographic 12/13 and FFA inventory; these are cartographic |
| 21–24 border, contours | outline, elevation | OMITTED | no screening value |

### Topographic (1:50k NTS) — datum N27, corrected by pattern

| Layer | Content | Status | Use / reasoning |
|---|---|---|---|
| 10 Building symbols | 1:50k building points | LIVE `bldg_topo` | G2 property/structures evidence, alongside Bing footprints; both incomplete, reports say so |
| 12 Watercourse lines | streams | LIVE `topo_wline` | G5 stream counting (summarized, never itemized — predominantly dry at barrens sites) and the s.28 salmon-river conditional |
| 13 Waterbody polygons | lakes/ponds | LIVE `topo_wpoly` | G5 verdicts and E5 itemization |
| others | contours, vegetation, misc topo | OMITTED | no acceptance bearing |

Whole services omitted: **Bedrock/Surficial geology, Geochemistry,
Geophysics** (material-quality prospecting context, not acceptance
screening), **Indexes, Provincial_Base_Outline, Topo_CanMatrix,
TopographyGreyBase** (cartographic). The Topographic service's map export
endpoint doubles as the NL Topo **basemap** with per-tile NAD27 bbox shift.

---

## 2. GNL ArcGIS Online organization (services8.arcgis.com/aCyQID5qQcyrJMm2)

NAD83/Web Mercator native; fast (~0.4 s) and reliable. The organization's
catalog was surveyed in full; entries below are everything with plausible
screening value, then the notable omissions.

### Quarry tenure and prohibitions

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| No_Quarry_Permits_Available_VIEW/2 | s.5 NPA designations | LIVE `npa_live` | NPA check cross-check; live layer held 6 areas when the bundled snapshot held 5 — the live feed catches designations the snapshot misses |
| Quarry_Material_Exploration_License/3 | 38 QMELs with licensee/status/expiry | LIVE `qmel_live` | supersedes the stale 2024-10-25 snapshot for currency; snapshot retained as cross-check |
| Quarry_Permits_and_Leases (dated) | true boundary polygons + Boundary_Status | LIVE `q_agol_mirror` | Boundary_Status cross-check (Labrador "Unconfirmed/Unavailable" warning); also the ground truth that proved the Mineral_Lands datum defect (1,113 permits matched) |
| Proposed_Quarries_Boundaries_view/0 | 431 pending application boundaries | LIVE `q_proposed` | competing applications with actual polygons, not just points |

### Roads and access

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| FFA_ResourceRoads_NF/2, _LB/0 | FFA resource roads | LIVE `res_roads_nf` `res_roads_lb` | G3 reclassification corroboration |
| NRN_NL_7_0_ROADSEG/0 | NRN road segments | LIVE `roads_nrn` | demoted: only a 293-segment Labrador subset, discovered when it nearly caused a missed Route 470; retained for Labrador coverage only |
| TLH/0, CartwrightAccessRoad/0 | Trans-Labrador Hwy, Cartwright road | LIVE `road_tlh` `road_cartwright` | fill the Labrador gap the NRN subset leaves |

### Water

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| FFA_LandCover/2,4,5 (+_LB/0,2,3) | forestry-inventory streams, water lines, waterbodies | LIVE `stream_*` `wline_*` `wbody_*` | G5 primary polygons + stream counts; island/Labrador split |
| Public_Water_Supply_Areas/0 | NAD83-native PWS | LIVE `pwsa` | Water Resources referral; datum twin of lu_pws |
| Intakes_and_Wellheads/0 | intake/wellhead points | LIVE `intakes` | Water Resources referral |
| Water_Rights/0 | licensed water rights | LIVE `water_rights` | same |
| Natural_Drainage_Outside_Protected_Area/0 | drainage designations | LIVE `nat_drain` | same |
| Flood_Risk_Extents/0 | mapped flood extents | RETIRED from live use | spatial queries take 18–30 s server-side (huge floodplain polygons), longer than the retry budget; replaced by a bundled envelope snapshot (§4) |

### Wetland / land cover

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| FFA_LandCover/7 (+_LB/5) | NFCODE non-forest classes | LIVE `nonforest_*` | G6: BOG/WBOG/TBOG only (confirmed coded-value domain); SB/RB are dry barren classes, excluded by rule |

### Forestry

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| FFA_ForestPlanning/0,6 | AOP + FYOP commercial harvest blocks | LIVE `fp_aop_harv` `fp_fyop_harv` | committed timber allocations = forestry conflict referral |
| FFA_ForestPlanning/5,10 | silviculture treatment areas | LIVE `fp_aop_silv` `fp_fyop_silv` | silviculture investment = forestry conflict referral |
| FFA_ForestPlanning/11 | designated operating areas (3,828) | LIVE `fp_oa` | same |
| FFA_DomesticHarvestBlocks_NF/0, _LB/0 | domestic (firewood) blocks | LIVE `domestic_nf` `domestic_lb` | community cutting allocations referral |
| FFA_ForestManagementDistricts_NL/6 | district polygons | LIVE `fmd` | context: names the reviewing district office in the forestry advisory (MD_NAME can be null; number always renders) |
| FFA_Harvest_NF/_LB | historical cutovers | OMITTED | past harvest is not a referral conflict; would add noise |
| FFA_Wildfire, Defoliation, SBW treatment, BSFI photo year | forest health/ops | OMITTED | no permit bearing |

### Protected areas, buildings, survey

| Service | Content | Status | Use / reasoning |
|---|---|---|---|
| Provincial_Protected_Areas/0, MMNPR/0 | protected/conserved areas | LIVE `prov_protected` `mmnpr` | parks referral |
| Bing_BuildingFootprints/0 | AI-extracted footprints | LIVE `bldg_bing` | G2 structures evidence; demonstrably incomplete, reports never assert absence |
| Control_Monuments_Public/0 | NLGN monuments | LIVE `nlgn` | Survey Control table (nearest three) + GIS & Mapping Division referral (5 m buffer, Lands Act s.65) |
| AgricultureBoundaries/8 | agriculture development/RFP areas | LIVE `agri_rfp` | agriculture referral |

### Notable AGOL omissions and candidates

| Service | Content | Status | Reasoning |
|---|---|---|---|
| ILUC_InScopeAreas, ILUC_Water_Supplies | interim land use control areas (apparent) | CANDIDATE | name suggests interim land-use restrictions that could bind a site; semantics unverified — inspect before wiring |
| Proposed_ERWPP | proposed reserve/protected area (apparent) | CANDIDATE | a *proposed* protected area is exactly the kind of conflict worth flagging early; semantics unverified |
| LandslideSites | mapped landslide sites | CANDIDATE | site-hazard advisory value, not a referral; low priority |
| WLD_BigGameManagementArea | game management zones | OMITTED | hunting administration; no permit bearing |
| Dams, Municipal_Dams, Sewage_Outfalls, Electrical_Substations | point infrastructure | OMITTED | referral interests already covered at the corridor/area level; point features add noise without changing outcomes |
| Domestic well / water chemistry series (As, Fe, Mn, U…) | well water quality sampling | OMITTED | public-health sampling, not siting data |
| WaveRunup series, Coastal monitoring | coastal hazard | OMITTED | no quarry acceptance bearing; revisit only for shoreline sites |
| Climate projections, EcoRegions, elections, ferries, schools/health (Southwest series), GMD_GeoNames | context/demographics | OMITTED | no bearing |

---

## 3. Crown Land Use Atlas (gov.nl.ca/landuseatlasmaps, LandUseDetails MapServer)

Datum verified correct as served. Server rejects non-browser user agents and
is unreachable from the build environment — layers here are browser-verified
only; attribute schemas for the nine newest additions are unconfirmed
(nameFields are a best-guess cascade; hits fall back to OBJECTID display).

| Layer | Content | Status | Use / reasoning |
|---|---|---|---|
| 2 Applications for Crown Title | pending Crown applications | LIVE `crown_apps` | competing-interest referral + G1 evidence |
| 3 Crown Titles | issued titles (APPLICANT/TITLENO/TITLETYPE) | LIVE `crown_titles` | G1 primary; TITLETYPE distinguishes interest kinds |
| 8 Bowater Land Sales | paper-company land dispositions | LIVE `cl_bowater` | third-party timber/land rights: Bowater parcels trace mill-era dispositions whose title may sit outside ordinary Crown tenure |
| 30 Forestry | forestry land-use interest areas | LIVE `cl_forestry` | departmental flag layer; joins Bowater in the timber-interest referral |
| 29 Wildlife | wildlife interest areas | LIVE `cl_wildlife` | mapped complement to the not-public occurrence data |
| 28 Nalcor Hydro and NF Power | utility interest areas | LIVE `cl_hydro` | utility referral (areas, complementing the transmission lines) |
| 27 Agriculture | agriculture interest areas | LIVE `cl_agri` | agriculture referral |
| 22 Mines and Energy | department interest areas | LIVE `cl_mines` | Mineral Lands referral |
| 18 Tourism, Culture, Arts and Recreation | tourism interest areas | LIVE `cl_tourism` | tourism referral |
| 25 Federal Lands | federal parcels | LIVE `cl_federal` | provincial quarry tenure cannot issue over federal land |
| 37 Municipal Plan Restrictions | plan restriction polygons | LIVE `cl_mpr` | municipal/MPAB referral |
| 38 Protected Road Zones | PRZ polygons | LIVE `lu_prz` | 90 m protected-road check (live complement to the bundled Municipal Affairs snapshot) |
| 39/40 Primary/Secondary Roads | Atlas road network | LIVE `lu_roads_p` `lu_roads_s` | **G3 primary road source** (current geometry, ROADCLASS drives the reclassification rule) |
| 0 Control Monuments | monuments | OMITTED | duplicate; AGOL NLGN layer is richer (adjustment dates, elevations) |
| 4–7, 9–10 Expropriated / OIC / Quieting / Quit Claims / Titles to Check / Misc | title-history evidence | CANDIDATE | current operative interests flow through layers 2/3; these matter for title research on contested ground (e.g. inside Bowater areas). Worth wiring if title-chain questions recur |
| 13/14 Indigenous 1 / Indigenous 2 | island-side Indigenous areas (apparent) | CANDIDATE | semantics unknown (possibly reserve or asserted-interest areas); Labrador consultation is handled, island-side is not — verify in browser and wire if real |
| 15–17, 19–21, 23–24 Water Resources / Service NL / T&I / Parks / Natural Areas / Other / Lands / Municipal Affairs | departmental interest areas | OMITTED (17 CANDIDATE) | duplicative of existing dedicated checks, except 17 Transportation and Infrastructure, which could ground the highway-access advisory in mapped data |
| 26 Aquaculture | aquaculture interest areas | OMITTED | marginal for quarries; revisit for coastal sites |
| 31–35 Flood Risk | flood extents | OMITTED | flood is screened from the bundled envelope snapshot (§4) |
| 36, 41 Admin boundaries, Places | reference | OMITTED | no bearing |

The same host's **NLImagery** tile service is one of the four basemaps.

---

## 4. Bundled snapshots (`/data`)

| File | Upstream | Status | Use / reasoning |
|---|---|---|---|
| protected_roads.geojson | Municipal Affairs KMZ (2026-08-11) | BUNDLED | 429 protected roads / 853 polygons; G3 protected-road identification where the live PRZ layer is thin |
| building_control.geojson | Municipal Affairs KMZ (2026-08-11) | BUNDLED | G4 corridor polygons; overlap reported as containment, never "line 0 m away" |
| no_permit_areas.geojson | Energy and Mines quarries site KMZ (2026-08-13) | BUNDLED | NPA cross-check against the live layer; live layer already ahead of it (6 vs 5 areas) |
| qmels.geojson | Energy and Mines quarries site KMZ (dated 2024-10-25) | BUNDLED (STALE) | retained only as cross-check under a stale banner; live QMEL layer is current |
| quarry_tenure_snapshot.geojson | Energy and Mines quarries site KMZ (2026-08-13) | BUNDLED | 1,340 true boundary polygons; TEN overlap check and the regression anchor's ground truth |
| flood_extents.geojson | AGOL Flood_Risk_Extents, envelope snapshot (2026-08-13) | BUNDLED | 357 study-area bounding envelopes with study names and report URLs; conservative by design (a hit means a study exists in the vicinity, never a false clear). Full extents remain authoritative with Water Resources |
| nad27_shift.json | derived from the NRCan NTv2 grid (0.5° lattice) | BUNDLED | the datum correction itself; <1 m interpolation error, validated against permit 151600 and 1,113-permit province-wide matching |

Snapshots carry dates; anything older than 180 days trips a stale banner.

## 5. Basemaps (display only)

| Basemap | Source | Reasoning |
|---|---|---|
| Esri World Topo Map | services.arcgisonline.com | default — matches the NL Land Use Atlas's own default; there is no official provincial raster basemap |
| Esri World Imagery + NLImagery overlay | Esri + Crown atlas tiles | imagery view as the Atlas presents it |
| OpenStreetMap | OSM tiles | familiar reference |
| NL provincial topo + roads | dnrmaps Topographic export | provincial cartography; per-tile bbox shift applies the NAD27 correction |

## 6. Reference documents and validation sources (not map services)

| Source | Use |
|---|---|
| Form MLD-Q-QP-A (rev 2025/10/31) | the screening target: Sections E and G acceptance criteria |
| Environmental Assessment Regulations, 2003 (NLR 54/03) | computed rules: s.33(3) 10 ha registration threshold, s.28 scheduled salmon rivers 200 m, s.52 aggregation |
| EA 2396 departmental advice record (Peak Pond Quarry Extension) | wording source for the standing authorizations block |
| NRCan NTv2 transformation grid | validation of the bundled shift lattice |
| Permit 151600 / file 71113200 records | regression anchor and datum sentinel ground truth |

---

## Open verification items

- Crown layers 8/18/22/25/27/28/29/30/37: field names browser-verified only —
  confirm a live report shows named hits, correct the nameFields cascade if not.
- CANDIDATE rows above (ILUC, Proposed_ERWPP, Mineral_Lands/10, Crown 4–10,
  Crown 13/14, Crown 17, LandslideSites): inspect semantics before wiring.
