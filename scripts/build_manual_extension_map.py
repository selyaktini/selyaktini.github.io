#!/usr/bin/env python3
"""Ajoute à la carte Folium publiée la couche des zones d'extension manuelle."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


SITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SITE_ROOT.parent / "Bordeaux-Mobilite"

DEFAULT_CONFIG_PATH = (
    SITE_ROOT / "Bordeaux-Mobilite/data/manual_extension_zones.csv"
)
DEFAULT_ZONES_PATH = (
    PROJECT_ROOT
    / "data/interim/spatial/06_rocade_study_area/rocade_study_area.gpkg"
)
DEFAULT_INPUT_PATH = SITE_ROOT / "index.html"
DEFAULT_OUTPUT_PATH = SITE_ROOT / "index.html"

PANEL_BEGIN = "<!-- BEGIN GENERATED MANUAL EXTENSION PANEL -->"
PANEL_END = "<!-- END GENERATED MANUAL EXTENSION PANEL -->"
SCRIPT_BEGIN = "// BEGIN GENERATED MANUAL EXTENSION LAYER"
SCRIPT_END = "// END GENERATED MANUAL EXTENSION LAYER"
CONTROL_BEGIN = "// BEGIN GENERATED MANUAL EXTENSION CONTROL"
CONTROL_END = "// END GENERATED MANUAL EXTENSION CONTROL"

LAYER_NAME = "Zones d’extension manuelle"
ZONE_ID_PATTERN = re.compile(r"\d{9}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Régénère la couche des zones d'extension manuelle dans l'export "
            "Folium existant, sans modifier ses autres couches."
        )
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--zones", type=Path, default=DEFAULT_ZONES_PATH)
    parser.add_argument("--zones-layer", default="zones_candidates")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


def load_extension_data(
    config_path: Path,
    zones_path: Path,
    zones_layer: str,
) -> gpd.GeoDataFrame:
    if not config_path.is_file():
        raise FileNotFoundError(f"CSV de configuration introuvable : {config_path}")
    if not zones_path.is_file():
        raise FileNotFoundError(f"Données zonales introuvables : {zones_path}")

    configured = pd.read_csv(config_path, dtype={"zone_id": "string"})
    if list(configured.columns) != ["zone_id"]:
        raise ValueError("Le CSV de configuration doit contenir uniquement zone_id.")
    configured["zone_id"] = configured["zone_id"].str.strip()
    if configured["zone_id"].isna().any():
        raise ValueError("Le CSV de configuration contient un zone_id manquant.")
    invalid_ids = [
        zone_id
        for zone_id in configured["zone_id"]
        if not ZONE_ID_PATTERN.fullmatch(zone_id)
    ]
    if invalid_ids:
        raise ValueError(f"zone_id configurés invalides : {invalid_ids}")
    duplicated_ids = configured.loc[
        configured["zone_id"].duplicated(keep=False), "zone_id"
    ].tolist()
    if duplicated_ids:
        raise ValueError(
            f"zone_id configurés dupliqués : {sorted(set(duplicated_ids))}"
        )

    zones = gpd.read_file(zones_path, layer=zones_layer)[["zone_id", "geometry"]]
    zones = zones.copy()
    zones["zone_id"] = zones["zone_id"].astype("string").str.strip()
    if zones["zone_id"].duplicated().any():
        duplicated_zones = sorted(
            zones.loc[zones["zone_id"].duplicated(keep=False), "zone_id"]
            .dropna()
            .unique()
            .tolist()
        )
        raise ValueError(
            f"Les données zonales contiennent des zone_id dupliqués : {duplicated_zones}"
        )

    extension = configured.merge(
        zones,
        on="zone_id",
        how="left",
        validate="one_to_one",
    )
    extension = gpd.GeoDataFrame(extension, geometry="geometry", crs=zones.crs)

    missing_geometry = extension["geometry"].isna()
    visible = extension.loc[~missing_geometry].copy().to_crs(epsg=4326)
    return visible[["zone_id", "geometry"]]


def extension_geojson(visible: gpd.GeoDataFrame) -> str:
    payload = json.loads(visible.to_json(drop_id=True))
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).replace("</", "<\\/")


def build_panel() -> str:
    return f"""{PANEL_BEGIN}
<style>
  .manual-extension-panel {{
    position: fixed;
    right: 18px;
    bottom: 24px;
    z-index: 1000;
    width: 220px;
    box-sizing: border-box;
    background: rgba(255,255,255,0.97);
    border: 1px solid #9ca3af;
    border-radius: 5px;
    padding: 9px 11px;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 1px 4px rgba(0,0,0,0.16);
  }}
  .manual-extension-panel .swatch {{
    display: inline-block;
    width: 14px;
    height: 12px;
    margin-right: 5px;
    vertical-align: -2px;
    box-sizing: border-box;
  }}
  @media (max-width: 760px) {{
    .manual-extension-panel {{
      right: 8px;
      bottom: 8px;
      width: min(220px, calc(100vw - 16px));
    }}
  }}
</style>
<div class="manual-extension-panel">
  <b>Zones d’extension manuelle</b><br>
  <span class="swatch" style="background:#f59e0b;border:2px solid #b45309;"></span>
  Zone sélectionnée
</div>
{PANEL_END}"""


def build_layer_script(geojson: str) -> str:
    template = r"""// BEGIN GENERATED MANUAL EXTENSION LAYER
        const manual_extension_zones_data = __GEOJSON__;

        function manualExtensionEscape(value) {
            return String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }

        function manualExtensionStyle() {
            return {
                color: "#b45309",
                weight: 2.2,
                opacity: 1,
                fillColor: "#f59e0b",
                fillOpacity: 0.58,
            };
        }

        function manualExtensionDetails(properties) {
            return `Zone : ${manualExtensionEscape(properties.zone_id)}`;
        }

        function manualExtensionOnEachFeature(feature, layer) {
            const details = manualExtensionDetails(feature.properties);
            layer.bindTooltip(details, {
                sticky: true,
                className: "foliumtooltip",
            });
            layer.bindPopup(details, {maxWidth: 360});
            layer.on({
                mouseover: function(event) {
                    event.target.setStyle({weight: 4.2, fillOpacity: 0.74});
                    event.target.bringToFront();
                },
                mouseout: function(event) {
                    manual_extension_zones.resetStyle(event.target);
                },
            });
        }

        const manual_extension_zones = L.geoJSON(
            manual_extension_zones_data,
            {
                style: manualExtensionStyle,
                onEachFeature: manualExtensionOnEachFeature,
            }
        );
// END GENERATED MANUAL EXTENSION LAYER"""
    return template.replace("__GEOJSON__", geojson)


def replace_marked_block(
    source: str,
    begin: str,
    end: str,
    replacement: str,
) -> tuple[str, bool]:
    pattern = re.compile(
        rf"{re.escape(begin)}.*?{re.escape(end)}",
        flags=re.DOTALL,
    )
    if not pattern.search(source):
        return source, False
    return pattern.sub(lambda _: replacement, source, count=1), True


def inject_panel(source: str, panel: str) -> str:
    source, replaced = replace_marked_block(source, PANEL_BEGIN, PANEL_END, panel)
    if replaced:
        return source
    map_div = re.search(r'(?m)^(?P<indent>\s*)<div class="folium-map"', source)
    if map_div is None:
        raise ValueError("Conteneur de la carte Folium introuvable.")
    return source[: map_div.start()] + panel + "\n\n" + source[map_div.start() :]


def inject_layer_script(source: str, layer_script: str) -> str:
    source, replaced = replace_marked_block(
        source, SCRIPT_BEGIN, SCRIPT_END, layer_script
    )
    if replaced:
        return source
    anchor = re.search(r"(?m)^\s*function bindZoneIdTooltips\(", source)
    if anchor is None:
        anchor = re.search(
            r"(?m)^\s*var layer_control_[A-Za-z0-9_]+_layers\s*=", source
        )
    if anchor is None:
        raise ValueError("Point d'insertion JavaScript Folium introuvable.")
    return (
        source[: anchor.start()]
        + "        "
        + layer_script
        + "\n\n"
        + source[anchor.start() :]
    )


def inject_layer_control(source: str) -> str:
    control_entry = (
        f"{CONTROL_BEGIN}\n"
        f'                    "{LAYER_NAME}" : manual_extension_zones,\n'
        f"                    {CONTROL_END}"
    )
    source, replaced = replace_marked_block(
        source, CONTROL_BEGIN, CONTROL_END, control_entry
    )
    if replaced:
        return source

    empty_overlays = re.compile(
        r"(?P<open>\boverlays\s*:\s*\{\s*\n)(?P<indent>\s*)(?P<close>\},)"
    )
    match = empty_overlays.search(source)
    if match is None:
        raise ValueError("Bloc overlays vide du contrôle Folium introuvable.")
    replacement = (
        match.group("open")
        + control_entry
        + "\n"
        + match.group("indent")
        + match.group("close")
    )
    return source[: match.start()] + replacement + source[match.end() :]


def rebuild_html(
    source: str,
    visible: gpd.GeoDataFrame,
) -> str:
    map_match = re.search(r"\bvar\s+(map_[A-Za-z0-9_]+)\s*=\s*L\.map\(", source)
    if map_match is None:
        raise ValueError("Variable de carte Folium introuvable.")

    result = inject_panel(source, build_panel())
    result = inject_layer_script(
        result,
        build_layer_script(extension_geojson(visible)),
    )
    result = inject_layer_control(result)
    return result


def main() -> None:
    args = parse_args()
    visible = load_extension_data(
        config_path=args.config.resolve(),
        zones_path=args.zones.resolve(),
        zones_layer=args.zones_layer,
    )

    input_path = args.input.resolve()
    output_path = args.output.resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"HTML Folium introuvable : {input_path}")

    source = input_path.read_text(encoding="utf-8")
    generated = rebuild_html(source, visible)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(generated, encoding="utf-8")

    print(f"Carte régénérée : {output_path}")


if __name__ == "__main__":
    main()
