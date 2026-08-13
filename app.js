/* QuarryCheck engine: sources, queries, checks.
   Rules: NL Quarry Permit/Lease Application form MLD-Q-QP-A rev 2025/10/31, Sections E & G.
   No claim exceeds the data. Every result carries source + timestamp. */

'use strict';

const DNR = 'https://dnrmaps.gov.nl.ca/arcgis/rest/services/GeoAtlas';
const AGOL = 'https://services8.arcgis.com/aCyQID5qQcyrJMm2/arcgis/rest/services';
const CROWN = 'https://www.gov.nl.ca/landuseatlasmaps/rest/services/LandUseDetails/MapServer';

/* Every remote source queried once, in parallel, at queryDist metres around the boundary.
   nameFields: first non-empty attribute wins for display. */
const SOURCES = [
  // G1 private property (Crown Lands server; authoritative for titles)
  { id:'crown_titles',   url:`${CROWN}/3/query`,  queryDist:1000, nameFields:['APPLICANT','TITLENO','TITLETYPE','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Issued Crown titles' },
  { id:'crown_apps',     url:`${CROWN}/2/query`,  queryDist:1000, nameFields:['APPLICANT','TITLENO','TITLETYPE','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Applications for Crown title' },

  // G2 trails / resource access (mapped only; cabin trails are not mapped anywhere)
  { id:'res_roads_dnr',  url:`${DNR}/Map_Layers/MapServer/14/query`, queryDist:1000, nameFields:['ROAD_NAME','ROAD_TYPE','OBJECTID'], authority:'dnrmaps (Geoscience Atlas)', note:'Resource access roads' },
  { id:'res_roads_lb',   url:`${AGOL}/FFA_ResourceRoads_LB/FeatureServer/0/query`, queryDist:1000, nameFields:['ROAD_NAME','NAME','OBJECTID'], authority:'GNL ArcGIS Online (FFA)', note:'Labrador resource roads' },
  { id:'res_roads_nf',   url:`${AGOL}/FFA_ResourceRoads_NF/FeatureServer/2/query`, queryDist:1000, nameFields:['ROAD_NAME','NAME','ROADNAME','OBJECTID'], authority:'GNL ArcGIS Online (FFA)', note:'Island resource roads (FFA)' },

  // G3 roads: Land Use Atlas road layers are PRIMARY (current + owner-verified against imagery
  // at two sites, 2026-08-12). dnrmaps Detailed Road Network demoted: 2008-vintage NRN import,
  // found offset/stale at both test sites; retained for E3 access context only.
  { id:'lu_roads_p',     url:`${CROWN}/39/query`, queryDist:1000, nameFields:['ROADNAME','STREETNAME','RTENAME1EN','RTNUMBER1','NAME','ROADCLASS','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Primary roads' },
  { id:'lu_roads_s',     url:`${CROWN}/40/query`, queryDist:1000, nameFields:['ROADNAME','STREETNAME','RTENAME1EN','RTNUMBER1','NAME','ROADCLASS','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Secondary roads' },
  // G4 live layer (bundled KMZ snapshot retained as fallback)
  { id:'lu_prz',         url:`${CROWN}/38/query`, queryDist:200, nameFields:['NAME','ROAD','ROADNAME','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Protected Road Zones (live)' },

  { id:'roads_dnr',      url:`${DNR}/Map_Layers/MapServer/13/query`, queryDist:1000, nameFields:['L_STNAME_C','RTENAME1EN','RTNUMBER1','ROADCLASS','OBJECTID'], authority:'dnrmaps (Geoscience Atlas)', note:'Detailed road network (NRN)' },
  { id:'roads_nrn',      url:`${AGOL}/NRN_NL_7_0_ROADSEG/FeatureServer/0/query`, queryDist:1000, nameFields:['L_STNAME_C','RTENAME1EN','RTNUMBER1','ROADCLASS','OBJECTID'], authority:'GNL ArcGIS Online', note:'NRN subset (Labrador)' },
  { id:'road_tlh',       url:`${AGOL}/TLH/FeatureServer/0/query`, queryDist:1000, nameFields:['RTENAME1EN','RTNUMBER1','OBJECTID'], authority:'GNL ArcGIS Online', note:'Trans-Labrador Highway' },
  { id:'road_cartwright',url:`${AGOL}/CartwrightAccessRoad/FeatureServer/0/query`, queryDist:1000, nameFields:['NAME','OBJECTID'], authority:'GNL ArcGIS Online', note:'Cartwright access road' },

  // G5 water: island (FFA_LandCover) + Labrador (FFA_LandCover_LB)
  { id:'stream_isl',     url:`${AGOL}/FFA_LandCover/FeatureServer/2/query`,  queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Stream (island)' },
  { id:'wline_isl',      url:`${AGOL}/FFA_LandCover/FeatureServer/4/query`,  queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Waterbody line (island)' },
  { id:'wbody_isl',      url:`${AGOL}/FFA_LandCover/FeatureServer/5/query`,  queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Waterbody (island)' },
  { id:'stream_lb',      url:`${AGOL}/FFA_LandCover_LB/FeatureServer/0/query`, queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Stream (Labrador)' },
  { id:'wline_lb',       url:`${AGOL}/FFA_LandCover_LB/FeatureServer/2/query`, queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Waterbody line (Labrador)' },
  { id:'wbody_lb',       url:`${AGOL}/FFA_LandCover_LB/FeatureServer/3/query`, queryDist:300, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Waterbody (Labrador)' },

  // G5 corroboration: 1:50k NTS topo hydro (dnrmaps)
  { id:'topo_wline', datum:'nad27null',     url:`${DNR}/Topographic/MapServer/12/query`, queryDist:300, nameFields:['OBJECTID'], authority:'dnrmaps (1:50k NTS topo)', note:'Watercourse lines (1:50k)' },
  { id:'topo_wpoly', datum:'nad27null',     url:`${DNR}/Topographic/MapServer/13/query`, queryDist:300, nameFields:['OBJECTID'], authority:'dnrmaps (1:50k NTS topo)', note:'Waterbody polygons (1:50k)' },

  // G6 wetland (Non-Forest polygons carrying NFCODE)
  { id:'nonforest_isl',  url:`${AGOL}/FFA_LandCover/FeatureServer/7/query`,  queryDist:200, where:"NFCODE IN ('BOG','WBOG','TBOG')", nameFields:['NFCODE'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Wetland classes: Bog, Wet Bog, Treed Bog (island)' },
  { id:'nonforest_lb',   url:`${AGOL}/FFA_LandCover_LB/FeatureServer/5/query`, queryDist:200, where:"NFCODE IN ('BOG','WBOG','TBOG')", nameFields:['NFCODE'], authority:'GNL ArcGIS Online (FFA forestry inventory)', note:'Wetland classes: Bog, Wet Bog, Treed Bog (Labrador)' },

  // E2/E6 quarry tenure (dnrmaps authoritative)
  { id:'q_apps', datum:'nad27null',         url:`${DNR}/Mineral_Lands/MapServer/6/query`, queryDist:500, nameFields:['COMPANY','FILENUMBER','PERMIT_ID'], authority:'dnrmaps (live tenure database)', note:'Quarry applications (point locations)' },
  { id:'q_sub', datum:'nad27null',          url:`${DNR}/Mineral_Lands/MapServer/7/query`, queryDist:500, nameFields:['COMPANY','FILENUMBER','PERMIT_ID'], authority:'dnrmaps (live tenure database)', note:'Subordinate quarry permits' },
  { id:'q_permits', datum:'nad27null',      url:`${DNR}/Mineral_Lands/MapServer/8/query`, queryDist:500, nameFields:['COMPANY','FILENUMBER','PERMIT_ID'], authority:'dnrmaps (live tenure database)', note:'Quarry permits' },
  { id:'q_leases', datum:'nad27null',       url:`${DNR}/Mineral_Lands/MapServer/9/query`, queryDist:500, nameFields:['COMPANY','FILENUMBER','PERMIT_ID'], authority:'dnrmaps (live tenure database)', note:'Quarry leases' },
  { id:'q_agol_mirror',  url:`${AGOL}/Quarry_Permits_and_Leases___July_27_2026_/FeatureServer/0/query`, queryDist:500, nameFields:['COMPANY','FILENUMBER'], authority:'GNL ArcGIS Online (dated mirror)', note:'Boundary_Status cross-check only', optional:true },
  { id:'npa_live',       url:`${AGOL}/No_Quarry_Permits_Available_VIEW/FeatureServer/2/query`, queryDist:200, nameFields:['Location','Description','OBJECTID'], authority:'GNL ArcGIS Online (Energy and Mines)', note:'No Permits Available areas, s.5 Quarry Materials Regulations (live layer)' },
  { id:'qmel_live',      url:`${AGOL}/Quarry_Material_Exploration_License/FeatureServer/3/query`, queryDist:500, nameFields:['Licensee','Lic_Num','File_Num','Status','Material'], authority:'GNL ArcGIS Online (Energy and Mines)', note:'Quarry Material Exploration Licences (live layer)' },
  { id:'q_proposed',     url:`${AGOL}/Proposed_Quarries_Boundaries_view/FeatureServer/0/query`, queryDist:500, nameFields:['Applicant','FILENUMBER','QNUM','ApplicationType'], authority:'GNL ArcGIS Online (Energy and Mines)', note:'Proposed quarry boundaries (pending applications)' },
  { id:'agri_rfp',       url:`${AGOL}/AgricultureBoundaries/FeatureServer/8/query`, queryDist:200, nameFields:['AOI_NAME','PolygonID','OBJECTID'], authority:'GNL ArcGIS Online (agriculture)', note:'Agriculture development / RFP areas' },
  { id:'tx_nalcor',      url:`${DNR}/Map_Layers/MapServer/15/query`, queryDist:200, nameFields:['TL_ID','OBJECTID'], authority:'dnrmaps (Geoscience Atlas)', note:'NL Hydro (Nalcor) transmission lines' },
  { id:'tx_canvec',      url:`${DNR}/Map_Layers/MapServer/16/query`, queryDist:200, nameFields:['PROVIDER','TYPE','OBJECTID'], authority:'dnrmaps (Geoscience Atlas)', note:'CanVec transmission lines (federal compilation)' },
  { id:'fp_aop_harv',    url:`${AGOL}/FFA_ForestPlanning/FeatureServer/0/query`, queryDist:200, nameFields:['AOP_ID','OBJECTID'], authority:'GNL ArcGIS Online (forestry planning)', note:'Annual operating plan: commercial harvest blocks' },
  { id:'fp_fyop_harv',   url:`${AGOL}/FFA_ForestPlanning/FeatureServer/6/query`, queryDist:200, nameFields:['AOP_ID','OBJECTID'], authority:'GNL ArcGIS Online (forestry planning)', note:'Five-year operating plan: commercial harvest blocks' },
  { id:'fp_aop_silv',    url:`${AGOL}/FFA_ForestPlanning/FeatureServer/5/query`, queryDist:200, nameFields:['TREAT_TYPE','AOP_ID','OBJECTID'], authority:'GNL ArcGIS Online (forestry planning)', note:'Annual operating plan: silviculture treatment areas' },
  { id:'fp_fyop_silv',   url:`${AGOL}/FFA_ForestPlanning/FeatureServer/10/query`, queryDist:200, nameFields:['TREAT_TYPE','AOP_ID','OBJECTID'], authority:'GNL ArcGIS Online (forestry planning)', note:'Five-year operating plan: silviculture treatment areas' },
  { id:'fp_oa',          url:`${AGOL}/FFA_ForestPlanning/FeatureServer/11/query`, queryDist:200, nameFields:['OA_ID','SUBAREA','YEAR','OBJECTID'], authority:'GNL ArcGIS Online (forestry planning)', note:'Designated forestry operating areas' },
  { id:'domestic_nf',    url:`${AGOL}/FFA_DomesticHarvestBlocks_NF/FeatureServer/0/query`, queryDist:200, nameFields:['DISTRICT','ZONE','SPECIES','OBJECTID'], authority:'GNL ArcGIS Online (forestry)', note:'Domestic harvest blocks (island)' },
  { id:'domestic_lb',    url:`${AGOL}/FFA_DomesticHarvestBlocks_LB/FeatureServer/0/query`, queryDist:200, nameFields:['DISTRICT','ZONE','SPECIES','OBJECTID'], authority:'GNL ArcGIS Online (forestry)', note:'Domestic harvest blocks (Labrador)' },
  { id:'fmd',            url:`${AGOL}/FFA_ForestManagementDistricts_NL/FeatureServer/6/query`, queryDist:0, nameFields:['MD_NAME','MD_NUM'], authority:'GNL ArcGIS Online (forestry)', note:'Forest management district (context: names the reviewing district office)' },
  /* Crown LandUseDetails department-interest layers. Same host as crown_titles
     (datum verified correct as served); schemas browser-verified only — the
     build sandbox cannot reach this server, so nameFields are a best-guess
     cascade and the first populated field wins. */
  { id:'cl_bowater',     url:`${CROWN}/8/query`,  queryDist:200, nameFields:['NAME','DESCRIPTION','TITLENO','TITLETYPE','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Bowater land sales (historical paper-company land dispositions)' },
  { id:'cl_forestry',    url:`${CROWN}/30/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Forestry land-use interest areas (departmental flag layer)' },
  { id:'cl_wildlife',    url:`${CROWN}/29/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Wildlife land-use interest areas (departmental flag layer)' },
  { id:'cl_hydro',       url:`${CROWN}/28/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Nalcor Hydro and NF Power land-use interest areas' },
  { id:'cl_agri',        url:`${CROWN}/27/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Agriculture land-use interest areas (Crown flag layer)' },
  { id:'cl_mines',       url:`${CROWN}/22/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Mines and Energy land-use interest areas' },
  { id:'cl_tourism',     url:`${CROWN}/18/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Tourism, Culture, Arts and Recreation land-use interest areas' },
  { id:'cl_federal',     url:`${CROWN}/25/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','DEPARTMENT','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Federal lands' },
  { id:'cl_mpr',         url:`${CROWN}/37/query`, queryDist:200, nameFields:['NAME','DESCRIPTION','MUNICIPALI','LABEL','OBJECTID'], authority:'Crown Lands (Land Use Atlas)', note:'Municipal plan restrictions' },

  // Mineral tenure / claims (referral)
  { id:'claims', datum:'nad27null', /*+shift margin*/         url:`${DNR}/Mineral_Lands/MapServer/0/query`, queryDist:200, nameFields:['LICENCE','CLIENT','OBJECTID'], authority:'dnrmaps (live tenure database)', note:'Map staked claims' },
  { id:'min_tenure', datum:'nad27null',     url:`${DNR}/Mineral_Lands/MapServer/5/query`, queryDist:200, nameFields:['TENURE_ID','CLIENT','OBJECTID'], authority:'dnrmaps (live tenure database)', note:'Mineral tenure' },

  // Land_Use referral layers (dnrmaps)
  { id:'lu_protected',   datum:'nad27null', url:`${DNR}/Land_Use/MapServer/0/query`, queryDist:200, nameFields:['NAME','AREA_NAME','OBJECTID'], authority:'dnrmaps', note:'Protected Areas Plan 2020' },
  { id:'lu_specified',   datum:'nad27null', url:`${DNR}/Land_Use/MapServer/1/query`, queryDist:200, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Specified material lands' },
  { id:'lu_lil',         datum:'nad27null', url:`${DNR}/Land_Use/MapServer/2/query`, queryDist:200, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Labrador Inuit Lands' },
  { id:'lu_lisa',        datum:'nad27null', url:`${DNR}/Land_Use/MapServer/3/query`, queryDist:200, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Labrador Inuit Settlement Area' },
  { id:'lu_cpcad',       datum:'nad27null', url:`${DNR}/Land_Use/MapServer/4/query`, queryDist:200, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Canadian protected/conserved areas' },
  { id:'lu_pws',         datum:'nad27null', url:`${DNR}/Land_Use/MapServer/5/query`, queryDist:200, nameFields:['NAME','PWS_NAME','OBJECTID'], authority:'dnrmaps', note:'Public water supplies' },
  { id:'lu_municipal',   datum:'nad27null', url:`${DNR}/Land_Use/MapServer/6/query`, queryDist:200, nameFields:['NAME','MUNICIPALI','OBJECTID'], authority:'dnrmaps', note:'Municipal boundaries' },
  { id:'lu_planning',    datum:'nad27null', url:`${DNR}/Land_Use/MapServer/7/query`, queryDist:200, nameFields:['MUNICIPALI','OBJECTID'], authority:'dnrmaps', note:'Planning areas (MPAB_LINK to plan)' },
  { id:'lu_wind',        datum:'nad27null', url:`${DNR}/Land_Use/MapServer/8/query`, queryDist:200, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Wind energy land reserve' },

  // Water Resources (AGOL is authoritative for these; WRMD publisher)
  { id:'pwsa',           url:`${AGOL}/Public_Water_Supply_Areas/FeatureServer/0/query`, queryDist:100, nameFields:['NAME','PWS_NAME','OBJECTID'], authority:'GNL ArcGIS Online (WRMD)', note:'Public water supply areas' },
  { id:'intakes',        url:`${AGOL}/Intakes_and_Wellheads/FeatureServer/0/query`, queryDist:1000, nameFields:['NAME','TYPE','OBJECTID'], authority:'GNL ArcGIS Online (WRMD)', note:'Intakes and wellheads' },
  { id:'water_rights',   url:`${AGOL}/Water_Rights/FeatureServer/0/query`, queryDist:1000, nameFields:['NAME','HOLDER','OBJECTID'], authority:'GNL ArcGIS Online (WRMD)', note:'Water rights' },
  { id:'nat_drain',      url:`${AGOL}/Natural_Drainage_Outside_Protected_Area/FeatureServer/0/query`, queryDist:100, nameFields:['NAME','OBJECTID'], authority:'GNL ArcGIS Online (WRMD)', note:'Natural drainage outside PWSA' },
  { id:'flood',          url:`${AGOL}/Flood_Risk_Extents/FeatureServer/0/query`, queryDist:100, nameFields:['COMMUNITY','NAME','OBJECTID'], authority:'GNL ArcGIS Online (WRMD)', note:'Flood risk extents' },

  // Protected areas (AGOL)
  { id:'prov_protected', url:`${AGOL}/Provincial_Protected_Areas/FeatureServer/0/query`, queryDist:100, nameFields:['NAME','PROTECTED_AREA_NAME','OBJECTID'], authority:'GNL ArcGIS Online', note:'Provincial protected areas' },
  { id:'mmnpr',          url:`${AGOL}/MMNPR/FeatureServer/0/query`, queryDist:100, nameFields:['NAME','OBJECTID'], authority:'GNL ArcGIS Online', note:'Mealy Mountains NPR' },

  // E4/E6 structures and lines
  { id:'bldg_bing',      url:`${AGOL}/Bing_BuildingFootprints/FeatureServer/0/query`, queryDist:2000, nameFields:['OBJECTID'], authority:'GNL ArcGIS Online (Bing-derived)', note:'Building footprints (AI-extracted; gaps expected)' },
  { id:'bldg_topo', datum:'nad27null',      url:`${DNR}/Topographic/MapServer/10/query`, queryDist:2000, nameFields:['ENTITY_CLA','ATTRIBUTES','OBJECTID'], authority:'dnrmaps (1:50k topo)', note:'Building symbol points' },
  { id:'tx_nalcor',      url:`${DNR}/Map_Layers/MapServer/15/query`, queryDist:300, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'Nalcor transmission line' },
  { id:'tx_canvec',      url:`${DNR}/Map_Layers/MapServer/16/query`, queryDist:300, nameFields:['NAME','OBJECTID'], authority:'dnrmaps', note:'CanVec transmission lines' },
];

/* NL Geodetic Network control monuments (reference layer, never a conflict) */
const NLGN_SOURCE = { id:'nlgn', url:`${AGOL}/Control_Monuments_Public/FeatureServer/0/query`,
  queryDist:5000, nameFields:['number'], authority:'GNL ArcGIS Online (Geodetic Surveys)',
  note:'NL Geodetic Network control monuments' };

/* Bundled snapshots (no live source exists / hand-maintained upstream) */
const BUNDLED = [
  { id:'protected_roads', nameFields:['name'], path:'data/protected_roads.geojson', queryDist:200, snapshot:'2026-08-11',
    authority:'Municipal Affairs KMZ, snapshot 2026-08-11', note:'Protected Road zoning polygons (429 roads, 853 polygons)' },
  { id:'building_control', nameFields:['name'], path:'data/building_control.geojson', queryDist:200, snapshot:'2026-08-11',
    authority:'Municipal Affairs KMZ, snapshot 2026-08-11', note:'Building control areas (corridor polygons) along protected roads' },
  { id:'no_permit_areas', nameFields:['name'], path:'data/no_permit_areas.geojson', queryDist:200, snapshot:'2026-08-13',
    authority:'Energy and Mines (formerly IET) quarries site KMZ, snapshot 2026-08-13', note:'No Permits Available areas, s.5 Quarry Materials Regulations (5 designated areas). Listing is province-described work-in-progress; absence of a polygon is not proof none exists.' },
  { id:'qmels', nameFields:['name'], path:'data/qmels.geojson', queryDist:500, snapshot:'2024-10-25',
    authority:'Energy and Mines (formerly IET) quarries site KMZ, dated 2024-10-25 (STALE: many licences since expired or issued)', note:'Quarry Materials Exploration Licences' },
  { id:'q_snapshot', nameFields:['name'], path:'data/quarry_tenure_snapshot.geojson', queryDist:500, snapshot:'2026-08-13',
    authority:'Energy and Mines (formerly IET) quarries site KMZ, snapshot 2026-08-13; datum-verified against permit 151600 (104.7 m to Route 470 vs ~100 m ground truth, area 2.00 ha exact)', note:'Quarry permit/lease boundary polygons (1,340)' },
];

/* ---------------- geometry helpers (require turf global or module) ---------------- */

function getTurf() {
  if (typeof turf !== 'undefined') return turf;
  if (typeof require !== 'undefined') return require('@turf/turf');
  throw new Error('turf not available');
}

function toLineFeatures(f) {
  const T = getTurf();
  const g = f.geometry ? f.geometry : f;
  const t = g.type;
  if (t === 'Point' || t === 'MultiPoint') return null;
  if (t === 'LineString') return [T.feature(g)];
  if (t === 'MultiLineString') return g.coordinates.map(c => T.lineString(c));
  if (t === 'Polygon' || t === 'MultiPolygon') {
    const out = [];
    const line = T.polygonToLine(T.feature(g));
    const push = ft => { if (ft.geometry.type === 'LineString') out.push(ft);
      else ft.geometry.coordinates.forEach(c => out.push(T.lineString(c))); };
    if (line.type === 'FeatureCollection') line.features.forEach(push); else push(line);
    return out;
  }
  return null;
}

/* Minimum distance in metres between two GeoJSON features. 0 if they intersect. */
function minDistanceMeters(a, b) {
  const T = getTurf();
  try { if (T.booleanIntersects(a, b)) return 0; } catch (e) { /* fall through */ }
  const ptsA = T.explode(a).features, ptsB = T.explode(b).features;
  const linesA = toLineFeatures(a), linesB = toLineFeatures(b);
  let min = Infinity;
  if (linesB) for (const p of ptsA) for (const l of linesB)
    min = Math.min(min, T.pointToLineDistance(p, l, { units:'meters' }));
  if (linesA) for (const p of ptsB) for (const l of linesA)
    min = Math.min(min, T.pointToLineDistance(p, l, { units:'meters' }));
  if (!linesA && !linesB) for (const p of ptsA) for (const q of ptsB)
    min = Math.min(min, T.distance(p, q, { units:'meters' }));
  return min;
}

/* Compass direction from boundary centroid to a feature's nearest vertex. */
function directionFrom(boundary, feature) {
  const T = getTurf();
  const c = T.centroid(boundary);
  const pts = T.explode(feature).features;
  let best = pts[0], bd = Infinity;
  for (const p of pts) { const d = T.distance(c, p); if (d < bd) { bd = d; best = p; } }
  const brg = (T.bearing(c, best) + 360) % 360;
  const dirs = ['N','NE','E','SE','S','SW','W','NW','N'];
  return dirs[Math.round(brg / 45)];
}

function featureName(f, nameFields) {
  const p = f.properties || {};
  for (const k of nameFields || []) {
    if (p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== '') {
      const v = String(p[k]).trim();
      if (/^(unknown|none)$/i.test(v)) continue;
      if (k === 'OBJECTID') return `feature #${v}`;
      if (k === 'FILENUMBER') return `file ${v}`;
      if (k === 'NFCODE') return `NFCODE ${v}`;
      if (k === 'ROADCLASS') return `unnamed ${v.toLowerCase()} road`;
      return v;
    }
  }
  return 'unnamed feature';
}

/* Rough Labrador test for tenure boundary-status caution. */
function inLabrador(boundary) {
  const T = getTurf();
  const [lon, lat] = T.centroid(boundary).geometry.coordinates;
  return lat > 52.0 || (lat > 51.3 && lon < -57.05);
}

/* ---------------- NAD27 null-transform correction ----------------
   The dnrmaps tenure database (quarries, claims, mineral tenure) serves NAD27
   coordinates labelled as WGS84 with no datum transformation applied — verified
   2026-08-11 against permit 151600: served point matches a raw no-shift inverse
   projection of its recorded NAD27 UTM coordinates to 0.0 m. True NAD27->NAD83
   shift in NL is 52-74 m (NRCan NTv2). Sources flagged datum:'nad27null' get
   corrected client-side via a bundled 0.5-degree NTv2 lattice (<1 m interp error). */
let _shiftLattice = null;
async function loadShiftLattice(fetchFn) {
  if (_shiftLattice) return _shiftLattice;
  try {
    const r = await fetchFn('data/nad27_shift.json');
    _shiftLattice = await r.json();
  } catch (e) { _shiftLattice = { error: String(e) }; }
  return _shiftLattice;
}
function nad27shift(lon, lat) {
  const L = _shiftLattice;
  if (!L || L.error) return null;
  const fx = (lon - L.lon0) / L.step, fy = (lat - L.lat0) / L.step;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= L.nx - 1 || j >= L.ny - 1) return null;
  const u = fx - i, v = fy - j;
  const g = (arr, jj, ii) => { const x = arr[jj][ii]; return x === null ? null : x / L.scale; };
  const c = [g(L.dlon,j,i), g(L.dlon,j,i+1), g(L.dlon,j+1,i), g(L.dlon,j+1,i+1),
             g(L.dlat,j,i), g(L.dlat,j,i+1), g(L.dlat,j+1,i), g(L.dlat,j+1,i+1)];
  if (c.some(x => x === null)) return null;
  return [ c[0]*(1-u)*(1-v)+c[1]*u*(1-v)+c[2]*(1-u)*v+c[3]*u*v,
           c[4]*(1-u)*(1-v)+c[5]*u*(1-v)+c[6]*(1-u)*v+c[7]*u*v ];
}
function correctNad27Geometry(geom) {
  const fix = c => { const s = nad27shift(c[0], c[1]); return s ? [c[0]+s[0], c[1]+s[1]] : c; };
  const walk = x => (typeof x[0] === 'number') ? fix(x) : x.map(walk);
  return { type: geom.type, coordinates: walk(geom.coordinates) };
}

/* ---------------- datum sentinel ----------------
   Guards the NAD27 correction against the province silently fixing the server.
   Reference: permit 151600, whose served point is proven equal to the raw
   no-shift inverse of its recorded NAD27 UTM (TECHNICAL.md, both proofs).
   If the served point ever moves off this pinned value, the service datum has
   changed and applying the NTv2 shift would ADD ~65 m of error instead of
   removing it. Tripped => corrections withheld for this run, flagged in the
   report. Unreachable => corrections proceed (status quo), flagged as such. */
const DATUM_SENTINEL = {
  url: 'https://dnrmaps.gov.nl.ca/arcgis/rest/services/GeoAtlas/Mineral_Lands/MapServer/8/query?where=PERMIT_ID%3D151600&outFields=PERMIT_ID&outSR=4326&f=geojson',
  expected: [-58.75217940509539, 47.608816978369184], /* as served 2026-08-13 == raw NAD27, no transform */
  tolMeters: 5,
};
let _sentinelState = { state: 'unchecked' };
let _sentinelPromise = null;
function datumSentinelStatus() { return _sentinelState; }
/* Timed fetch: aborts a request that has not answered within ms.
   Generous on purpose — dnrmaps has been observed answering successfully at
   ~9 s under load; the point is to cut off 15 s+ hangs-to-503, not slow wins. */
const QUERY_TIMEOUT_1 = 10000; /* first attempt */
const QUERY_TIMEOUT_2 = 20000; /* retry: patient, so a slow server can still succeed */
async function timedFetch(fetchFn, url, opts, ms) {
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    return await fetchFn(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
  } catch (e) {
    if (ctl && ctl.signal.aborted) throw new Error(`no response within ${ms / 1000} s`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function checkDatumSentinel(fetchFn) {
  if (_sentinelPromise) return _sentinelPromise;
  _sentinelPromise = (async () => {
    try {
      const r = await timedFetch(fetchFn, DATUM_SENTINEL.url, {}, QUERY_TIMEOUT_2);
      const d = await r.json();
      const f = d.features && d.features[0];
      let c = null;
      if (f && f.geometry) c = f.geometry.coordinates || (f.geometry.x !== undefined ? [f.geometry.x, f.geometry.y] : null);
      if (!c) throw new Error('sentinel permit 151600 not found in service response');
      const [ex, ey] = DATUM_SENTINEL.expected;
      const dx = (c[0] - ex) * Math.cos(ey * Math.PI / 180) * 111320;
      const dy = (c[1] - ey) * 110540;
      const off = Math.hypot(dx, dy);
      _sentinelState = off <= DATUM_SENTINEL.tolMeters
        ? { state: 'confirmed', offsetMeters: off, checked: new Date().toISOString() }
        : { state: 'tripped', offsetMeters: off, checked: new Date().toISOString(),
            detail: `Served sentinel point moved ${off.toFixed(1)} m off its pinned NAD27 value; the service datum appears to have changed. NAD27 corrections WITHHELD this run pending re-verification.` };
    } catch (e) {
      _sentinelState = { state: 'unavailable', error: String(e.message || e), checked: new Date().toISOString() };
    }
    return _sentinelState;
  })();
  return _sentinelPromise;
}

/* ---------------- ArcGIS query ---------------- */

function esriRingsFromBoundary(boundary) {
  const g = boundary.geometry || boundary;
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  throw new Error('boundary must be Polygon or MultiPolygon');
}

async function queryArcgis(src, boundary, fetchFn) {
  const T = getTurf();
  let simple = boundary;
  try { simple = T.simplify(boundary, { tolerance: 0.00002, highQuality: false }); } catch (e) {}
  const body = new URLSearchParams({
    geometry: JSON.stringify({ rings: esriRingsFromBoundary(simple), spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPolygon',
    inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(src.queryDist), units: 'esriSRUnit_Meter',
    where: src.where || '1=1',
    outFields: '*', geometryPrecision: '5', resultRecordCount: '250', f: 'geojson',
  });
  const started = new Date();
  const attempt = async (timeoutMs) => {
    const resp = await timedFetch(fetchFn, src.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, timeoutMs);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'server error');
    return data;
  };
  try {
    let data;
    try { data = await attempt(QUERY_TIMEOUT_1); }
    catch (e1) {
      /* jittered pause so parallel retries do not re-slam the host in unison */
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
      data = await attempt(QUERY_TIMEOUT_2);
    }
    // Some ArcGIS Servers ignore f=geojson and return esriJSON; detect and convert points minimally.
    let features = data.features || [];
    if (features.length && !features[0].geometry && features[0].attributes) {
      features = features.map(f => esriToGeojson(f));
    }
    if (src.datum === 'nad27null') {
      const sentinel = await checkDatumSentinel(fetchFn);
      if (sentinel.state === 'tripped') {
        features = features.map(f => f.geometry
          ? { ...f, properties: { ...(f.properties||{}), _datumCorrectionWithheld: sentinel.detail } }
          : f);
      } else {
        await loadShiftLattice(fetchFn);
        features = features.map(f => f.geometry
          ? { ...f, properties: { ...(f.properties||{}), _datumCorrected: 'NAD27->NAD83 NTv2 shift applied (server serves untransformed NAD27; sentinel-verified this run)' }, geometry: correctNad27Geometry(f.geometry) }
          : f);
      }
    }
    return { id: src.id, ok: true, features, queried: started.toISOString(), src };
  } catch (e) {
    return { id: src.id, ok: false, error: String(e.message || e), queried: started.toISOString(), src };
  }
}

function esriToGeojson(f) {
  const g = f.geometry || {};
  let geometry = null;
  if (g.x !== undefined) geometry = { type: 'Point', coordinates: [g.x, g.y] };
  else if (g.rings) geometry = { type: 'Polygon', coordinates: g.rings };
  else if (g.paths) geometry = g.paths.length === 1
    ? { type: 'LineString', coordinates: g.paths[0] }
    : { type: 'MultiLineString', coordinates: g.paths };
  return { type: 'Feature', properties: f.attributes || {}, geometry };
}

async function loadBundled(src, boundary, fetchFn) {
  const T = getTurf();
  const started = new Date();
  try {
    const resp = await fetchFn(src.path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const fc = await resp.json();
    const buf = T.buffer(boundary, src.queryDist / 1000, { units: 'kilometers' });
    const bbox = T.bbox(buf);
    const features = fc.features.filter(f => {
      try {
        const fb = T.bbox(f);
        if (fb[0] > bbox[2] || fb[2] < bbox[0] || fb[1] > bbox[3] || fb[3] < bbox[1]) return false;
        return minDistanceMeters(boundary, f) <= src.queryDist;
      } catch (e) { return false; }
    });
    let snapshotAgeDays = null, stale = false;
    if (src.snapshot) {
      snapshotAgeDays = Math.round((started - new Date(src.snapshot)) / 86400000);
      stale = snapshotAgeDays > 180;
    }
    return { id: src.id, ok: true, features, queried: started.toISOString(), src, snapshotAgeDays, stale };
  } catch (e) {
    return { id: src.id, ok: false, error: String(e.message || e), queried: started.toISOString(), src,
             missing: !!src.optional };
  }
}

/* ---------------- checks ---------------- */

function nearest(boundary, results, ids, nameOverride) {
  let best = null;
  for (const id of ids) {
    const r = results[id];
    if (!r || !r.ok) continue;
    for (const f of r.features) {
      if (!f.geometry) continue;
      const d = minDistanceMeters(boundary, f);
      if (!best || d < best.dist) best = {
        dist: d, feature: f,
        name: nameOverride ? nameOverride(f) : featureName(f, r.src.nameFields),
        source: r.src.note, authority: r.src.authority, queried: r.queried,
      };
    }
  }
  return best;
}

function collectWithin(boundary, results, ids, maxDist) {
  const out = [];
  for (const id of ids) {
    const r = results[id];
    if (!r || !r.ok) continue;
    for (const f of r.features) {
      if (!f.geometry) continue;
      const d = minDistanceMeters(boundary, f);
      if (d <= maxDist) out.push({
        dist: d, feature: f, name: featureName(f, r.src.nameFields),
        dir: directionFrom(boundary, f),
        source: r.src.note, authority: r.src.authority, queried: r.queried,
      });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

function sourceStatus(results, ids) {
  return ids.map(id => {
    const r = results[id];
    if (!r) return { id, ok: false, error: 'not queried' };
    return { id, ok: r.ok, error: r.error, note: r.src.note, authority: r.src.authority, queried: r.queried };
  });
}

function verdictFor(nearestHit, setback, anySourceFailed) {
  if (nearestHit && nearestHit.dist < setback) return 'ENCROACHES';
  if (anySourceFailed) return 'ADVISORY';
  return 'PASS';
}

/* Cluster water hits into distinct physical watercourses (segments within
   joinDist metres of an existing cluster member merge into it). */
function clusterWater(hits, joinDist) {
  const clusters = [];
  for (const h of hits) {
    let placed = null;
    for (const c of clusters) {
      for (const m of c.members) {
        try { if (minDistanceMeters(m.feature, h.feature) <= joinDist) { placed = c; break; } } catch (e) {}
      }
      if (placed) break;
    }
    if (placed) { placed.members.push(h); if (h.dist < placed.nearest.dist) placed.nearest = h; }
    else clusters.push({ members: [h], nearest: h });
  }
  return clusters.sort((a, b) => a.nearest.dist - b.nearest.dist);
}
/* Is a water hit corroborated by the 1:50k topo hydro (within tol metres)? */
function corroborated(hit, results, tol) {
  for (const id of ['topo_wline','topo_wpoly']) {
    const r = results[id];
    if (!r || !r.ok) continue;
    for (const f of r.features) {
      try { if (minDistanceMeters(hit.feature, f) <= tol) return true; } catch (e) {}
    }
  }
  return false;
}

/* Section G. Returns array of check objects. */
function runSectionG(boundary, results, opts) {
  opts = opts || {};
  const checks = [];
  const failed = ids => sourceStatus(results, ids).some(s => !s.ok);

  { // G1 private property 15 m
    const ids = ['crown_titles'];
    const n = nearest(boundary, results, ids);
    const v = verdictFor(n, 15, failed(ids));
    const apps = nearest(boundary, results, ['crown_apps']);
    checks.push({ id:'G1', label:'15 m from private property', setback:15, verdict:v, nearest:n,
      sources: sourceStatus(results, ['crown_titles','crown_apps']),
      notes: [
        apps && apps.dist < 100 ? `A Crown title APPLICATION is ${fmt(apps.dist)} away (${apps.name}); an application is a competing interest the referral will see.` : null,
        n && n.dist < 15 ? 'If the intersecting title is held by the applicant, or written consent from the holder exists, this is not a conflict; state it on the application. The check cannot know who is applying.' : null,
        'Issued Crown titles layer is the only public source for private property. Unregistered or historic private interests are not screenable.',
      ].filter(Boolean) });
  }

  { // G2 trails 15 m: permanently advisory
    const ids = ['res_roads_nf','res_roads_lb','res_roads_dnr'];
    const n = nearest(boundary, results, ids);
    const v = (n && n.dist < 15) ? 'ENCROACHES' : 'ADVISORY';
    checks.push({ id:'G2', label:'15 m from a trail (cabin access trail, forest access road)', setback:15,
      verdict:v, nearest:n, sources: sourceStatus(results, ids),
      notes: ['Cabin access trails are not mapped in any provincial layer. Mapped resource roads only. This check can fail a boundary but can never fully clear one.'] });
  }

  { // G3 roads 50 m. Classification rule (operator-set, 2026-08-13): FFA is the
    // authoritative source for forest access roads (screened in G2 at 15 m). An
    // Atlas road hit only fails G3 if it is a real road: named (route number or
    // street name) or a paved-tier class. Unnamed hits that are Resource/Recreation
    // class or coincide with a mapped FFA resource road are ADVISORY here; G2 governs.
    const ids = ['lu_roads_p','lu_roads_s','roads_nrn','road_tlh','road_cartwright'];
    const isNamed = f => {
      const p = f.properties || {};
      return ['RTNUMBER1','RTNAME1EN','RTNAME2EN','L_STNAME_C','ROADNAME','STREETNAME','NAME']
        .some(k => p[k] && !/^(none|unknown)$/i.test(String(p[k]).trim()));
    };
    const isPavedClass = f => /freeway|expressway|highway|arterial/i.test(String((f.properties||{}).ROADCLASS||''));
    const coincidesResource = f => {
      for (const rid of ['res_roads_nf','res_roads_lb','res_roads_dnr']) {
        const r = results[rid];
        if (!r || !r.ok) continue;
        for (const g of r.features) {
          try { if (minDistanceMeters(f, g) <= 120) return true; } catch(e){}
        }
      }
      return false;
    };
    const within = collectWithin(boundary, results, ids, 50);
    const firm = [], overridden = [];
    for (const h of within) {
      const declaredResource = /resource/i.test(String((h.feature.properties||{}).ROADCLASS||''));
      if (!isNamed(h.feature) && !isPavedClass(h.feature) && (declaredResource || coincidesResource(h.feature)))
        overridden.push(h);
      else firm.push(h);
    }
    const nAll = nearest(boundary, results, ids);
    const notes = [];
    let v;
    if (firm.length) { v = 'ENCROACHES'; }
    else if (overridden.length) {
      v = 'ADVISORY';
      notes.push(`${overridden.length} unnamed road hit(s) within 50 m reclassified as forest access road(s): the province's FFA resource-roads layer maps the same alignment (or the Atlas classes it Resource/Recreation). The 15 m G2 setback governs these; see G2. Confirm classification with the Quarries Section.`);
    } else {
      v = verdictFor(nAll, 50, failed(['lu_roads_p','lu_roads_s']));
    }
    const nShow = firm.length ? firm[0] : nAll;
    checks.push({ id:'G3', label:'50 m from a road (paved municipal, gravel rural)', setback:50,
      verdict: v, nearest: nShow, sources: sourceStatus(results, ids), notes });
  }

  { // G4 protected road 90 m
    const ids = ['lu_prz','protected_roads'];
    const n = nearest(boundary, results, ids, f => f.properties.name || f.properties.NAME || f.properties.ROAD || 'protected road polygon');
    const bcl = nearest(boundary, results, ['building_control'], f => f.properties.name || 'building control line');
    checks.push({ id:'G4', label:'90 m from a Protected Road', setback:90,
      verdict: verdictFor(n, 90, failed(ids)), nearest:n,
      sources: sourceStatus(results, ['lu_prz','protected_roads','building_control']),
      notes: [
        bcl && bcl.dist === 0 ? `The boundary lies WITHIN the mapped building control area for ${bcl.name}. This is a corridor polygon (typically a few hundred metres each side of the road), not a line: overlap means the site falls inside the mapped area, not that a control line touches the boundary. A separate Municipal Affairs approvals regime applies; corridor extents are as mapped by Municipal Affairs and are not survey-anchored.` :
        bcl && bcl.dist < 90 ? `Building control area boundary ${fmt(bcl.dist)} away (${bcl.name}); a separate Municipal Affairs regime applies along protected roads.` : null,
        'Screened against the Protected Road Zoning KMZ snapshot; per-road plans on the Municipal Affairs list govern.',
      ].filter(Boolean) });
  }

  { // G5 waterbody 50 m: waterbody polygons (lakes/ponds) only, per operator ground truth
    // that mapped 'stream' lines are predominantly dry drainage at barrens sites.
    const wbIds = ['wbody_isl','wbody_lb','topo_wpoly'];
    const n = nearest(boundary, results, wbIds, f => waterName(f));
    const streamNear = collectWithin(boundary, results,
      ['stream_isl','wline_isl','stream_lb','wline_lb','topo_wline'], 50);
    const notes = [
      streamNear.length ? `Note: ${streamNear.length} mapped drainage/stream line(s) exist within 50 m but are not screened (frequently dry at mapped locations; an operating permit has been issued adjacent to such lines). If any carries flow, the 50 m setback applies to it; verify on site.` : null,
      'Screened against mapped lakes and ponds (forestry inventory + 1:50k topo polygons). Mapped stream lines are excluded from this verdict; small waterbodies may be unmapped in both sources.',
    ].filter(Boolean);
    checks.push({ id:'G5', label:'50 m from a waterbody (stream, pond)', setback:50,
      verdict: verdictFor(n, 50, failed(wbIds)), nearest: n, sources: sourceStatus(results, wbIds), notes });
  }

  { // G6 wetland 30 m
    const ids = ['nonforest_isl','nonforest_lb'];
    const BOG_LABEL = { BOG:'Bog', WBOG:'Wet Bog', TBOG:'Treed Bog' };
    const nAll = nearest(boundary, results, ids,
      f => BOG_LABEL[f.properties.NFCODE] || `NFCODE ${f.properties.NFCODE}`);
    checks.push({ id:'G6', label:'30 m from a wetland', setback:30,
      verdict: verdictFor(nAll, 30, failed(ids)), nearest: nAll,
      sources: sourceStatus(results, ids),
      notes: [
        'Screened against the forestry inventory\'s wetland classes: Bog, Wet Bog, Treed Bog (per the layer\'s published NFCODE domain). Soil Barren and Rock Barren are dry-ground classes, not wetlands, and are excluded. The inventory can miss small marshes and fens; confirm on site.',
      ] });
  }

  { // No Permits Available areas (s.5) — not a Section G item but application-fatal
    const snap = results['no_permit_areas'], live = results['npa_live'];
    const ids = ['no_permit_areas','npa_live'];
    if ((snap && snap.ok) || (live && live.ok)) {
      const n = nearest(boundary, results, ids, f => f.properties.name || f.properties.Location || 'designated area');
      const v = (n && n.dist === 0) ? 'ENCROACHES' : 'ADVISORY';
      const notes = [];
      if (live && live.ok) notes.push('Screened against the province\'s live No Permits Available layer' + (snap && snap.ok ? ' and the bundled snapshot' : '') + '. The listing is province-described work-in-progress; absence of a polygon is not proof none exists — confirm with the Quarries Section.');
      else notes.push('Live NPA layer unreachable this run; screened against a snapshot of a province-described work-in-progress listing. Absence of a polygon is not proof none exists; confirm with the Quarries Section.');
      checks.push({ id:'NPA', label:'No Permits Available area (s.5, Quarry Materials Regulations)', setback:0,
        verdict:v, nearest:n, sources: sourceStatus(results, ids), notes });
    } else {
      checks.push({ id:'NPA', label:'No Permits Available area (s.5, Quarry Materials Regulations)', setback:0,
        verdict:'ADVISORY', nearest:null, sources: sourceStatus(results, ids),
        notes: ['Neither the live NPA layer nor the bundled snapshot answered. Not screenable this run; confirm with the Quarries Section.'] });
    }
  }

  { // Existing quarry tenure overlap — application-fatal conflict unless it is the applicant's own tenure
    const ids = ['q_permits','q_leases','q_sub','q_snapshot'];
    const onSite = collectWithin(boundary, results, ids, 0);
    const seen = new Set();
    const named = onSite.filter(h => { const k = h.name + '|' + h.source; if (seen.has(k)) return false; seen.add(k); return true; });
    let v = 'PASS';
    if (named.length) v = 'ENCROACHES';
    else if (failed(ids)) v = 'ADVISORY';
    checks.push({ id:'TEN', label:'Existing quarry tenure overlap', setback:0,
      verdict: v, nearest: named[0] || nearest(boundary, results, ids), sources: sourceStatus(results, ids),
      notes: [
        named.length ? `WARNING: the proposed boundary OVERLAPS a mapped existing (or recently mapped) quarry location: ${named.slice(0,4).map(h=>{
          const d = (h.feature.properties||{}).description || '';
          const pm = d.match(/Permit number (\d+)/); const st = d.match(/Activity status (\w+)/);
          return `${h.name}${pm?` (permit ${pm[1]}${st?`, ${st[1].toLowerCase()}`:''})`:''} [${h.source}]`;
        }).join('; ')}${named.length>4?'; …':''}. An application over another holder's active tenure will conflict. If this is the applicant's own tenure (renewal or expansion), state that in the application.` : null,
        'Live tenure positions are datum-corrected; the boundary-polygon snapshot is dated. Confirm current status with the Quarries Section before relying on either.',
      ].filter(Boolean) });
  }

  return checks;
}

function waterName(f) {
  const t = f.geometry.type;
  if (t === 'LineString' || t === 'MultiLineString') return 'stream / watercourse';
  return 'waterbody (pond/lake polygon)';
}

/* Section E pre-written answers. */
function runSectionE(boundary, results) {
  const T = getTurf();
  const e = [];
  /* Outage gate: a copy-onto-the-form answer must never assert absence when
     the sources that would have shown presence did not respond. */
  const gateE = (ids, hasHits, answer) => {
    const failedS = sourceStatus(results, ids).filter(s => !s.ok);
    if (!failedS.length) return { answer, unverifiable: false };
    const names = failedS.map(s => s.note || s.id).join('; ');
    if (!hasHits) return { unverifiable: true,
      answer: `NOT SCREENABLE THIS RUN — required source(s) unreachable: ${names}. Do not answer “none” on the form from this report; re-run when the services respond.` };
    return { unverifiable: false,
      answer: answer + ` [Caveat: ${failedS.length} source(s) unreachable this run (${names}); this list may be incomplete.]` };
  };
  const roadN = nearest(boundary, results, ['lu_roads_p','lu_roads_s','roads_nrn','road_tlh','road_cartwright']);

  { const g = gateE(['lu_roads_p','lu_roads_s'], !!roadN, roadN
      ? `Nearest mapped road is ${fmt(roadN.dist)} away (${roadN.name}). Visibility depends on terrain and vegetation and is not computable from published data; assess on site. If visible, a Visibility Management Plan may be requested.`
      : 'No mapped road within 1 km. Visibility unlikely but confirm on site.');
    e.push({ id:'E1', q:'Is the site visible from nearby highways or main roads?', answer: g.answer, unverifiable: g.unverifiable, basis: roadN }); }

  const qHits = collectWithin(boundary, results, ['q_apps','q_sub','q_permits','q_leases'], 100);
  const onSite = qHits.filter(h => h.dist === 0);
  { const g = gateE(['q_apps','q_sub','q_permits','q_leases'], onSite.length > 0, onSite.length
      ? `Published tenure records intersect this boundary: ${onSite.map(h=>h.name).join('; ')}. If workings exist, face heights must be reported from site measurement.`
      : 'No published quarry tenure intersects this boundary. If old workings are present on the ground, answer yes and measure face heights on site.');
    e.push({ id:'E2', q:'Is it an existing or historic quarry?', answer: g.answer, unverifiable: g.unverifiable, basis: onSite[0] || null }); }

  const access = nearest(boundary, results, ['lu_roads_p','lu_roads_s','roads_nrn','res_roads_nf','res_roads_dnr','res_roads_lb','roads_dnr','road_tlh','road_cartwright']);
  { const g = gateE(['lu_roads_p','lu_roads_s','res_roads_nf','res_roads_dnr','res_roads_lb'], !!access, access
      ? `Nearest mapped road or resource road is ${fmt(access.dist)} away (${access.name}). The application boundary file must include the access road.`
      : 'No mapped access within 1 km. New access will need to be shown in the boundary file.');
    e.push({ id:'E3', q:'Is there existing access?', answer: g.answer, unverifiable: g.unverifiable, basis: access }); }

  const inBnd = collectWithin(boundary, results, ['bldg_bing','bldg_topo','tx_nalcor','tx_canvec'], 0);
  e.push({ id:'E4', q:'Are there structures within the boundary (fence, pole line, house)?',
    ...gateE(['bldg_bing','bldg_topo','tx_nalcor','tx_canvec'], inBnd.length > 0, inBnd.length
      ? `Published data shows ${inBnd.length} structure/line feature(s) intersecting the boundary: ${inBnd.slice(0,6).map(h=>`${h.name} (${h.source})`).join('; ')}${inBnd.length>6?'; …':''}. Confirm on site; fences and small structures are not mapped.`
      : 'No mapped structures or transmission lines intersect the boundary. Fences, pole lines and small structures are not reliably mapped; confirm on site.'),
    basis: inBnd[0] || null, list: inBnd });

  const wb200 = collectWithin(boundary, results, ['wbody_isl','wbody_lb','topo_wpoly'], 200)
    .map(h => ({ ...h, name: 'waterbody (pond/lake)' }));
  const wbClusters = clusterWater(wb200, 40);
  const drain200 = collectWithin(boundary, results,
    ['stream_isl','wline_isl','stream_lb','wline_lb','topo_wline'], 200);
  const drainClusters = clusterWater(drain200, 40);
  let ans = wbClusters.length
    ? wbClusters.slice(0,8).map(c => `${c.nearest.name}, ${c.nearest.dir}, ${fmt(c.nearest.dist)}`).join('; ')
      + (wbClusters.length>8?`; and ${wbClusters.length-8} more`:'')
    : 'No ponds or lakes mapped within 200 m.';
  if (drainClusters.length) ans += ` Mapped drainage lines also appear within 200 m on provincial mapping (${drainClusters.length} distinct); [state whether these carry flow, from site knowledge].`;
  { const g5 = gateE(['wbody_isl','wbody_lb','topo_wpoly'], wbClusters.length > 0, ans); ans = g5.answer; var _e5unv = g5.unverifiable; }
  e.push({ id:'E5', q:'Waterbodies within 200 m? (type, direction, distance)',
    answer: ans, unverifiable: (typeof _e5unv !== 'undefined') && _e5unv,
    basis: wbClusters[0] ? wbClusters[0].nearest : null, list: wb200,
    note: 'Itemized entries are lakes/ponds only. Mapped stream/drainage lines are summarized, not itemized; complete the bracketed statement from site knowledge before submitting.' });

  const lu300 = [
    ...collectWithin(boundary, results, ['lu_roads_p','lu_roads_s','roads_nrn','road_tlh','road_cartwright'], 300).map(h=>({...h,kind:'road'})),
    ...collectWithin(boundary, results, ['bldg_bing','bldg_topo'], 300).map(h=>({...h,kind:'building/residence or cabin'})),
    ...collectWithin(boundary, results, ['tx_nalcor','tx_canvec'], 300).map(h=>({...h,kind:'transmission line'})),
    ...collectWithin(boundary, results, ['q_apps','q_sub','q_permits','q_leases'], 300).map(h=>({...h,kind:'quarry tenure'})),
  ].sort((a,b)=>a.dist-b.dist);
  e.push({ id:'E6', q:'Land uses within 300 m? (roads, residences, cabins, transmission lines, other quarries, agriculture)',
    ...gateE(['lu_roads_p','lu_roads_s','bldg_bing','bldg_topo','tx_nalcor','tx_canvec','q_apps','q_sub','q_permits','q_leases'], lu300.length > 0, lu300.length
      ? lu300.slice(0,12).map(h => `${h.kind}: ${h.name}, ${h.dir}, ${fmt(h.dist)}`).join('; ') + (lu300.length>12?`; and ${lu300.length-12} more`:'')
      : 'None mapped within 300 m.'),
    basis: lu300[0] || null, list: lu300,
    note: 'Agriculture parcels have no queryable public layer; not screenable. Buildings are Bing-derived footprints plus 1:50k symbols; cabins are under-mapped.' });

  // Structures context to 2 km: situational awareness only. Not a form question,
  // not a setback; no distance-based requirement is stated or implied.
  const st2k = collectWithin(boundary, results, ['bldg_bing','bldg_topo'], 2000);
  const in1k = st2k.filter(h => h.dist < 1000);
  { const g = gateE(['bldg_bing','bldg_topo'], st2k.length > 0, (st2k.length
      ? `${in1k.length} mapped structure(s) within 1,000 m; ${st2k.length - in1k.length} more between 1,000 m and 2 km${st2k.length>=250?' (counts truncated at fetch cap)':''}. Nearest: ${st2k[0].name} (${st2k[0].source}), ${st2k[0].dir}, ${fmt(st2k[0].dist)}.`
      : 'No mapped structures within 2 km.')
      + ' CAUTION: building data is Bing-derived plus 1:50k symbols and is demonstrably incomplete (unmapped cabins and pole lines confirmed at a real site); an empty result does not mean no structures exist. Field verification governs.');
    e.push({ id:'CTX', q:'Context: mapped structures near the boundary (not a form question)',
      answer: g.answer, unverifiable: g.unverifiable, basis: st2k[0] || null }); }

  return e;
}

/* Referral forecast: which agencies the published data implicates. */
function runReferralForecast(boundary, results) {
  const lab = inLabrador(boundary);
  const items = [];
  const add = (agency, ids, maxDist, why, extraNote) => {
    const hits = collectWithin(boundary, results, ids, maxDist);
    const status = sourceStatus(results, ids);
    if (hits.length || status.some(s => !s.ok)) items.push({
      agency, hits: hits.slice(0, 8), total: hits.length, why, sources: status, note: extraNote || null });
  };

  add('Mineral Lands Division (tenure conflict)', ['claims','min_tenure','cl_mines'], 100,
    'Staked claims or mineral tenure on or near the boundary');
  add('Quarry Materials Exploration Licences', ['qmel_live','qmels'], 500,
    'QMEL polygons within 500 m (live provincial layer, cross-checked against the bundled snapshot dated 2024-10-25)');
  add('Quarries Section (nearby tenure)', ['q_apps','q_sub','q_permits','q_leases','q_snapshot','q_proposed'], 500,
    'Existing or proposed quarry tenure within 500 m (positions of dnrmaps tenure layers datum-corrected: the provincial tenure server serves untransformed NAD27 coordinates, 52-74 m off in NL; NTv2 shift applied here)',
    lab ? 'Labrador tenure: the province flags its own Labrador quarry boundaries as "Unconfirmed" or "Unavailable" (circle around a coordinate). Distances to these features are not reliable. The province\'s AGOL mirror carries a Boundary_Status field; cross-check below.' : null);
  add('Quarries Section — No Permits Available area (s.5)', ['npa_live','no_permit_areas'], 200,
    'Designated No Permits Available area on or near the boundary — a permit cannot issue inside one');
  add('Water Resources Management Division', ['lu_pws','pwsa','intakes','water_rights','nat_drain','flood'], 1000,
    'Public water supply areas, intakes/wellheads, water rights, natural drainage, or flood extents nearby');
  add('Parks and protected areas', ['lu_protected','lu_cpcad','prov_protected','mmnpr'], 100,
    'Protected or conserved area on or near the boundary');
  add('Nunatsiavut Government (LIL/LISA)', ['lu_lil','lu_lisa'], 100,
    'Labrador Inuit Lands or Settlement Area');
  add('Municipality / MPAB', ['lu_municipal','lu_planning','cl_mpr'], 100,
    'Inside or adjacent to a municipal boundary or planning area; the municipal plan governs land use',
    'Where the planning area record carries an MPAB_LINK, the plan document is linked in the hits below.');
  add('Wind energy land reserve', ['lu_wind'], 100, 'Wind energy land reserve overlap');
  add('Specified material lands', ['lu_specified'], 100, 'Specified material lands overlap');
  add('Crown Lands (competing applications/titles)', ['crown_titles','crown_apps'], 100,
    'Crown title or application on or near the boundary');
  add('Agriculture (development / RFP areas)', ['agri_rfp','cl_agri'], 100,
    'Mapped agriculture development or RFP area on or near the boundary; agricultural land interests are referred for review');
  add('Utility corridors (transmission and power interests)', ['tx_nalcor','tx_canvec','cl_hydro'], 200,
    'Mapped electrical transmission line within 200 m; utility easements and clearance requirements apply near corridors');
  add('Forestry (planned harvest / silviculture conflict)', ['fp_aop_harv','fp_fyop_harv','fp_aop_silv','fp_fyop_silv','fp_oa'], 200,
    'Overlap or proximity to blocks in the annual or five-year forestry operating plans — commercial harvest allocations, silviculture treatment areas, or designated operating areas. Timber in these blocks is committed or invested; the district forestry office will weigh the conflict');
  add('Forestry / third-party timber interests (Crown records)', ['cl_forestry','cl_bowater'], 200,
    'Crown-recorded forestry interest area or Bowater land-sale parcel on or near the boundary. Bowater parcels trace the historical paper-company land dispositions; timber and land rights on them may sit outside ordinary Crown tenure — verify the underlying title before assuming Crown quarry rights are clear');
  add('Forestry (domestic harvest blocks)', ['domestic_nf','domestic_lb'], 200,
    'Designated domestic (firewood) cutting block on or near the boundary; community cutting allocations are a forestry referral interest');
  add('Wildlife Division (mapped interest areas)', ['cl_wildlife'], 200,
    'Crown-recorded wildlife land-use interest area on or near the boundary (distinct from species occurrence data, which is not public)');
  add('Tourism, Culture, Arts and Recreation (mapped interest areas)', ['cl_tourism'], 200,
    'Crown-recorded tourism/culture/recreation interest area on or near the boundary');
  add('Federal lands', ['cl_federal'], 200,
    'Federal land parcel on or near the boundary; provincial quarry tenure cannot issue over federal land');

  // Geodetic monuments: a 5 m buffer is required around control survey markers (Lands Act s.65);
  // the GIS and Mapping Division must be contacted if a marker could be disturbed.
  {
    const mons = collectWithin(boundary, results, ['nlgn'], 100);
    const status = sourceStatus(results, ['nlgn']);
    if (mons.length || status.some(s => !s.ok)) items.push({
      agency:'GIS and Mapping Division (geodetic monuments)', hits: mons.slice(0, 8), total: mons.length,
      why:'NLGN control monument within 100 m of the boundary. A 5 m protective buffer applies around control survey markers (Lands Act s.65); contact GMD@gov.nl.ca before any activity that could disturb a marker.',
      sources: status, note:null });
  }

  // Boundary_Status cross-check from AGOL mirror
  const mirror = results['q_agol_mirror'];
  let mirrorFlags = [];
  if (mirror && mirror.ok) {
    mirrorFlags = mirror.features
      .filter(f => f.properties && f.properties.Boundary_Status &&
        !/confirmed/i.test(String(f.properties.Boundary_Status)) ||
        /unconfirmed|unavailable/i.test(String((f.properties||{}).Boundary_Status||'')))
      .map(f => ({ file: f.properties.FILENUMBER, company: f.properties.COMPANY,
                   status: f.properties.Boundary_Status, notes: f.properties.Boundary_Notes || null }));
  }

  // Permanent unknowns, always listed.
  const unknowns = [
    { agency:'Provincial Archaeology Office', why:'Archaeological potential data is not public by design. Not screenable; the referral to this office will occur regardless.' },
    { agency:'Wildlife Division (rare/sensitive species)', why:'Species occurrence data is not public by design; the referral will occur regardless. Standing constraints from comparable quarry reviews: no vegetation clearing within 800 m of a bald eagle or osprey nest during nesting season (March 15 - July 31; 200 m the rest of the year), and protections for listed bats and Bank Swallows, which favour exposed banks and faces of the kind quarries create. Report any raptor nest to WildlifeReferrals@gov.nl.ca.' },
  ];

  // Computed regulatory triggers + standing authorizations. Always listed: a
  // referral or approval noted here that turns out not to apply costs nothing;
  // one left out can cost a season. Wording sourced from the Environmental
  // Assessment Regulations, 2003 (NLR 54/03) and departmental advice issued on
  // comparable quarry projects (EA 2396).
  const T2 = getTurf();
  let areaHa = null;
  try { areaHa = T2.area(boundary) / 10000; } catch (e) {}
  const standing = [];

  if (areaHa !== null && areaHa > 10) {
    standing.push({ agency:'Environmental Assessment Division — REGISTRATION REQUIRED', flagged:true,
      why:`This boundary is ${areaHa.toFixed(2)} ha. A quarrying operation covering more than 10 hectares must be registered for environmental assessment (Environmental Assessment Regulations, 2003, s.33(3)).` });
  } else {
    standing.push({ agency:'Environmental Assessment Division',
      why:`${areaHa !== null ? `This boundary is ${areaHa.toFixed(2)} ha — below` : 'Below'} the 10 ha EA registration threshold for quarrying (s.33(3)). Note the aggregation rule: an extension or a new operation adjacent to an existing one must be registered when the combined area exceeds the threshold (s.52).` });
  }

  {
    const wc = collectWithin(boundary, results, ['stream_isl','stream_lb','wline_isl','wline_lb','topo_wline','wbody_isl','wbody_lb','topo_wpoly'], 200);
    if (wc.length) {
      standing.push({ agency:'Environmental Assessment Division — scheduled salmon rivers (s.28)', flagged:true,
        why:`Mapped watercourse or waterbody within 200 m (${wc.length} feature(s), nearest ${fmt(wc[0].dist)}). Any undertaking within 200 m of the high water mark of a scheduled salmon river must be registered for environmental assessment regardless of size (s.28). Whether a given watercourse is a scheduled salmon river is not determinable from these map layers — verify against the federal schedule before assuming this does not apply.` });
    } else {
      standing.push({ agency:'Scheduled salmon rivers (EA Regulations s.28)',
        why:'No mapped watercourse within 200 m this run. If any watercourse near the site is a scheduled salmon river, EA registration is mandatory within 200 m of its high water mark, regardless of operation size.' });
    }
  }

  {
    const wetNear = collectWithin(boundary, results, ['wbody_isl','wbody_lb','topo_wpoly','stream_isl','stream_lb','wline_isl','wline_lb','topo_wline'], 100);
    standing.push({ agency:'Fisheries and Oceans Canada (federal)', flagged: wetNear.length > 0,
      why: (wetNear.length ? `Mapped water feature within 100 m (nearest ${fmt(wetNear[0].dist)}). ` : '')
        + 'Work in or near water engages the federal Fisheries Act; consult DFO\'s Projects Near Water process before working near any watercourse or waterbody, mapped or not.' });
  }

  standing.push({ agency:'Water Resources Management Division (water use)',
    why:'A water use licence under the Water Resources Act is required before using water from any source for any purpose (e.g. dust suppression, washing). Effluent or runoff leaving the site must conform to the Environmental Control Water and Sewage Regulations.' });
  {
    const dist = collectWithin(boundary, results, ['fmd'], 0);
    const dName = dist.length ? (dist[0].feature.properties.MD_NAME || '') : '';
    const dNum = dist.length ? String(dist[0].feature.properties.MD_NUM || '') : '';
    const dLabel = dNum ? `Management District ${dNum}${dName ? ` (${dName})` : ''}` : '';
    standing.push({ agency:'Forestry (timber, cutting and fire season)' + (dLabel ? ` — ${dLabel}` : ''),
      why:'A Cutting Permit under the Cutting of Timber Regulations is required before any timber harvesting or removal. Merchantable timber cleared from the site is Crown timber: royalty/stumpage applies and salvage of usable wood is the expected practice, not optional. Third-party timber tenure — including licensed timber limits held by pulp-and-paper interests and other commercial operators — is not all publicly mapped; confirm standing timber commitments with the district forestry office' + (dLabel ? ` (${dLabel})` : '') + '. During forest fire season, an Operating Permit (and a Permit to Burn for burning on or within 300 m of forest land) is required under the Forest Fire Regulations.' });
  }
  standing.push({ agency:'Environment (pollution prevention)',
    why:'Operations are subject to the Air Pollution Control Regulations (dust; burning of waste is prohibited per Schedule D). All waste generated on site must go to an approved disposal facility.' });
  standing.push({ agency:'Government Service Centre (fuel storage and spills)',
    why:'Fuel storage tank systems other than small heating-appliance tanks (2,500 L or less) must be registered before installation. Used oil handling must comply with the Used Oil and Used Glycol Control Regulations. A spill contingency plan is expected; spills are reported to the 24-hour environmental emergencies line.' });
  standing.push({ agency:'Occupational Health and Safety',
    why:'Site activities, including those of any contractors engaged, must comply with the Occupational Health and Safety Act and regulations.' });
  standing.push({ agency:'Environment and Climate Change Canada (federal, migratory birds)',
    why:'Clearing should avoid the migratory bird nesting season (roughly mid-April to mid-August in this region) or be preceded by nest surveys; maintaining a 30 m buffer from the high water mark of waterbodies preserves movement corridors.' });
  standing.push({ agency:'Transportation and Infrastructure (highway access)',
    why:'A new or altered access onto a provincial highway requires an access permit; haul routes onto protected roads engage the Protected Road Zoning Regulations (screened above where mapped).' });
  standing.push({ agency:'Tourism, Culture, Arts and Recreation',
    why:'Near tourism assets or viewsheds, expect advice on visual screening, scheduling around peak visitor season, and site rehabilitation planning.' });
  if (lab) {
    standing.push({ agency:'Indigenous consultation (Labrador)', flagged:true,
      why:'Applications in Labrador are referred under the province\'s Indigenous consultation processes — Nunatsiavut Government (screened above where LIL/LISA is mapped), Innu Nation, and NunatuKavut Community Council depending on asserted or established rights in the area.' });
  }

  return { items, unknowns, standing, areaHa, mirrorFlags, labrador: lab };
}

function fmt(m) {
  if (m === 0) return 'intersecting (0 m)';
  if (m < 1) return '<1 m';
  return `${Math.round(m)} m`;
}

function overallVerdict(gChecks) {
  const dead = gChecks.filter(c => c.sources && c.sources.length && c.sources.every(s => !s.ok));
  if (dead.length === gChecks.length && gChecks.length) return { level:'UNVERIFIABLE',
    text:'Screening could not be completed — sources unreachable.',
    detail:'Every check\'s data sources failed to respond this run. No verdict here means anything; re-run when services are available.' };
  const enc = gChecks.filter(c => c.verdict === 'ENCROACHES');
  if (enc.length) {
    const gIds = enc.filter(c => /^G/.test(c.id)).map(c => c.id);
    const parts = [];
    if (gIds.length) parts.push(`Section G encroachment: ${gIds.join(', ')} — the form states encroaching boundaries "will not be accepted".`);
    if (enc.some(c => c.id === 'TEN')) parts.push('The boundary overlaps a mapped existing (or recently mapped) quarry location — a competing-tenure conflict unless it is the applicant\'s own.');
    if (enc.some(c => c.id === 'NPA')) parts.push('The boundary intersects a No Permits Available area (s.5).');
    return { level:'FAIL',
      text:'This boundary would not be accepted as submitted.',
      detail: parts.join(' ') };
  }
  const adv = gChecks.filter(c => c.verdict === 'ADVISORY');
  return { level: adv.length ? 'PASS_WITH_ADVISORIES' : 'PASS',
    text:'No Section G conflict found in the published data.',
    detail: adv.length
      ? `Advisories on ${adv.map(c=>c.id).join(', ')}: sources incomplete, unreachable, or inherently partial. This is not a certification of clearance.`
      : 'This is not a certification of clearance; it reflects the published data at the timestamps shown.' };
}

/* Orchestrator */
async function runScreen(boundary, fetchFn, onProgress, opts) {
  opts = opts || {};
  const results = {};
  const tasks = [
    queryArcgis(NLGN_SOURCE, boundary, fetchFn).then(r => { results[r.id] = r; onProgress && onProgress(r); return r; }),
    ...SOURCES.map(s => queryArcgis(s, boundary, fetchFn).then(r => { results[r.id] = r; onProgress && onProgress(r); return r; })),
    ...BUNDLED.map(s => loadBundled(s, boundary, fetchFn).then(r => { results[r.id] = r; onProgress && onProgress(r); return r; })),
  ];
  await Promise.allSettled(tasks);
  const g = runSectionG(boundary, results, opts);
  const e = runSectionE(boundary, results);
  const referrals = runReferralForecast(boundary, results);
  const monuments = collectWithin(boundary, results, ['nlgn'], 5000).slice(0, 3)
    .map(h => ({ number: h.feature.properties.number, dist: h.dist, dir: h.dir,
                 elev: h.feature.properties.elev, adj_date: h.feature.properties.adj_date,
                 east: h.feature.properties.east, north: h.feature.properties.north,
                 zone: h.feature.properties.zone, queried: h.queried }));
  const snapshotWarnings = Object.values(results)
    .filter(r => r && r.ok && r.src && r.src.snapshot)
    .map(r => ({ id: r.id, note: r.src.note, snapshot: r.src.snapshot, ageDays: r.snapshotAgeDays, stale: r.stale }))
    .sort((a, b) => b.ageDays - a.ageDays);
  return { verdict: overallVerdict(g), g, e, referrals, monuments, results, datumSentinel: datumSentinelStatus(), snapshotWarnings, ranAt: new Date().toISOString() };
}

/* Datum audit: what each source's coordinates actually are, and how we know.
   Reference frame: NAD83(CSRS). Web display uses WGS84-compatible coordinates;
   the CSRS/WGS84 difference (~1-2 m) is far below every source's accuracy. */
const DATUM_AUDIT = [
  { group:'Crown Lands titles/applications', claimed:'WGS84 (served)', verified:'Owner-surveyed boundary matched issued title to <1 m (permit 151600 site, 2026-08-11)', action:'none needed', residual:'~1-5 m (survey-tied)' },
  { group:'dnrmaps tenure (quarries, claims, mineral tenure)', claimed:'WGS84 (served)', verified:'Served point == raw no-shift inverse of recorded NAD27 UTM to 0.0 m; true NAD27 shift in NL is 52-74 m (NRCan NTv2)', action:'NTv2 shift applied client-side (data/nad27_shift.json, <1 m interp error)', residual:'~5-15 m after correction (source digitization)' },
  { group:'dnrmaps Topographic (1:50k water, building points)', claimed:'WGS84 (served)', verified:'Source SR NAD27-family; NTv2 shift applied by pattern with the tenure finding. Post-correction outlines checked against NLImagery orthos (2026-08-12): residual 15-25 m misfit, direction varying - 1:50k generalization and pond water-level change, not datum', action:'NTv2 shift applied client-side; correction magnitude not independently confirmed for this service', residual:'+/-15-25 m vs orthos (owner-verified)' },
  { group:'Land Use Atlas roads (Primary/Secondary, layers 39/40)', claimed:'WGS84 (served)', verified:'Owner-verified against NLImagery/Esri orthos at two sites (2026-08-12): linework sits on the pavement', action:'primary G3 source', residual:'~5-10 m (visual)' },
  { group:'dnrmaps roads (Detailed Road Network)', claimed:'WGS84 (served)', verified:'Datum correct (ground-truthed at permit 151600) but 2008-vintage: offset/stale where roads realigned since, found at two sites', action:'DEMOTED - context only, no G3 verdicts', residual:'metres to tens of metres where realigned' },
  { group:'AGOL layers (water, landcover, WRMD, roads subsets)', claimed:'Web Mercator native', verified:'Hosted NAD83-family services; landcover/hydro consistent with corrected and ground-truthed layers', action:'none needed', residual:'~10-25 m (photogrammetric inventory)' },
  { group:'dnrmaps Land_Use (municipal, planning, PWS, LIL/LISA)', claimed:'WGS84 (served)', verified:'573 identical PWS watershed polygons matched against the NAD83-native AGOL copy: median offset +66.7 m E (IQR 61-72), 0% within 30 m as served - the NTv2 signature; third dnrmaps service proven NAD27-null', action:'NTv2 shift applied client-side; query distance widened 100->200 m', residual:'~5-15 m after correction' },
  { group:'Protected Roads / Building Control KMZs', claimed:'WGS84 (KML spec)', verified:'Not independently anchored; Municipal Affairs export', action:'none', residual:'unknown, assumed ~10-30 m' },
  { group:'NL Geodetic Network monuments', claimed:'NAD83(CSRS)', verified:'IS the provincial survey base; published by Geodetic Surveys', action:'reference layer', residual:'survey-grade' },
];

if (typeof module !== 'undefined') module.exports = { DATUM_AUDIT,
  SOURCES, BUNDLED, runScreen, runSectionG, runSectionE, runReferralForecast,
  minDistanceMeters, directionFrom, queryArcgis, loadBundled, overallVerdict, inLabrador, fmt,
  checkDatumSentinel, datumSentinelStatus, DATUM_SENTINEL,
  timedFetch, QUERY_TIMEOUT_1, QUERY_TIMEOUT_2,
};
