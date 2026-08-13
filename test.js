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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('test harness error:', e); process.exit(2); });
