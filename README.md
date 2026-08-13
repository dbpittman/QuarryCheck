# NL Quarry Pre-Screen (QuarryCheck)

Runs the acceptance checks from Sections E and G of the NL Quarry Permit/Lease
Application (form MLD-Q-QP-A, rev 2025/10/31) on a proposed boundary, against the
province's own published map services, live in the browser. No backend, no accounts,
nothing stored.

## What it does
- Upload the same KMZ/KML/zipped-shapefile boundary the application requires — or draw one on the map, and drag any screened boundary to a new position and re-screen it.
- Section G: 15 m property / 15 m trail / 50 m road / 90 m protected road /
  50 m water / 30 m wetland. PASS / ENCROACHES / ADVISORY, nearest feature named,
  distance measured, source and timestamp on every claim.
- Section E: answers E1-E6 in copy-onto-the-form wording, plus structure and survey-control context.
- Referral forecast: what each referral agency will find in its own data,
  including the province's own "Unconfirmed" Labrador boundary flags, quoted.
- Permanent unknowns stated: archaeology, rare species, unmapped cabin trails.

## Sources
- gov.nl.ca/landuseatlasmaps Crown Lands server (titles, roads, protected road zones)
- dnrmaps.gov.nl.ca Geoscience Atlas services (live tenure database, datum-corrected; 1:50k topo)
- GNL ArcGIS Online org (FFA forestry layers, resource roads, NLGN control monuments)
- Bundled snapshots in /data (protected roads, building control, No Permits Available
  areas, QMELs, tenure boundary polygons; refresh via tools/kmz_to_geojson.py)

Datum handling, source verification, and screening-rule rationale: see TECHNICAL.md.

## Files
- index.html — UI
- app.js — source config + screening engine
- test.js — regression suite (`node test.js`; `TEST_LIVE=1` adds the live datum-sentinel check)
- data/*.geojson — bundled snapshots

## Deploy
Static. Cloudflare Pages: connect repo, no build step, output directory = repo root.

## Maintenance stance
Deliberately none. If a provincial service URL changes, edit the SOURCES table in
app.js. Bundled snapshots are refreshed by re-downloading the KMZs and re-running
the conversion (see repo history for the script).

## License and attribution
MIT License. Built by D. Pittman. See LICENSE for bundled library and government data terms.
