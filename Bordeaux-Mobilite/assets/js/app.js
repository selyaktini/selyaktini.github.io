(function () {
  "use strict";

  const DATA_ROOT = "data/";
  const CLASS_ORDER = [0, 1, 2, -1];
  const CLASS_META = {
    "-1": { label: "données insuffisantes", shortLabel: "insuffisant", color: "#6f7b89", className: "class-insufficient" },
    "0": { label: "dominante matin", shortLabel: "matin", color: "#c79a45", className: "class-morning" },
    "1": { label: "dominante soir", shortLabel: "soir", color: "#9b82d0", className: "class-evening" },
    "2": { label: "équilibré", shortLabel: "équilibré", color: "#4fa69c", className: "class-balanced" }
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatValue(value) {
    if (typeof value === "number") {
      return value.toLocaleString("fr-FR");
    }
    return String(value == null ? "" : value);
  }

  function getByPath(object, path) {
    return path.split(".").reduce((current, key) => {
      if (current == null) {
        return undefined;
      }
      return current[key];
    }, object);
  }

  function renderProjectMetrics(metrics) {
    document.querySelectorAll("[data-metric-path]").forEach((element) => {
      const value = getByPath(metrics, element.getAttribute("data-metric-path") || "");
      if (value == null) {
        return;
      }
      const prefix = element.getAttribute("data-metric-prefix") || "";
      element.textContent = `${prefix}${formatValue(value)}`;
    });
  }

  async function loadJson(path) {
    const isAbsolute = /^(?:https?:)?\/\//.test(path) || path.startsWith("/");
    const response = await fetch(isAbsolute ? path : DATA_ROOT + path);
    if (!response.ok) {
      throw new Error(`Chargement impossible : ${path}`);
    }
    return response.json();
  }

  function classMeta(type) {
    return CLASS_META[String(type)] || CLASS_META["-1"];
  }

  function colorForType(type) {
    return classMeta(type).color;
  }

  function normalizeCounts(rows, valueKey) {
    const byType = {};
    rows.forEach((row) => {
      byType[String(row.polarity_type)] = Number(row[valueKey] || 0);
    });
    return CLASS_ORDER.map((type) => ({
      type,
      count: byType[String(type)] || 0,
      ...classMeta(type)
    }));
  }

  function percentage(count, total) {
    if (!total) {
      return "0 %";
    }
    return `${(count / total * 100).toLocaleString("fr-FR", {
      maximumFractionDigits: 1
    })} %`;
  }

  function distributionSegments(counts, total) {
    return counts.map((item) => {
      const width = item.count && total ? (item.count / total) * 100 : 0;
      const label = `${item.label} : ${formatValue(item.count)} (${percentage(item.count, total)})`;
      return `<span class="stack-segment ${item.className}" style="width:${width}%" title="${escapeHtml(label)}"></span>`;
    }).join("");
  }

  function renderDistributionElement(element, rows, valueKey) {
    const counts = normalizeCounts(rows, valueKey);
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    const title = element.getAttribute("aria-label") || "Répartition des classes";
    const segments = distributionSegments(counts, total);
    const list = counts.map((item) => `
      <li>
        <span class="label-with-swatch"><span class="swatch ${item.className}"></span>${escapeHtml(item.label)}</span>
        <strong><span>${formatValue(item.count)}</span><span class="count-percent">${percentage(item.count, total)}</span></strong>
      </li>
    `).join("");
    element.innerHTML = `
      <div class="stacked-bar" role="img" aria-label="${escapeHtml(title)}">${segments}</div>
      <ul class="count-list">${list}</ul>
    `;
  }

  function renderPermanentDistribution(metrics) {
    const rows = getByPath(metrics, "permanent_counts.type_counts") || [];
    document.querySelectorAll("[data-distribution='permanent']").forEach((element) => {
      renderDistributionElement(element, rows, "n_sensors");
    });
  }

  function renderPermanentTable(metrics) {
    const table = document.getElementById("permanent-type-table");
    if (!table) {
      return;
    }
    const rows = normalizeCounts(getByPath(metrics, "permanent_counts.type_counts") || [], "n_sensors");
    table.innerHTML = rows.map((row) => `
      <tr>
        <td><span class="label-with-swatch"><span class="swatch ${row.className}"></span>${escapeHtml(row.label)}</span></td>
        <td><strong class="mono">${formatValue(row.count)}</strong></td>
      </tr>
    `).join("");
  }

  function renderTemporalPreview(metrics) {
    document.querySelectorAll("[data-temporal-preview]").forEach((element) => {
      const exportedSensors = getByPath(metrics, "permanent_counts.n_directional_sensors") || 0;
      const rows = getByPath(metrics, "permanent_counts.time_span_utc.n_hourly_observation_rows") || 0;
      const sensors = getByPath(metrics, "permanent_counts.time_span_utc.n_sensors_in_hourly_table") || exportedSensors;
      const period = getByPath(metrics, "permanent_counts.zonal_series.period_display") || "non documentée";
      element.innerHTML = `
        <div class="preview-metrics">
          <div><strong>${formatValue(sensors)}</strong><span>capteurs suivis</span></div>
          <div><strong>${formatValue(rows)}</strong><span>observations horaires</span></div>
          <div><strong>${escapeHtml(period)}</strong><span>période publiée</span></div>
        </div>
        <p>La vue détaillée permet de sélectionner un capteur et de comparer les séries horaires.</p>
      `;
    });
  }

  function renderPunctualYearTable(metrics) {
    const table = document.getElementById("punctual-year-table");
    if (!table) {
      return;
    }
    const rows = getByPath(metrics, "punctual_counts.by_year") || [];
    table.innerHTML = rows.map((row) => {
      const byType = {};
      row.type_counts.forEach((item) => {
        byType[item.polarity_type] = item.n_units;
      });
      return `
        <tr>
          <td><strong class="mono">${escapeHtml(row.campaign_year)}</strong></td>
          <td>${formatValue(row.n_directional_units)}</td>
          <td>${formatValue(byType[0] || 0)}</td>
          <td>${formatValue(byType[1] || 0)}</td>
          <td>${formatValue(byType[2] || 0)}</td>
          <td>${formatValue(byType[-1] || 0)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPunctualPreview(row) {
    document.querySelectorAll("[data-punctual-preview]").forEach((element) => {
      const counts = normalizeCounts(row.type_counts, "n_units");
      const total = counts.reduce((sum, item) => sum + item.count, 0);
      element.innerHTML = `
        <div class="year-strip selected-year-strip">
          <div class="year-strip-head">
            <strong>${escapeHtml(row.campaign_year)}</strong>
            <span>${formatValue(row.n_directional_units)} unités directionnelles</span>
          </div>
          <div class="stacked-bar compact" role="img" aria-label="Distribution ${escapeHtml(row.campaign_year)}">${distributionSegments(counts, total)}</div>
        </div>
      `;
    });
  }

  function renderPunctualYearComparison(metrics, selectedYear) {
    const rows = getByPath(metrics, "punctual_counts.by_year") || [];
    document.querySelectorAll("[data-year-comparison='punctual']").forEach((element) => {
      element.innerHTML = rows.map((row) => {
        const counts = normalizeCounts(row.type_counts, "n_units");
        const total = counts.reduce((sum, item) => sum + item.count, 0);
        const className = Number(row.campaign_year) === Number(selectedYear) ? "year-strip is-selected" : "year-strip";
        const values = counts.map((item) => `
          <span><span class="swatch ${item.className}"></span>${escapeHtml(item.shortLabel)} ${formatValue(item.count)}</span>
        `).join("");
        return `
          <div class="${className}">
            <div class="year-strip-head">
              <strong>${escapeHtml(row.campaign_year)}</strong>
              <span>${formatValue(row.n_directional_units)} unités</span>
            </div>
            <div class="stacked-bar compact" role="img" aria-label="Distribution ${escapeHtml(row.campaign_year)}">${distributionSegments(counts, total)}</div>
            <div class="mini-counts">${values}</div>
          </div>
        `;
      }).join("");
    });
  }

  function renderPunctualSelected(metrics, selectedYear) {
    const rows = getByPath(metrics, "punctual_counts.by_year") || [];
    const year = Number(selectedYear);
    const row = rows.find((item) => Number(item.campaign_year) === year) || rows[rows.length - 1];
    if (!row) {
      return;
    }

    document.querySelectorAll("[data-selected-year]").forEach((element) => {
      element.textContent = row.campaign_year;
    });
    document.querySelectorAll("[data-punctual-summary]").forEach((element) => {
      element.textContent = `${row.campaign_year} : ${formatValue(row.n_directional_units)} unités directionnelles, ${formatValue(row.n_classifiable_units)} unités classables.`;
    });
    document.querySelectorAll("[data-distribution='punctual']").forEach((element) => {
      renderDistributionElement(element, row.type_counts, "n_units");
    });
    renderPunctualPreview(row);
    renderPunctualYearComparison(metrics, row.campaign_year);
  }

  function initPunctualTabs(metrics) {
    const rows = getByPath(metrics, "punctual_counts.by_year") || [];
    const tabs = document.querySelectorAll("[data-year-tabs]");
    if (!tabs.length || !rows.length) {
      return;
    }
    const latestYear = rows[rows.length - 1].campaign_year;

    tabs.forEach((container) => {
      if (!container.children.length) {
        rows.forEach((row) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = row.campaign_year;
          button.setAttribute("data-year", row.campaign_year);
          container.appendChild(button);
        });
      }
      container.querySelectorAll("button").forEach((button) => {
        const year = Number(button.getAttribute("data-year") || button.textContent);
        button.setAttribute("aria-pressed", String(year === Number(latestYear)));
        button.addEventListener("click", () => {
          document.querySelectorAll("[data-year-tabs] button").forEach((item) => {
            const itemYear = Number(item.getAttribute("data-year") || item.textContent);
            item.setAttribute("aria-pressed", String(itemYear === year));
          });
          renderPunctualSelected(metrics, year);
        });
      });
    });
    renderPunctualSelected(metrics, latestYear);
  }

  function setActiveNav() {
    const file = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".primary-nav a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const target = href.split("/").pop() || "index.html";
      if (target === file) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function buildBaseMap(element) {
    const map = L.map(element, {
      scrollWheelZoom: false,
      preferCanvas: true
    }).setView([44.837, -0.588], 12);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap &copy; CARTO"
    }).addTo(map);

    L.control.scale({ imperial: false }).addTo(map);
    if (map.zoomControl) {
      map.zoomControl._zoomInButton.setAttribute("title", "Zoom avant");
      map.zoomControl._zoomOutButton.setAttribute("title", "Zoom arrière");
    }
    setTimeout(() => map.invalidateSize(), 100);
    return map;
  }

  function showMapFallback(element) {
    element.classList.add("map-fallback");
    element.innerHTML = '<p class="map-status">Carte indisponible : les données cartographiques n\'ont pas pu être chargées.</p>';
  }

  const ZONE_STYLES = {
    observed_clean: {
      color: "#26736d",
      weight: 1.1,
      fillColor: "#4fa69c",
      fillOpacity: 0.58
    },
    raw_hourly_not_retained: {
      color: "#a66f17",
      weight: 0.9,
      fillColor: "#e2b85f",
      fillOpacity: 0.5
    },
    unobserved: {
      color: "#8395a4",
      weight: 0.55,
      fillColor: "#dfe8ee",
      fillOpacity: 0.34
    },
    excluded_exterior: {
      color: "#697785",
      weight: 0.85,
      dashArray: "5 4",
      fillColor: "#aab4bd",
      fillOpacity: 0.16
    }
  };

  const ZONE_STATUS_LABELS = {
    interior: "intérieure",
    boundary: "frontière",
    exterior: "extérieure exclue"
  };

  function yesNo(value) {
    return value ? "oui" : "non";
  }

  function zoneStyle(feature) {
    const properties = feature.properties || {};
    let status = properties.map_status;
    if (!status) {
      status = properties.has_hourly_series ? "raw_hourly_not_retained" : "unobserved";
    }
    return ZONE_STYLES[status] || ZONE_STYLES.unobserved;
  }

  function modelingZoneStyle() {
    return {
      color: "#7f92a1",
      weight: 0.7,
      fillColor: "#dfe8ee",
      fillOpacity: 0.5
    };
  }

  function rocadeStyle() {
    return {
      color: "#263f56",
      weight: 2,
      fillOpacity: 0
    };
  }

  function sensorMarker(feature, latlng, radius) {
    const properties = feature.properties || {};
    return L.circleMarker(latlng, {
      radius,
      color: "#ffffff",
      weight: 1.15,
      fillColor: colorForType(properties.polarity_type),
      fillOpacity: 0.95
    });
  }

  function zonePopup(properties) {
    const commune = properties.commune || properties.zone_commune || "non documentée";
    const zoneStatus = ZONE_STATUS_LABELS[properties.zone_status] || properties.zone_status || "non documenté";
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(commune)}<br>
      Statut spatial : ${escapeHtml(zoneStatus)}<br>
      Série horaire brute : ${yesNo(properties.has_raw_hourly_series)}<br>
      Observed-clean : ${yesNo(properties.is_observed_clean)}<br>
      Cible LOZO : ${yesNo(properties.is_lozo_target)}<br>
      Capteurs spatiaux : ${formatValue(properties.sensor_count || 0)}<br>
      Capteurs temporels actifs : ${formatValue(properties.n_active_temporal_sensors || 0)}
    `;
  }

  function simpleZonePopup(properties) {
    const commune = properties.commune || properties.zone_commune || "non documentée";
    const zoneStatus = ZONE_STATUS_LABELS[properties.zone_status] || properties.zone_status || "non documenté";
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(commune)}<br>
      Position dans le périmètre : ${escapeHtml(zoneStatus)}
    `;
  }

  function sensorPopup(properties) {
    const meta = classMeta(properties.polarity_type);
    return `
      <strong>${escapeHtml(properties.sensor_ident)}</strong><br>
      ${escapeHtml(properties.sensor_name || "")}<br>
      Type : ${escapeHtml(properties.sensor_type || "")}<br>
      Zone actuelle : ${escapeHtml(properties.current_zone_id || "non documentée")}<br>
      Statut temporel : ${escapeHtml(properties.temporal_status || "non documenté")}<br>
      Classe : ${escapeHtml(meta.label)}<br>
      Jours valides : ${formatValue(properties.n_valid_days)}
    `;
  }

  function permanentZoneStyle() {
    return {
      color: "#26736d",
      weight: 1,
      fillColor: "#4fa69c",
      fillOpacity: 0.58
    };
  }

  function permanentZonePopup(properties) {
    const commune = properties.zone_commune || "non documentée";
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(commune)}<br>
      Capteurs directionnels mappés : ${formatValue(properties.n_mapped_directional_sensors || 0)}<br>
      Observations <span class="mono">y_obs</span> disponibles : ${formatValue(properties.n_clean_observations || 0)}
    `;
  }

  function permanentSensorMarker(feature, latlng) {
    return L.circleMarker(latlng, {
      radius: 5,
      color: "#ffffff",
      weight: 1.1,
      fillColor: "#263f56",
      fillOpacity: 0.9
    });
  }

  function permanentSensorPopup(properties) {
    return `
      <strong>${escapeHtml(properties.sensor_ident)}</strong><br>
      ${escapeHtml(properties.sensor_name || "")}<br>
      Type : ${escapeHtml(properties.sensor_type || "non documenté")}<br>
      Zone : ${escapeHtml(properties.zone_id || "hors mapping")}<br>
      Observations nettoyées : ${formatValue(properties.n_clean_observations || 0)}
    `;
  }

  function candidateMarker(feature, latlng) {
    const properties = feature.properties || {};
    const shared = properties.candidate_type === "shared_boundary";
    const typeClass = shared ? "candidate-shared" : "candidate-inward";
    return L.marker(latlng, {
      keyboard: true,
      title: `${properties.candidate_type || "candidat"} — ${properties.sensor_ident || ""}`,
      icon: L.divIcon({
        className: "candidate-map-marker",
        html: `<span class="${typeClass}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -8]
      })
    });
  }

  function formatDistance(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance)) {
      return "non documentée";
    }
    return `${distance.toLocaleString("fr-FR", {
      maximumFractionDigits: distance < 100 ? 1 : 0
    })} m`;
  }

  function candidatePopup(properties) {
    const isShared = properties.candidate_type === "shared_boundary";
    const typeLabel = isShared ? "shared_boundary" : "inward_transfer";
    const distanceLabel = isShared ? "Distance à la frontière partagée" : "Distance à la zone candidate";
    const distance = isShared
      ? properties.distance_to_shared_boundary_m
      : properties.distance_to_candidate_zone_m;
    const rocadeDistance = !isShared && properties.distance_to_rocade_boundary_m != null
      ? `<br>Distance à la rocade : ${formatDistance(properties.distance_to_rocade_boundary_m)}`
      : "";
    const temporalStatus = properties.current_temporal_quality
      ? `${properties.temporal_status || "non documenté"} — ${properties.current_temporal_quality}`
      : properties.temporal_status || "non documenté";
    return `
      <strong>${escapeHtml(properties.sensor_ident)}</strong><br>
      physical_sensor_id : ${escapeHtml(properties.physical_sensor_id)}<br>
      Zone actuelle : ${escapeHtml(properties.current_zone_id)}<br>
      Zone candidate : ${escapeHtml(properties.candidate_zone_id)}<br>
      ${escapeHtml(distanceLabel)} : ${formatDistance(distance)}${rocadeDistance}<br>
      Statut temporel : ${escapeHtml(temporalStatus)}<br>
      Type de candidature : ${escapeHtml(typeLabel)}
    `;
  }

  function createCandidateLayer(candidates) {
    return L.geoJSON(candidates, {
      pointToLayer(feature, latlng) {
        return candidateMarker(feature, latlng);
      },
      onEachFeature(feature, layer) {
        layer.bindPopup(candidatePopup(feature.properties || {}));
      }
    });
  }

  function createUnobservedLabelLayer(map, zones) {
    const labelLayer = L.layerGroup();
    let enabled = false;
    const features = (zones.features || []).filter((feature) => {
      const properties = feature.properties || {};
      return !properties.is_observed_clean;
    });

    function renderLabels() {
      labelLayer.clearLayers();
      if (!enabled || map.getZoom() < 14) {
        return;
      }
      features.forEach((feature) => {
        const properties = feature.properties || {};
        const latitude = Number(properties.label_lat);
        const longitude = Number(properties.label_lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return;
        }
        const marker = L.marker([latitude, longitude], {
          interactive: true,
          keyboard: true,
          icon: L.divIcon({
            className: "zone-id-label",
            html: `<span>${escapeHtml(properties.zone_id)}</span>`
          })
        });
        marker.bindPopup(zonePopup(properties));
        marker.addTo(labelLayer);
      });
    }

    map.on("zoomend", renderLabels);
    map.on("overlayadd", (event) => {
      if (event.layer === labelLayer) {
        enabled = true;
        renderLabels();
      }
    });
    map.on("overlayremove", (event) => {
      if (event.layer === labelLayer) {
        enabled = false;
        labelLayer.clearLayers();
      }
    });
    return labelLayer;
  }

  async function initSimpleAreaMap(elementId, showLayerControl) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const [zones, rocade] = await Promise.all([
        loadJson("zones_modeling.geojson"),
        loadJson("rocade_interior.geojson")
      ]);

      const map = buildBaseMap(element);
      const zonesLayer = L.geoJSON(zones, {
        style: modelingZoneStyle,
        onEachFeature(feature, layer) {
          layer.bindPopup(simpleZonePopup(feature.properties || {}));
        }
      }).addTo(map);

      const rocadeLayer = L.geoJSON(rocade, {
        style: rocadeStyle
      }).addTo(map);

      if (showLayerControl) {
        L.control.layers(null, {
          "Périmètre de la rocade": rocadeLayer,
          "Zones de modélisation": zonesLayer
        }, { collapsed: true }).addTo(map);
      }

      const bounds = rocadeLayer.getBounds().isValid() ? rocadeLayer.getBounds() : zonesLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.035));
      }
    } catch (error) {
      console.error(error);
      showMapFallback(element);
    }
  }

  function initHomeMap() {
    return initSimpleAreaMap("home-map", false);
  }

  function initStudyAreaMap() {
    return initSimpleAreaMap("study-area-map", true);
  }

  async function initPermanentMap() {
    const element = document.getElementById("permanent-map");
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const zones = await loadJson("permanent_zones.geojson");
      const map = buildBaseMap(element);
      const zonesLayer = L.geoJSON(zones, {
        style: permanentZoneStyle,
        onEachFeature(feature, layer) {
          layer.bindPopup(permanentZonePopup(feature.properties || {}));
        }
      }).addTo(map);

      const overlays = { "Zones avec observations permanentes": zonesLayer };
      try {
        const sensors = await loadJson("permanent_sensors.geojson");
        overlays["Capteurs directionnels"] = L.geoJSON(sensors, {
          pointToLayer(feature, latlng) {
            return permanentSensorMarker(feature, latlng);
          },
          onEachFeature(feature, layer) {
            layer.bindPopup(permanentSensorPopup(feature.properties || {}));
          }
        });
      } catch (sensorError) {
        console.warn("Couche secondaire des capteurs indisponible.", sensorError);
      }

      L.control.layers(null, overlays, { collapsed: true }).addTo(map);
      const bounds = zonesLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.055));
      }
    } catch (error) {
      console.error(error);
      showMapFallback(element);
    }
  }

  function renderPermanentProvenance(index) {
    const provenance = index.provenance || {};
    const values = {
      "[data-permanent-source]": provenance.canonical_zonal_source,
      "[data-permanent-producer]": provenance.producer,
      "[data-permanent-period]": index.period_display
    };
    Object.entries(values).forEach(([selector, value]) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.textContent = value || "non documenté";
      });
    });

    let generatedAt = provenance.generated_at_utc || "non documenté";
    const parsedDate = new Date(generatedAt);
    if (!Number.isNaN(parsedDate.getTime())) {
      generatedAt = parsedDate.toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Paris"
      });
    }
    document.querySelectorAll("[data-permanent-generated-at]").forEach((element) => {
      element.textContent = generatedAt;
    });
  }

  async function initPermanentExplorer() {
    const select = document.getElementById("permanent-zone-select");
    const plot = document.getElementById("permanent-zone-plot");
    const status = document.getElementById("permanent-explorer-status");
    const summary = document.getElementById("permanent-zone-summary");
    if (!select || !plot || !status) {
      return;
    }

    let index;
    try {
      index = await loadJson("permanent-temporal/index.json");
      renderPermanentProvenance(index);
    } catch (error) {
      console.error(error);
      status.textContent = "L’index des séries zonales n’a pas pu être chargé.";
      return;
    }

    if (typeof Plotly === "undefined") {
      status.textContent = "La bibliothèque de tracé n’a pas pu être chargée.";
      return;
    }

    const zones = Array.isArray(index.zones) ? index.zones : [];
    if (!zones.length) {
      status.textContent = "Aucune série zonale n’est disponible.";
      return;
    }

    select.innerHTML = "";
    zones.forEach((zone) => {
      const option = document.createElement("option");
      option.value = zone.id;
      option.textContent = zone.commune
        ? `${zone.id} — ${zone.commune}`
        : zone.id;
      select.appendChild(option);
    });
    select.disabled = false;

    const plotConfig = {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d"]
    };
    let requestNumber = 0;

    async function renderZone(zoneId) {
      const zone = zones.find((item) => item.id === zoneId);
      if (!zone) {
        return;
      }
      const currentRequest = ++requestNumber;
      select.disabled = true;
      status.textContent = `Chargement de la zone ${zone.id}…`;
      if (summary) {
        summary.textContent = "";
      }

      try {
        const payload = await loadJson(zone.path);
        if (currentRequest !== requestNumber) {
          return;
        }
        const traces = [
          {
            type: "scattergl",
            mode: "lines",
            name: "y_obs nettoyé",
            x: payload.timestamps,
            y: payload.y_obs,
            customdata: payload.n_sensors_obs,
            connectgaps: false,
            line: { color: "#26736d", width: 1.2 },
            hovertemplate: "date=%{x}<br>y_obs=%{y}<br>capteurs disponibles=%{customdata}<extra></extra>"
          },
          {
            type: "scattergl",
            mode: "lines",
            name: "n_sensors_obs",
            x: payload.timestamps,
            y: payload.n_sensors_obs,
            connectgaps: false,
            line: { color: "#8395a4", width: 1, shape: "hv" },
            opacity: 0.55,
            yaxis: "y2",
            hovertemplate: "date=%{x}<br>capteurs disponibles=%{y}<extra></extra>"
          }
        ];
        const layout = {
          template: "plotly_white",
          title: { text: `Zone ${payload.zone_id}`, font: { size: 16 } },
          hovermode: "x unified",
          dragmode: "pan",
          margin: { l: 65, r: 65, t: 55, b: 60 },
          legend: { orientation: "h", y: 1.08 },
          xaxis: {
            title: "Date",
            rangeselector: {
              buttons: [
                { count: 7, label: "7 j", step: "day", stepmode: "backward" },
                { count: 1, label: "1 mois", step: "month", stepmode: "backward" },
                { count: 3, label: "3 mois", step: "month", stepmode: "backward" },
                { label: "Tout", step: "all" }
              ]
            },
            rangeslider: { visible: true }
          },
          yaxis: { title: "y_obs", rangemode: "tozero" },
          yaxis2: {
            title: "Capteurs disponibles",
            overlaying: "y",
            side: "right",
            rangemode: "tozero",
            showgrid: false,
            dtick: 1
          },
          uirevision: payload.zone_id
        };
        await Plotly.react(plot, traces, layout, plotConfig);
        status.textContent = `Série chargée : ${formatValue(payload.n_clean_observations)} observations nettoyées.`;
        if (summary) {
          summary.textContent = `${formatValue(zone.n_mapped_directional_sensors)} capteur(s) mappé(s)`;
        }
      } catch (error) {
        console.error(error);
        status.textContent = `La série de la zone ${zone.id} n’a pas pu être chargée.`;
      } finally {
        if (currentRequest === requestNumber) {
          select.disabled = false;
        }
      }
    }

    select.addEventListener("change", () => renderZone(select.value));
    await renderZone(zones[0].id);
  }

  async function initMetrics() {
    try {
      const metrics = await loadJson("site_metrics.json");
      renderProjectMetrics(metrics);
      renderPermanentDistribution(metrics);
      renderPermanentTable(metrics);
      renderTemporalPreview(metrics);
      renderPunctualYearTable(metrics);
      initPunctualTabs(metrics);
    } catch (error) {
      console.error(error);
      document.querySelectorAll("[data-load-error]").forEach((element) => {
        element.textContent = "Les données publiques n'ont pas pu être chargées.";
      });
    }
  }

  async function boot() {
    setActiveNav();
    await Promise.allSettled([
      initMetrics(),
      initHomeMap(),
      initStudyAreaMap(),
      initPermanentMap(),
      initPermanentExplorer()
    ]);
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
