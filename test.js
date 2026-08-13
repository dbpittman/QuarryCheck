/* QuarryCheck regression tests.
 *
 *   node test.js              offline: bundled data + engine logic (~20 s)
 *   TEST_LIVE=1 node test.js  also checks the live datum sentinel (dnrmaps)
 *
 * Anchor: quarry permit 151600 (Rose Blanche), the ground-truthed reference
 * site documented in TECHNICAL.md. If these assertions fail after a change,
 * either the change broke the engine or an upstream source shifted — both
 * need investigating before trusting new output.
 */
'use strict';
global.turf = require('@turf/turf');
const T = global.turf;
const fs = require('fs');
const app = require('./app.js');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function near(x, target, tol) { return Math.abs(x - target) <= tol; }

/* fetch shim: local paths from disk, http(s) via Node fetch */
function fetchFn(url) {
  if (/^https?:/.test(url)) return fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const body = fs.readFileSync(url, 'utf8');
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(body) });
}

/* Anchor boundary: permit 151600 from the tenure snapshot */
function anchorBoundary() {
  const snap = JSON.parse(fs.readFileSync('data/quarry_tenure_snapshot.geojson', 'utf8'));
  // File number is the stable key: permits renumber on renewal (this file has
  // carried permits 150616 and 151600), the file number does not.
  const f = snap.features.find(f =>
    /File number 71113200\b/.test(f.properties.description || ''));
  if (!f) throw new Error('file 71113200 (permit 151600 site) not found in tenure snapshot');
  return f;
}

/* Sentinel reference == the raw NAD27 position the server has always served */
const SERVED_151600 = app.DATUM_SENTINEL.expected;

async function main() {
  const boundary = anchorBoundary();

  console.log('\n[1] NTv2 lattice');
  {
    const L = JSON.parse(fs.readFileSync('data/nad27_shift.json', 'utf8'));
    const [lon, lat] = SERVED_151600;
    const fx = (lon - L.lon0) / L.step, fy = (lat - L.lat0) / L.step;
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const bil = a => (a[j][i]*(1-u)*(1-v) + a[j][i+1]*u*(1-v) + a[j+1][i]*(1-u)*v + a[j+1][i+1]*u*v) / L.scale;
    const eastM = bil(L.dlon) * Math.cos(lat * Math.PI/180) * 111320;
    const northM = bil(L.dlat) * 110540;
    ok(near(eastM, 54.5, 2.5), `east shift at 151600 = ${eastM.toFixed(1)} m (expect 54.5 ±2.5)`);
    ok(Math.abs(northM) < 15, `north shift at 151600 = ${northM.toFixed(1)} m (expect small)`);
  }

  console.log('\n[2] distance engine');
  {
    ok(app.minDistanceMeters(boundary, boundary) === 0, 'boundary vs itself = 0');
    // Correction-direction invariant: the served representative point sits
    // inside this ~140 m parcel even uncorrected, so distance alone cannot
    // discriminate. Direction can: shifting the served point the WRONG way
    // (subtracting NTv2) must push it off the parcel; the correct way must not.
    const L = JSON.parse(fs.readFileSync('data/nad27_shift.json', 'utf8'));
    const [lon, lat] = SERVED_151600;
    const fx=(lon-L.lon0)/L.step, fy=(lat-L.lat0)/L.step, i=Math.floor(fx), j=Math.floor(fy), u=fx-i, v=fy-j;
    const bil = a => (a[j][i]*(1-u)*(1-v)+a[j][i+1]*u*(1-v)+a[j+1][i]*(1-u)*v+a[j+1][i+1]*u*v)/L.scale;
    const dlon = bil(L.dlon), dlat = bil(L.dlat);
    const dCorr = app.minDistanceMeters(boundary, T.point([lon+dlon, lat+dlat]));
    const dWrong = app.minDistanceMeters(boundary, T.point([lon-dlon, lat-dlat]));
    ok(dCorr === 0, `NTv2-corrected served point lies inside true parcel (${dCorr.toFixed(1)} m)`);
    ok(dWrong > 5, `wrong-direction shift exits the parcel (${dWrong.toFixed(1)} m) — correction sign verified`);
    const area = T.area(boundary) / 1e4;
    ok(near(area, 2.00, 0.05), `anchor parcel area = ${area.toFixed(2)} ha (expect 2.00 ±0.05)`);
  }

  console.log('\n[3] bundled loaders (anchor site)');
  {
    const snap = await app.loadBundled(
      app.BUNDLED.find(s => s.id === 'q_snapshot'), boundary, fetchFn);
    ok(snap.ok, 'q_snapshot loads');
    ok(snap.features.length >= 1, `q_snapshot returns ${snap.features.length} feature(s) near anchor`);
    const self = snap.features.find(f => app.minDistanceMeters(boundary, f) === 0);
    ok(!!self, 'anchor parcel found at distance 0 in its own snapshot');
  }

  console.log('\n[4] building-control data validity (no phantom geometry)');
  {
    const bc = JSON.parse(fs.readFileSync('data/building_control.geojson', 'utf8'));
    let open = 0, huge = 0;
    for (const f of bc.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polys) {
        const r0 = rings[0];
        if (r0[0][0] !== r0[r0.length-1][0] || r0[0][1] !== r0[r0.length-1][1]) open++;
        if (T.area(T.polygon(rings)) / 1e6 > 450) huge++;
      }
    }
    ok(open === 0, `all outer rings closed (${open} open)`);
    ok(huge === 0, `no component exceeds plausible corridor area (${huge} oversized)`);
    // a corridor overlap must read as containment, not a phantom 0 m line
    const inCorridor = T.point([-57.497, 50.425]); // verified interior point, NPH corridor
    const f139 = bc.features.find(f => f.geometry.type === 'MultiPolygon'
      && f.properties.name === 'Northern Peninsula Highway');
    ok(T.booleanPointInPolygon(inCorridor, f139), 'known interior point is inside NPH corridor polygon');
  }

  console.log('\n[5] G4 wording (corridor semantics)');
  {
    // synthetic: boundary inside a building-control corridor
    const box = T.polygon([[[-57.5,50.42],[-57.49,50.42],[-57.49,50.43],[-57.5,50.43],[-57.5,50.42]]]);
    const bcSrc = app.BUNDLED.find(s => s.id === 'building_control');
    const bcRes = await app.loadBundled(bcSrc, box, fetchFn);
    const results = { building_control: bcRes };
    const g = app.runSectionG(box, results);
    const g4 = g.find(c => c.id === 'G4');
    const note = (g4.notes || []).join(' ');
    ok(/WITHIN the mapped building control area/.test(note),
       'overlap reported as containment, not "0 m line"', note.slice(0, 120));
    ok(!/line 0 m away/.test(note), 'no phantom "line 0 m away" phrasing');
  }

  console.log('\n[6] datum sentinel');
  {
    if (process.env.TEST_LIVE) {
      const s = await app.checkDatumSentinel(fetchFn);
      ok(s.state === 'confirmed', `live sentinel state = ${s.state}` +
        (s.offsetMeters !== undefined ? ` (offset ${s.offsetMeters.toFixed(2)} m)` : ` (${s.error || s.detail || ''})`));
      if (s.state === 'tripped') console.log('      !! The province appears to have changed the service datum. Re-verify before trusting corrections.');
    } else {
      const s = await app.checkDatumSentinel(() => Promise.reject(new Error('offline test')));
      ok(s.state === 'unavailable', `offline sentinel degrades to '${s.state}' (corrections proceed, flagged)`);
      console.log('      (set TEST_LIVE=1 to check the live service)');
    }
  }

  console.log('\n[7] outage behavior (total blackout)');
  {
    const dead = () => Promise.reject(new Error('simulated outage'));
    const out = await app.runScreen(boundary, dead);
    ok(out.verdict.level === 'UNVERIFIABLE', `overall verdict = ${out.verdict.level}`);
    ok(out.g.every(c => c.verdict !== 'PASS'), 'no G check reads PASS during blackout');
    const ungated = out.e.filter(e => /No mapped|None mapped|No published|No ponds/.test(e.answer) && !e.unverifiable);
    ok(ungated.length === 0, `no E answer asserts absence ungated (${ungated.length})`);
    ok(out.e.some(e => e.unverifiable), 'E answers carry the unverifiable flag');
  }

  console.log('\n[8] G6 wetland classes (confirmed NFCODE legend)');
  {
    for (const id of ['nonforest_isl','nonforest_lb']) {
      const src = app.SOURCES.find(s => s.id === id);
      ok(/'BOG','WBOG','TBOG'/.test(src.where), `${id} screens Bog/Wet Bog/Treed Bog`);
      ok(!/'SB'|'RB'/.test(src.where), `${id} excludes Soil/Rock Barren (dry ground)`);
    }
  }

  console.log('\n[9] Land_Use datum + snapshot ages');
  {
    const luIds = ['lu_protected','lu_specified','lu_lil','lu_lisa','lu_cpcad','lu_pws','lu_municipal','lu_planning','lu_wind'];
    const flagged = luIds.filter(id => (app.SOURCES.find(s => s.id === id) || {}).datum === 'nad27null');
    ok(flagged.length === luIds.length, `all ${luIds.length} Land_Use sources datum-corrected (proven +66.7 m E vs AGOL twin)`);
    ok(app.BUNDLED.every(s => s.snapshot), 'every bundled source carries a snapshot date');
    const q = await app.loadBundled(app.BUNDLED.find(s => s.id === 'qmels'), boundary, fetchFn);
    ok(q.ok && q.snapshotAgeDays > 180 && q.stale === true, `qmels correctly flagged stale (${q.snapshotAgeDays} days)`);
  }

  console.log('\n[10] tenure overlap flag (TEN)');
  {
    // The anchor boundary IS an existing permit parcel: TEN must fire on it.
    const snapRes = await app.loadBundled(app.BUNDLED.find(s => s.id === 'q_snapshot'), boundary, fetchFn);
    const g = app.runSectionG(boundary, { q_snapshot: snapRes });
    const ten = g.find(c => c.id === 'TEN');
    ok(!!ten, 'TEN check present');
    ok(ten.verdict === 'ENCROACHES', `overlap with existing permit flagged (${ten.verdict})`);
    ok(/OVERLAPS a mapped existing/.test((ten.notes||[]).join(' ')), 'warning names the overlap');
    const overall = app.overallVerdict(g);
    ok(overall.level === 'FAIL' && /overlaps a mapped existing/.test(overall.detail),
       'stamp carries the tenure-overlap warning');
    // and a clean site must not trigger it
    const clean = global.turf.polygon([[[-56.0,48.5],[-55.999,48.5],[-55.999,48.501],[-56.0,48.501],[-56.0,48.5]]]);
    const snapClean = await app.loadBundled(app.BUNDLED.find(s => s.id === 'q_snapshot'), clean, fetchFn);
    const g2 = app.runSectionG(clean, { q_snapshot: snapClean });
    const ten2 = g2.find(c => c.id === 'TEN');
    ok(ten2.verdict !== 'ENCROACHES', `clean site does not trip TEN (${ten2.verdict})`);
  }

  console.log('\n[11] snapshot names + G3 classification rule');
  {
    const snapRes = await app.loadBundled(app.BUNDLED.find(s => s.id === 'q_snapshot'), boundary, fetchFn);
    const g = app.runSectionG(boundary, { q_snapshot: snapRes });
    const ten = g.find(c => c.id === 'TEN');
    const note = (ten.notes||[]).join(' ');
    ok(/Pittman's Enterprises/.test(note), 'TEN names the holder from the snapshot');
    ok(/permit \d+/.test(note), 'TEN carries the permit number from the description');
    // G3: unnamed uncorroborated road fails firm; Resource-classed reclassifies
    const road = { type:'Feature', properties:{ ROADCLASS:'Collector' },
      geometry:{ type:'LineString', coordinates:[[-58.7530,47.6086],[-58.7515,47.6090]] } };
    const roadsRes = { id:'lu_roads_p', ok:true, queried:new Date().toISOString(),
      src:{ id:'lu_roads_p', note:'Primary roads', authority:'test', nameFields:['ROADNAME'] }, features:[road] };
    const g3plain = app.runSectionG(boundary, { lu_roads_p: roadsRes }).find(c=>c.id==='G3');
    ok(g3plain.verdict === 'ENCROACHES', `unnamed uncorroborated road inside 50 m fails G3 (${g3plain.verdict})`);
    const res = { type:'Feature', properties:{ ROADCLASS:'Resource / Recreation' }, geometry: road.geometry };
    const g3res = app.runSectionG(boundary, { lu_roads_p: { ...roadsRes, features:[res] } }).find(c=>c.id==='G3');
    ok(g3res.verdict === 'ADVISORY', `Resource-classed road reclassifies to ADVISORY (${g3res.verdict})`);
    const named = { type:'Feature', properties:{ ROADNAME:'Route 470', ROADCLASS:'Resource / Recreation' }, geometry: road.geometry };
    const g3named = app.runSectionG(boundary, { lu_roads_p: { ...roadsRes, features:[named] } }).find(c=>c.id==='G3');
    ok(g3named.verdict === 'ENCROACHES', 'named road always fails firm');
  }

  console.log('\n[12] query timeouts feed the outage rule, never break it');
  {
    // a request that never answers but honours abort
    const hang = (url, opts) => new Promise((resolve, reject) => {
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    let timedOut = false;
    try { await app.timedFetch(hang, 'https://example.invalid/', {}, 100); }
    catch (e) { timedOut = /no response within/.test(String(e.message)); }
    ok(timedOut, 'timedFetch aborts a hung request with a clear message');
    // a response that arrives in time passes through untouched
    const quick = () => new Promise(r => setTimeout(() => r({ ok: true, json: async () => ({ features: [] }) }), 50));
    const resp = await app.timedFetch(quick, 'https://example.invalid/', {}, 2000);
    ok(resp && resp.ok === true, 'timedFetch passes through an in-time response');
    // both attempts failing yields ok:false (outage rule input), not a throw
    const src = { id: 'tmo_test', url: 'https://example.invalid/q', queryDist: 100, nameFields: ['OBJECTID'], authority: 'test', note: 'timeout test' };
    const dead = () => Promise.reject(new Error('no response within 10 s'));
    const r1 = await app.queryArcgis(src, boundary, dead);
    ok(r1.ok === false && /no response within/.test(r1.error), `timed-out source reports ok:false for the outage rule (${r1.error})`);
    // first attempt fails, slow-but-successful retry still wins
    let calls = 0;
    const flaky = () => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('HTTP 503'));
      return new Promise(r => setTimeout(() => r({ ok: true, json: async () => ({ features: [] }) }), 300));
    };
    const r2 = await app.queryArcgis(src, boundary, flaky);
    ok(r2.ok === true && calls === 2, `failed first attempt retries and a slow success still succeeds (${calls} calls)`);
    ok(app.QUERY_TIMEOUT_2 > app.QUERY_TIMEOUT_1, 'retry is more patient than the first attempt');
  }

  console.log('\n[13] referral forecast: new sources, computed rules, standing block');
  {
    for (const id of ['npa_live','qmel_live','q_proposed','agri_rfp','tx_nalcor','tx_canvec'])
      ok(app.SOURCES.some(s => s.id === id), `source registered: ${id}`);
    // EA threshold: small boundary is unflagged, >10 ha is flagged (s.33(3))
    const small = app.runReferralForecast(boundary, {});
    const ea1 = small.standing.find(s => /Environmental Assessment/.test(s.agency));
    ok(ea1 && !ea1.flagged && /10 h/.test(ea1.why), 'sub-threshold boundary: EA advisory, not flagged');
    ok(/s\.52/.test(ea1.why), 'sub-threshold wording carries the s.52 aggregation rule');
    const big = global.turf.polygon([[[-56.00,48.50],[-55.995,48.50],[-55.995,48.504],[-56.00,48.504],[-56.00,48.50]]]);
    const rBig = app.runReferralForecast(big, {});
    const ea2 = rBig.standing.find(s => /REGISTRATION REQUIRED/.test(s.agency));
    ok(ea2 && ea2.flagged && rBig.areaHa > 10, `>10 ha boundary flags EA registration (${rBig.areaHa.toFixed(2)} ha)`);
    // salmon river s.28: watercourse within 200 m flags the rule
    const streamRes = { id:'stream_isl', ok:true, queried:new Date().toISOString(),
      src:{ id:'stream_isl', note:'Stream (island)', authority:'test', nameFields:['OBJECTID'] },
      features:[{ type:'Feature', properties:{OBJECTID:1}, geometry:{ type:'LineString', coordinates:[[-58.7530,47.6086],[-58.7515,47.6090]] } }] };
    const rS = app.runReferralForecast(boundary, { stream_isl: streamRes });
    const sal = rS.standing.find(s => /salmon/.test(s.agency));
    ok(sal && sal.flagged && /s\.28/.test(sal.why), 'watercourse within 200 m flags the s.28 salmon-river rule');
    const dfo = rS.standing.find(s => /Fisheries and Oceans/.test(s.agency));
    ok(dfo && dfo.flagged, 'water within 100 m flags the DFO line');
    // geodetic monuments: NLGN marker within 100 m produces a GMD referral
    const monRes = { id:'nlgn', ok:true, queried:new Date().toISOString(),
      src:{ id:'nlgn', note:'NLGN monuments', authority:'test', nameFields:['number'] },
      features:[{ type:'Feature', properties:{ number:'TEST-1' }, geometry:{ type:'Point', coordinates:[-58.7521,47.6088] } }] };
    const rM = app.runReferralForecast(boundary, { nlgn: monRes });
    const gmd = rM.items.find(i => /GIS and Mapping/.test(i.agency));
    ok(gmd && gmd.total >= 1 && /5 m/.test(gmd.why), 'NLGN monument within 100 m produces the GMD referral');
    // NPA check carries the live layer in its sources
    const gN = app.runSectionG(boundary, {});
    const npa = gN.find(c => c.id === 'NPA');
    ok(npa && npa.sources.some(s => s.id === 'npa_live'), 'NPA check includes the live AGOL layer in its sources');
    // Labrador boundary raises the Indigenous consultation line
    const labB = global.turf.polygon([[[-61.0,53.5],[-60.999,53.5],[-60.999,53.501],[-61.0,53.501],[-61.0,53.5]]]);
    const rL = app.runReferralForecast(labB, {});
    const ind = rL.standing.find(s => /Indigenous consultation/.test(s.agency));
    ok(ind && ind.flagged && /Innu Nation/.test(ind.why) && /NunatuKavut/.test(ind.why),
       'Labrador boundary flags Indigenous consultation naming all three parties');
    // forestry: sources registered, planning conflict produces a referral, district naming works
    for (const id of ['fp_aop_harv','fp_fyop_harv','fp_aop_silv','fp_fyop_silv','fp_oa','domestic_nf','domestic_lb','fmd'])
      ok(app.SOURCES.some(s => s.id === id), `source registered: ${id}`);
    const oaRes = { id:'fp_oa', ok:true, queried:new Date().toISOString(),
      src:{ id:'fp_oa', note:'Designated forestry operating areas', authority:'test', nameFields:['OA_ID'] },
      features:[{ type:'Feature', properties:{ OA_ID:'OA-99' }, geometry:{ type:'Polygon',
        coordinates:[[[-58.7535,47.6075],[-58.7505,47.6075],[-58.7505,47.6105],[-58.7535,47.6105],[-58.7535,47.6075]]] } }] };
    const rF = app.runReferralForecast(boundary, { fp_oa: oaRes });
    const fRef = rF.items.find(i => /planned harvest \/ silviculture/.test(i.agency));
    ok(fRef && fRef.total >= 1, 'forestry operating-area overlap produces the planning-conflict referral');
    const fmdRes = { id:'fmd', ok:true, queried:new Date().toISOString(),
      src:{ id:'fmd', note:'Forest management district', authority:'test', nameFields:['MD_NAME','MD_NUM'] },
      features:[{ type:'Feature', properties:{ MD_NAME:null, MD_NUM:14 }, geometry:{ type:'Polygon',
        coordinates:[[[-58.8,47.55],[-58.7,47.55],[-58.7,47.65],[-58.8,47.65],[-58.8,47.55]]] } }] };
    const rD = app.runReferralForecast(boundary, { fmd: fmdRes });
    const fStand = rD.standing.find(s => /Forestry/.test(s.agency));
    ok(/Management District 14/.test(fStand.agency) && !/null/.test(fStand.agency),
       'forestry standing entry names the district by number and tolerates a null name');
    ok(/stumpage/.test(fStand.why) && /timber limits/.test(fStand.why) && /salvage/.test(fStand.why),
       'forestry wording covers stumpage, third-party timber limits, and salvage');
    // Crown LandUseDetails layers registered; Bowater/forestry overlap produces the timber-interest referral
    for (const id of ['cl_bowater','cl_forestry','cl_wildlife','cl_hydro','cl_agri','cl_mines','cl_tourism','cl_federal','cl_mpr'])
      ok(app.SOURCES.some(s => s.id === id), `source registered: ${id}`);
    const bowRes = { id:'cl_bowater', ok:true, queried:new Date().toISOString(),
      src:{ id:'cl_bowater', note:'Bowater land sales', authority:'test', nameFields:['NAME'] },
      features:[{ type:'Feature', properties:{ NAME:'Bowater Sale 12' }, geometry:{ type:'Polygon',
        coordinates:[[[-58.7535,47.6075],[-58.7505,47.6075],[-58.7505,47.6105],[-58.7535,47.6105],[-58.7535,47.6075]]] } }] };
    const rB = app.runReferralForecast(boundary, { cl_bowater: bowRes });
    const tRef = rB.items.find(i => /third-party timber interests/.test(i.agency));
    ok(tRef && tRef.total >= 1 && /Bowater/.test(tRef.why), 'Bowater parcel overlap produces the timber-interest referral');
  }

  console.log('\n[14] uncertainty bands: clearance inside source accuracy is not a pass');
  {
    ok(app.SOURCES.every(s => typeof s.accuracy === 'number' || s.id === 'fmd'),
       'every screening source carries an accuracy value (fmd context-only exempt)');
    ok(app.SOURCES.find(s=>s.id==='topo_wpoly').accuracy === 25 && app.SOURCES.find(s=>s.id==='lu_roads_p').accuracy === 5,
       '1:50k topo carries \u00b125 m; Atlas roads \u00b15 m');
    const ids = app.SOURCES.map(s=>s.id);
    ok(new Set(ids).size === ids.length, 'source registry has no duplicate ids');
    // fixed local box (~-56.000..-55.999 lon, 48.500..48.501 lat), east edge at -55.999
    const box = global.turf.polygon([[[-56.000,48.500],[-55.999,48.500],[-55.999,48.501],[-56.000,48.501],[-56.000,48.500]]]);
    const wb = (wlon) => ({ id:'topo_wpoly', ok:true, queried:new Date().toISOString(),
      src:{ id:'topo_wpoly', note:'Waterbody polygons (1:50k)', authority:'test', nameFields:['OBJECTID'], accuracy:25 },
      features:[{ type:'Feature', properties:{OBJECTID:9}, geometry:{ type:'Polygon',
        coordinates:[[[wlon,48.500],[wlon+0.001,48.500],[wlon+0.001,48.501],[wlon,48.501],[wlon,48.500]]] } }] });
    const okSrc = id => ({ id, ok:true, queried:new Date().toISOString(),
      src:{ id, note:id, authority:'test', nameFields:['OBJECTID'], accuracy:15 }, features:[] });
    // ~60 m east: 0.00082 deg lon at 48.5N (cos48.5*111320*0.00082 ~ 60.4 m); margin over 50 m inside +-25 band
    const gNear = app.runSectionG(box, { topo_wpoly: wb(-55.99818), wbody_isl: okSrc('wbody_isl'), wbody_lb: okSrc('wbody_lb') });
    const near = gNear.find(c=>c.id==='G5');
    ok(near.verdict === 'ADVISORY' && near.nearest.dist > 50 && near.nearest.dist < 75,
       `clearance inside the \u00b125 m band degrades to ADVISORY (${Math.round(near.nearest.dist)} m)`);
    ok(near.notes.some(n=>/positional uncertainty/.test(n)), 'band note explains the degradation');
    // ~100 m east: comfortably outside the band -> PASS
    const gFar = app.runSectionG(box, { topo_wpoly: wb(-55.99764), wbody_isl: okSrc('wbody_isl'), wbody_lb: okSrc('wbody_lb') });
    const far = gFar.find(c=>c.id==='G5');
    ok(far.verdict === 'PASS' && far.nearest.dist > 75, `clearance outside the band still passes (${Math.round(far.nearest.dist)} m)`);
    // TEN: tenure ~3 m east on a +-5 m source, all TEN sources answering -> overlap cannot be ruled out
    const tenNear = { id:'q_snapshot', ok:true, queried:new Date().toISOString(),
      src:{ id:'q_snapshot', note:'Quarry tenure snapshot', authority:'test', nameFields:['name'], accuracy:5 },
      features:[{ type:'Feature', properties:{ name:'Adjacent permit' }, geometry:{ type:'Polygon',
        coordinates:[[[-55.99896,48.500],[-55.998,48.500],[-55.998,48.501],[-55.99896,48.501],[-55.99896,48.500]]] } }] };
    const gTen = app.runSectionG(box, { q_snapshot: tenNear, q_permits: okSrc('q_permits'), q_leases: okSrc('q_leases'), q_sub: okSrc('q_sub') });
    const ten = gTen.find(c=>c.id==='TEN');
    ok(ten.verdict === 'ADVISORY' && ten.notes.some(n=>/cannot be ruled out/.test(n)),
       `tenure inside the accuracy band is ADVISORY, not a clean pass (${ten.nearest.dist.toFixed(1)} m)`);
    // named road ~125 m away on +-5 m Atlas roads with both road sources answering -> clean PASS survives
    const road = { id:'lu_roads_p', ok:true, queried:new Date().toISOString(),
      src:{ id:'lu_roads_p', note:'Primary roads', authority:'test', nameFields:['ROADNAME'], accuracy:5 },
      features:[{ type:'Feature', properties:{ ROADNAME:'Route 470', ROADCLASS:'Collector' },
        geometry:{ type:'LineString', coordinates:[[-55.99745,48.4995],[-55.99745,48.5015]] } }] };
    const gRoad = app.runSectionG(box, { lu_roads_p: road, lu_roads_s: okSrc('lu_roads_s'),
      res_roads_nf: okSrc('res_roads_nf'), res_roads_lb: okSrc('res_roads_lb'), res_roads_dnr: okSrc('res_roads_dnr') });
    const g3 = gRoad.find(c=>c.id==='G3');
    ok(g3.verdict === 'PASS' && g3.nearest.dist > 100,
       `road clearance well outside the band still passes (${Math.round(g3.nearest.dist)} m)`);
  }

  console.log('\n[15] rule authority: every rule tagged, interpretations declared');
  {
    const gAll = app.runSectionG(boundary, {});
    ok(gAll.every(c => c.basis && c.basis.tier && c.basis.cite), 'every Section G check carries a basis tier and citation');
    ok(gAll.find(c=>c.id==='NPA').basis.tier === 'REG' && /s\.5/.test(gAll.find(c=>c.id==='NPA').basis.cite),
       'NPA cites Quarry Materials Regulations s.5 at REG tier');
    ok(/interpretation/i.test(gAll.find(c=>c.id==='G3').basis.cite) && /interpretation/i.test(gAll.find(c=>c.id==='G6').basis.cite),
       'G3 and G6 declare their screening interpretations in the citation');
    // reclassification path carries the full interpretation statement
    const res = { type:'Feature', properties:{ ROADCLASS:'Resource / Recreation' },
      geometry:{ type:'LineString', coordinates:[[-58.7530,47.6086],[-58.7515,47.6090]] } };
    const roadsRes = { id:'lu_roads_p', ok:true, queried:new Date().toISOString(),
      src:{ id:'lu_roads_p', note:'Primary roads', authority:'test', nameFields:['ROADNAME'], accuracy:5 }, features:[res] };
    const g3i = app.runSectionG(boundary, { lu_roads_p: roadsRes }).find(c=>c.id==='G3');
    ok(g3i.notes.some(n=>/screening interpretation/.test(n) && /reviewing officer/.test(n)),
       'G3 reclassification note names itself an interpretation deferring to the reviewing officer');
    const g6i = app.runSectionG(boundary, {}).find(c=>c.id==='G6');
    ok(g6i.notes.some(n=>/screening interpretation/.test(n) && /NFCODE/.test(n)),
       'G6 exclusion note names itself an interpretation grounded in the NFCODE domain');
    // referral bases: monuments LEG, EA standing REG, defaults ADV
    const monRes2 = { id:'nlgn', ok:true, queried:new Date().toISOString(),
      src:{ id:'nlgn', note:'NLGN monuments', authority:'test', nameFields:['number'] },
      features:[{ type:'Feature', properties:{ number:'T2' }, geometry:{ type:'Point', coordinates:[-58.7521,47.6088] } }] };
    const rr = app.runReferralForecast(boundary, { nlgn: monRes2 });
    ok(rr.items.find(i=>/GIS and Mapping/.test(i.agency)).basis.tier === 'LEG', 'monuments referral cites Lands Act at LEG tier');
    ok(rr.standing.find(x=>/Environmental Assessment/.test(x.agency)).basis.tier === 'REG', 'EA standing entry carries REG tier');
    // stamp asserts the form's criteria, attributes the consequence to the form
    const encRoad = { ...roadsRes, features:[{ type:'Feature', properties:{ ROADNAME:'Route 470' }, geometry: res.geometry }] };
    const ov = app.overallVerdict(app.runSectionG(boundary, { lu_roads_p: encRoad }));
    ok(/form's acceptance criteria/.test(ov.text) && !/would not be accepted/.test(ov.text),
       'FAIL stamp asserts the form criteria, not a departmental outcome');
    ok(/the form states/.test(ov.detail), 'consequence language is attributed to the form');
  }

  console.log('\n[16] flood: envelope snapshot replaces the slow live layer');
  {
    ok(!app.SOURCES.some(s => s.id === 'flood') && app.BUNDLED.some(s => s.id === 'flood'),
       'flood is bundled, not live');
    const fl = await app.loadBundled(app.BUNDLED.find(s => s.id === 'flood'), boundary, fetchFn);
    ok(fl.ok, 'flood envelope snapshot loads');
    const stephenville = global.turf.polygon([[[-58.58,48.54],[-58.57,48.54],[-58.57,48.55],[-58.58,48.55],[-58.58,48.54]]]);
    const flS = await app.loadBundled(app.BUNDLED.find(s => s.id === 'flood'), stephenville, fetchFn);
    const rW = app.runReferralForecast(stephenville, { flood: flS });
    const wrm = rW.items.find(i => /Water Resources/.test(i.agency));
    ok(flS.features.length >= 1 && wrm && /envelope/.test(wrm.why),
       `a known flood-study town trips the referral with envelope wording (${flS.features.length} envelope(s) in range)`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('test harness error:', e); process.exit(2); });
