# Bordeaux Bicycle Counts Explorer

Static public explorer for documented Bordeaux-Mobilite bicycle-count work.

Expected GitHub Pages URL:

```bash
https://selyaktini.github.io/Bordeaux-Mobilite/
```

## Purpose

This site is a lightweight public data-exploration interface. It summarizes:

- the Bordeaux rocade study perimeter and modelling zones;
- current raw-hourly, observed-clean and LOZO coverage by zone;
- spatial `shared_boundary` and `inward_transfer` candidates for manual review;
- permanent bicycle-count sensors and finalized polarity classes;
- punctual campaign profiles for 2021, 2022 and 2023;
- methodology and known limitations.

It does not publish prediction, forecasting, reconstruction, external
validation, or future directional-output results.

## Site structure

```text
Bordeaux-Mobilite/
|-- index.html
|-- study-area.html
|-- permanent-counts.html
|-- punctual-counts.html
|-- methodology.html
|-- explorers/
|   |-- permanent-temporal-audit.html
|   |-- permanent-polarity.html
|   `-- punctual-polarity.html
|-- assets/
|   |-- css/style.css
|   |-- js/app.js
|   `-- images/
`-- data/
```

## Regenerate spatial coverage data

From the research repository:

```bash
cd ~/work/Bordeaux-Mobilite
PYTHONPATH=src .venv/bin/python scripts/spatial/build_spatial_coverage_candidates.py
```

The script reads the current spatial, temporal-cleaning and observed-clean
assets. It writes the map GeoJSON files into:

```text
~/work/selyaktini.github.io/Bordeaux-Mobilite/data/
```

Candidate CSV files and the audit report are written into:

```text
~/work/Bordeaux-Mobilite/reports/quality_checks/spatial_coverage/
```

The command does not modify the canonical sensor-zone mappings and does not
rebuild zonal series or modelling datasets.

## Exported spatial sources

File-level provenance is documented in:

```text
data/source_manifest.json
```

Main sources for the coverage map:

- `data/interim/spatial/06_rocade_study_area/rocade_study_area.gpkg`
- `data/interim/spatial/01_zones_capteurs/association_capteurs_zones.gpkg`
- `data/interim/temporal/01_comptages_velos/capteurs_temporal_zone_mapping.parquet`
- `data/interim/temporal/02_capteurs_nettoyes/capteurs_hourly_clean.parquet`
- `data/processed/observed_modeling_base/usable_zones.csv`
- `data/processed/phase1_reconstruction_observed_clean/lozo_targets.parquet`

## Intentionally not published

The website does not publish:

- raw Excel workbooks;
- raw CSV files;
- source data under `data/raw/`;
- Parquet source tables;
- complete hourly observation tables as public data files;
- large modelling artifacts;
- model weights;
- punctual X/Y coordinates or punctual map layers;
- private or unnecessary metadata.

## Local preview

From this directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```
