# Bordeaux Bicycle Counts Explorer

Static public explorer for documented Bordeaux-Mobilite bicycle-count work.

Expected GitHub Pages URL:

```bash
https://selyaktini.github.io/Bordeaux-Mobilite/
```

## Purpose

This site is a lightweight public data-exploration interface. It summarizes:

- the Bordeaux rocade study perimeter and modelling zones;
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

## Regenerate public data

From the research repository:

```bash
cd ~/work/Bordeaux-Mobilite
.venv/bin/python scripts/export_website_data.py
```

The script writes public files into:

```text
~/work/selyaktini.github.io/Bordeaux-Mobilite/data/
```

and copies the three existing HTML explorers into:

```text
~/work/selyaktini.github.io/Bordeaux-Mobilite/explorers/
```

## Exported sources

The export script documents file-level provenance in:

```text
data/source_manifest.json
```

Main sources currently used:

- `data/processed/temporal/sensor_polarity_classification.csv`
- `reports/quality_checks/punctual_counts/punctual_polarity_summary.csv`
- `data/interim/temporal/01_comptages_velos/capteurs_comptages_hourly.parquet`
- `data/processed/phase1_reconstruction/metadata.json`
- `data/interim/spatial/06_rocade_study_area/rocade_study_area.gpkg`
- `data/interim/spatial/01_zones_capteurs/capteurs_velo.gpkg`
- `reports/figures/sensors/flux_horaires_par_capteur_explorable.html`
- `reports/figures/sensors/morning_evening_classification.html`
- `reports/figures/sensors/punctual_morning_evening_classification.html`

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
