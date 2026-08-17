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
  const COVERAGE_META = {
    both: { label: "Permanent + ponctuel", color: "#238b45" },
    punctual_only: { label: "Ponctuel uniquement", color: "#2171b5" },
    permanent_only: { label: "Permanent uniquement", color: "#d95f0e" },
    none: { label: "Aucune source", color: "#d9d9d9" }
  };
  let permanentSelectedZoneId = null;
  let punctualSelectedZoneId = null;
  let reconstructionSelectedZoneId = null;

  function selectPermanentZone(zoneId) {
    permanentSelectedZoneId = String(zoneId);
    document.dispatchEvent(new CustomEvent("permanent-zone-select", {
      detail: { zoneId: permanentSelectedZoneId }
    }));
  }

  function selectPunctualZone(zoneId) {
    punctualSelectedZoneId = String(zoneId);
    document.dispatchEvent(new CustomEvent("punctual-zone-select", {
      detail: { zoneId: punctualSelectedZoneId }
    }));
  }

  function selectReconstructionZone(zoneId) {
    reconstructionSelectedZoneId = String(zoneId);
    document.dispatchEvent(new CustomEvent("reconstruction-zone-select", {
      detail: { zoneId: reconstructionSelectedZoneId }
    }));
  }

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

  function renderCoverageDistribution(metrics) {
    const coverage = metrics.observation_coverage || {};
    document.querySelectorAll("[data-coverage-class]").forEach((element) => {
      const className = element.getAttribute("data-coverage-class");
      const count = Number(coverage[className] || 0);
      const meta = COVERAGE_META[className];
      element.style.flexGrow = count;
      if (meta) {
        element.setAttribute("title", `${meta.label} : ${formatValue(count)} zones`);
        element.setAttribute("aria-label", `${meta.label} : ${formatValue(count)} zones`);
      }
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

  function punctualZoneStyle() {
    return {
      color: "#8a5b12",
      weight: 1,
      fillColor: "#e2b85f",
      fillOpacity: 0.55
    };
  }

  function punctualZonePopup(properties) {
    const years = Array.isArray(properties.years_available)
      ? properties.years_available.join(", ")
      : "non documentées";
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(properties.commune || "non documentée")}<br>
      Années disponibles : ${escapeHtml(years)}
    `;
  }

  function punctualPointMarker(feature, latlng, selected) {
    return L.circleMarker(latlng, {
      radius: selected ? 6 : 4,
      color: "#ffffff",
      weight: selected ? 1.5 : 1,
      fillColor: "#5f4a7a",
      fillOpacity: selected ? 1 : 0.8
    });
  }

  function punctualPointPopup(properties) {
    const directions = Array.isArray(properties.direction_labels)
      ? properties.direction_labels.join(" / ")
      : properties.direction_labels || "non documentée";
    const address = properties.adresse
      ? `<br>Adresse : ${escapeHtml(properties.adresse)}`
      : "";
    return `
      <strong>Campagne ${escapeHtml(properties.campaign_year)} — ${escapeHtml(properties.poste)}</strong><br>
      Point : ${escapeHtml(properties.num_cpev)}<br>
      Direction : ${escapeHtml(directions)}${address}<br>
      Zone : ${escapeHtml(properties.zone_id)}
    `;
  }

  function observationCoverageStyle(feature) {
    const properties = feature.properties || {};
    const meta = COVERAGE_META[properties.coverage_class] || COVERAGE_META.none;
    return {
      color: properties.coverage_class === "none" ? "#8395a4" : "#ffffff",
      weight: properties.coverage_class === "none" ? 0.7 : 0.9,
      fillColor: meta.color,
      fillOpacity: properties.coverage_class === "none" ? 0.52 : 0.78
    };
  }

  function observationCoveragePopup(properties) {
    const meta = COVERAGE_META[properties.coverage_class] || COVERAGE_META.none;
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(properties.commune || "non documentée")}<br>
      Permanent : ${yesNo(properties.has_permanent)}<br>
      Ponctuel : ${yesNo(properties.has_punctual)}<br>
      Années ponctuelles : ${escapeHtml(properties.punctual_years || "aucune")}<br>
      Couverture : ${escapeHtml(meta.label)}
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
      const zoneLayers = new Map();
      const selectedSensorsLayer = L.layerGroup().addTo(map);
      let sensorFeatures = [];
      const zonesLayer = L.geoJSON(zones, {
        style: permanentZoneStyle,
        onEachFeature(feature, layer) {
          const properties = feature.properties || {};
          zoneLayers.set(String(properties.zone_id), layer);
          layer.bindPopup(permanentZonePopup(properties));
          layer.on("click", () => selectPermanentZone(properties.zone_id));
        }
      }).addTo(map);

      function showSelectedZone(zoneId) {
        const normalizedZoneId = String(zoneId);
        const selectedZoneLayer = zoneLayers.get(normalizedZoneId);
        if (!selectedZoneLayer) {
          return;
        }
        zonesLayer.resetStyle();
        selectedZoneLayer.setStyle({
          color: "#153f3c",
          weight: 4,
          fillOpacity: 0.72
        });
        selectedZoneLayer.bringToFront();

        selectedSensorsLayer.clearLayers();
        sensorFeatures
          .filter((feature) => String((feature.properties || {}).zone_id) === normalizedZoneId)
          .forEach((feature) => {
            const marker = permanentSensorMarker(feature, L.latLng(
              feature.geometry.coordinates[1],
              feature.geometry.coordinates[0]
            ));
            marker.bindPopup(permanentSensorPopup(feature.properties || {}));
            marker.on("click", () => selectPermanentZone(normalizedZoneId));
            marker.addTo(selectedSensorsLayer);
          });
      }

      document.addEventListener("permanent-zone-select", (event) => {
        showSelectedZone(event.detail.zoneId);
      });
      if (permanentSelectedZoneId !== null) {
        showSelectedZone(permanentSelectedZoneId);
      }

      const overlays = { "Zones avec observations permanentes": zonesLayer };
      try {
        const sensors = await loadJson("permanent_sensors.geojson");
        sensorFeatures = sensors.features || [];
        overlays["Capteurs directionnels"] = L.geoJSON(sensors, {
          pointToLayer(feature, latlng) {
            return permanentSensorMarker(feature, latlng);
          },
          onEachFeature(feature, layer) {
            const properties = feature.properties || {};
            layer.bindPopup(permanentSensorPopup(properties));
            layer.on("click", () => {
              if (zoneLayers.has(String(properties.zone_id))) {
                selectPermanentZone(properties.zone_id);
              }
            });
          }
        });
        if (permanentSelectedZoneId !== null) {
          showSelectedZone(permanentSelectedZoneId);
        }
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

  async function initPunctualMap() {
    const element = document.getElementById("punctual-map");
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const zones = await loadJson("punctual_zones.geojson");
      const map = buildBaseMap(element);
      const zoneLayers = new Map();
      const selectedPointsLayer = L.layerGroup().addTo(map);
      let pointFeatures = [];
      const zonesLayer = L.geoJSON(zones, {
        style: punctualZoneStyle,
        onEachFeature(feature, layer) {
          const properties = feature.properties || {};
          zoneLayers.set(String(properties.zone_id), layer);
          layer.bindPopup(punctualZonePopup(properties));
          layer.on("click", () => selectPunctualZone(properties.zone_id));
        }
      }).addTo(map);

      function showSelectedZone(zoneId) {
        const normalizedZoneId = String(zoneId);
        const selectedZoneLayer = zoneLayers.get(normalizedZoneId);
        if (!selectedZoneLayer) {
          return;
        }
        zonesLayer.resetStyle();
        selectedZoneLayer.setStyle({
          color: "#5d3909",
          weight: 4,
          fillOpacity: 0.72
        });
        selectedZoneLayer.bringToFront();

        selectedPointsLayer.clearLayers();
        pointFeatures
          .filter((feature) => String((feature.properties || {}).zone_id) === normalizedZoneId)
          .forEach((feature) => {
            const marker = punctualPointMarker(feature, L.latLng(
              feature.geometry.coordinates[1],
              feature.geometry.coordinates[0]
            ), true);
            marker.bindPopup(punctualPointPopup(feature.properties || {}));
            marker.on("click", () => selectPunctualZone(normalizedZoneId));
            marker.addTo(selectedPointsLayer);
          });
      }

      document.addEventListener("punctual-zone-select", (event) => {
        showSelectedZone(event.detail.zoneId);
      });
      if (punctualSelectedZoneId !== null) {
        showSelectedZone(punctualSelectedZoneId);
      }

      const overlays = { "Zones couvertes": zonesLayer };
      try {
        const points = await loadJson("punctual_points.geojson");
        pointFeatures = points.features || [];
        overlays["Points directionnels de campagne"] = L.geoJSON(points, {
          pointToLayer(feature, latlng) {
            return punctualPointMarker(feature, latlng, false);
          },
          onEachFeature(feature, layer) {
            const properties = feature.properties || {};
            layer.bindPopup(punctualPointPopup(properties));
            layer.on("click", () => {
              if (zoneLayers.has(String(properties.zone_id))) {
                selectPunctualZone(properties.zone_id);
              }
            });
          }
        });
        if (punctualSelectedZoneId !== null) {
          showSelectedZone(punctualSelectedZoneId);
        }
      } catch (pointError) {
        console.warn("Couche secondaire des points ponctuels indisponible.", pointError);
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

  async function initObservationCoverageMap() {
    const element = document.getElementById("observation-coverage-map");
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const coverage = await loadJson("observation_coverage.geojson");
      const map = buildBaseMap(element);
      const coverageLayer = L.geoJSON(coverage, {
        style: observationCoverageStyle,
        onEachFeature(feature, layer) {
          layer.bindPopup(observationCoveragePopup(feature.properties || {}));
          layer.on("mouseover", () => {
            layer.setStyle({ color: "#17202b", weight: 2, fillOpacity: 0.9 });
            layer.bringToFront();
          });
          layer.on("mouseout", () => coverageLayer.resetStyle(layer));
        }
      }).addTo(map);
      const bounds = coverageLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.035));
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

    document.addEventListener("permanent-zone-select", (event) => {
      const zoneId = event.detail.zoneId;
      if (!zones.some((zone) => zone.id === zoneId)) {
        return;
      }
      select.value = zoneId;
      renderZone(zoneId);
    });
    select.addEventListener("change", () => selectPermanentZone(select.value));
    const initialZoneId = zones.some((zone) => zone.id === permanentSelectedZoneId)
      ? permanentSelectedZoneId
      : zones[0].id;
    selectPermanentZone(initialZoneId);
  }

  async function initPunctualExplorer() {
    const select = document.getElementById("punctual-zone-select");
    const plot = document.getElementById("punctual-zone-plot");
    const status = document.getElementById("punctual-explorer-status");
    const summary = document.getElementById("punctual-zone-summary");
    if (!select || !plot || !status) {
      return;
    }

    let index;
    try {
      index = await loadJson("punctual-temporal/index.json");
    } catch (error) {
      console.error(error);
      status.textContent = "L’index des profils zonaux n’a pas pu être chargé.";
      return;
    }

    if (typeof Plotly === "undefined") {
      status.textContent = "La bibliothèque de tracé n’a pas pu être chargée.";
      return;
    }

    const zones = Array.isArray(index.zones) ? index.zones : [];
    if (!zones.length) {
      status.textContent = "Aucun profil zonal n’est disponible.";
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
      modeBarButtonsToRemove: ["lasso2d", "select2d"]
    };
    const campaignColors = {
      "2021": "#26736d",
      "2022": "#a66f17",
      "2023": "#5f4a7a"
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
        const traces = payload.campaigns.flatMap((campaign) => {
          return ["PPM", "PPS"].map((period, periodIndex) => {
            const observations = campaign.observations.filter((observation) => {
              return observation.period === period;
            });
            return {
              type: "scatter",
              mode: "lines+markers",
              name: String(campaign.campaign_year),
              legendgroup: String(campaign.campaign_year),
              showlegend: periodIndex === 0,
              connectgaps: false,
              x: observations.map((observation) => observation.slot),
              y: observations.map((observation) => observation.y_obs),
              customdata: observations.map((observation) => [
                observation.n_directions_obs,
                observation.period
              ]),
              line: {
                color: campaignColors[String(campaign.campaign_year)] || "#617080",
                width: 2
              },
              marker: { size: 7 },
              hovertemplate: `année=${campaign.campaign_year}<br>créneau=%{x}<br>y_obs=%{y}<br>directions disponibles=%{customdata[0]}<br>période=%{customdata[1]}<extra></extra>`
            };
          });
        });
        const layout = {
          template: "plotly_white",
          title: { text: `Zone ${payload.zone_id}`, font: { size: 16 } },
          hovermode: "closest",
          margin: { l: 65, r: 30, t: 80, b: 65 },
          legend: { orientation: "h", y: 1.14, groupclick: "togglegroup" },
          xaxis: {
            title: "Créneau horaire",
            type: "category",
            categoryorder: "array",
            categoryarray: payload.slot_labels
          },
          yaxis: { title: "y_obs", rangemode: "tozero" },
          shapes: [
            {
              type: "line",
              xref: "x",
              yref: "paper",
              x0: 3.5,
              x1: 3.5,
              y0: 0,
              y1: 1,
              line: { color: "#b8c8d5", width: 1.5, dash: "dot" }
            }
          ],
          annotations: [
            {
              x: "08–09",
              xref: "x",
              y: 1.04,
              yref: "paper",
              text: "Matin · PPM",
              showarrow: false,
              font: { color: "#617080", size: 12 }
            },
            {
              x: "16–17",
              xref: "x",
              y: 1.04,
              yref: "paper",
              text: "Soir · PPS",
              showarrow: false,
              font: { color: "#617080", size: 12 }
            }
          ],
          uirevision: payload.zone_id
        };
        await Plotly.react(plot, traces, layout, plotConfig);
        const years = payload.campaigns.map((campaign) => campaign.campaign_year);
        status.textContent = `${formatValue(payload.campaigns.length)} campagne(s), huit observations discrètes par campagne.`;
        if (summary) {
          summary.textContent = `Années disponibles : ${years.join(", ")}`;
        }
      } catch (error) {
        console.error(error);
        status.textContent = `Le profil de la zone ${zone.id} n’a pas pu être chargé.`;
      } finally {
        if (currentRequest === requestNumber) {
          select.disabled = false;
        }
      }
    }

    document.addEventListener("punctual-zone-select", (event) => {
      const zoneId = event.detail.zoneId;
      if (!zones.some((zone) => zone.id === zoneId)) {
        return;
      }
      select.value = zoneId;
      renderZone(zoneId);
    });
    select.addEventListener("change", () => selectPunctualZone(select.value));
    const initialZoneId = zones.some((zone) => zone.id === punctualSelectedZoneId)
      ? punctualSelectedZoneId
      : zones[0].id;
    selectPunctualZone(initialZoneId);
  }

  function formatResultNumber(value, digits, asPercent) {
    let numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return formatValue(value);
    }
    if (asPercent) {
      numeric *= 100;
    }
    const formatted = numeric.toLocaleString("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    return asPercent ? `${formatted} %` : formatted;
  }

  function renderResultBindings(results) {
    document.querySelectorAll("[data-result-path]").forEach((element) => {
      const value = getByPath(results, element.getAttribute("data-result-path") || "");
      if (value == null) {
        return;
      }
      const digitsAttribute = element.getAttribute("data-result-digits");
      const digits = digitsAttribute == null ? 0 : Number(digitsAttribute);
      element.textContent = formatResultNumber(
        value,
        Number.isFinite(digits) ? digits : 0,
        element.hasAttribute("data-result-percent")
      );
    });
  }

  function renderXgboostFeatures(results) {
    const features = getByPath(results, "xgboost_role.features") || [];
    document.querySelectorAll("[data-xgboost-features]").forEach((element) => {
      element.innerHTML = features.map((feature) => {
        return `<li>${escapeHtml(feature)}</li>`;
      }).join("");
    });
  }

  function renderMethodSelection(results) {
    const element = document.getElementById("results-method-selection");
    if (!element) {
      return;
    }
    const values = getByPath(results, "method_selection.validation_mae") || {};
    const methods = ["diffusion1", "diffusion2", "diffusion4", "diffusion6"]
      .filter((method) => Number.isFinite(Number(values[method])));
    if (!methods.length) {
      return;
    }
    const maximum = Math.max(...methods.map((method) => Number(values[method])));
    const selectedMethod = results.selected_method;
    element.innerHTML = methods.map((method) => {
      const value = Number(values[method]);
      const selected = method === selectedMethod;
      const selectedLabel = selected ? '<span class="result-badge">retenue</span>' : "";
      return `
        <div class="result-bar-row${selected ? " is-selected" : ""}">
          <span class="result-bar-label">${escapeHtml(method)}${selectedLabel}</span>
          <span class="result-bar-track" aria-hidden="true"><span class="result-bar-fill" style="width:${value / maximum * 100}%"></span></span>
          <strong>${formatResultNumber(value, 3, false)}</strong>
        </div>
      `;
    }).join("");
  }

  function renderAccessibility(results) {
    const element = document.getElementById("results-accessibility");
    if (!element) {
      return;
    }
    const levels = Array.isArray(results.accessibility_levels)
      ? results.accessibility_levels
      : [];
    const values = levels.flatMap((level) => {
      return [Number(level.validation.mae), Number(level.test.mae)];
    }).filter(Number.isFinite);
    if (!values.length) {
      return;
    }
    const maximum = Math.max(...values);
    element.innerHTML = levels.map((level) => {
      const validation = Number(level.validation.mae);
      const test = Number(level.test.mae);
      return `
        <article class="accessibility-level">
          <header><h3>Niveau ${formatValue(level.level)}</h3><span>${formatValue(level.n_zones)} zones</span></header>
          <div class="accessibility-bar-row">
            <span>Validation</span>
            <span class="result-bar-track" aria-hidden="true"><span class="result-bar-fill validation-fill" style="width:${validation / maximum * 100}%"></span></span>
            <strong>${formatResultNumber(validation, 3, false)}</strong>
          </div>
          <div class="accessibility-bar-row">
            <span>Test</span>
            <span class="result-bar-track" aria-hidden="true"><span class="result-bar-fill test-fill" style="width:${test / maximum * 100}%"></span></span>
            <strong>${formatResultNumber(test, 3, false)}</strong>
          </div>
        </article>
      `;
    }).join("");
  }

  function reconstructionColor(value, minimum, maximum) {
    const colors = ["#edf8fb", "#b2e2e2", "#66c2a4", "#fdae61", "#d73027"];
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      return colors[0];
    }
    const ratio = maximum === minimum ? 0 : (numeric - minimum) / (maximum - minimum);
    const index = Math.min(colors.length - 1, Math.max(0, Math.floor(ratio * colors.length)));
    return colors[index];
  }

  function reconstructionTargetPopup(properties) {
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(properties.commune || "non documentée")}<br>
      Niveau d’accessibilité : ${formatValue(properties.accessibility_level)}<br><br>
      <strong>Validation</strong><br>
      MAE : ${formatResultNumber(properties.validation_mae, 3, false)}<br>
      R² : ${formatResultNumber(properties.validation_r2, 3, false)}<br><br>
      <strong>Test</strong><br>
      MAE : ${formatResultNumber(properties.test_mae, 3, false)}<br>
      R² : ${formatResultNumber(properties.test_r2, 3, false)}
    `;
  }

  async function initReconstructionMap(results) {
    const element = document.getElementById("reconstruction-map");
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const [targets, modelingZones] = await Promise.all([
        loadJson("reconstruction_targets.geojson"),
        loadJson("zones_modeling.geojson")
      ]);
      const map = buildBaseMap(element);
      const scale = results.spatial_performance || {};
      const minimum = Number(scale.minimum);
      const maximum = Number(scale.maximum);
      const zoneLayers = new Map();
      const targetRenderer = L.svg({ padding: 0.25 });

      const backgroundLayer = L.geoJSON(modelingZones, {
        interactive: false,
        style: {
          color: "#9eacb8",
          weight: 0.45,
          fillColor: "#e8eef2",
          fillOpacity: 0.24
        }
      }).addTo(map);

      function targetStyle(feature) {
        const properties = feature.properties || {};
        return {
          color: "#ffffff",
          weight: 1.2,
          fillColor: reconstructionColor(properties.test_mae, minimum, maximum),
          fillOpacity: 0.86,
          renderer: targetRenderer
        };
      }

      const targetsLayer = L.geoJSON(targets, {
        style: targetStyle,
        onEachFeature(feature, layer) {
          const properties = feature.properties || {};
          const zoneId = String(properties.zone_id);
          zoneLayers.set(zoneId, layer);
          layer.bindPopup(reconstructionTargetPopup(properties));
          layer.on("click", () => selectReconstructionZone(zoneId));
        }
      }).addTo(map);

      function showSelectedZone(zoneId) {
        const selected = zoneLayers.get(String(zoneId));
        if (!selected) {
          return;
        }
        targetsLayer.resetStyle();
        selected.setStyle({
          color: "#17202b",
          weight: 4,
          fillOpacity: 0.96
        });
        selected.bringToFront();
      }

      document.addEventListener("reconstruction-zone-select", (event) => {
        showSelectedZone(event.detail.zoneId);
      });
      if (reconstructionSelectedZoneId !== null) {
        showSelectedZone(reconstructionSelectedZoneId);
      }

      const legend = L.control({ position: "bottomright" });
      legend.onAdd = () => {
        const container = L.DomUtil.create("div", "reconstruction-map-legend");
        container.innerHTML = `
          <strong>MAE test</strong>
          <span class="reconstruction-map-legend-gradient" aria-hidden="true"></span>
          <span class="reconstruction-map-legend-scale">
            <span>${formatResultNumber(minimum, 2, false)}</span>
            <span>${formatResultNumber(maximum, 2, false)}</span>
          </span>
          <span>faible → élevée</span>
        `;
        return container;
      };
      legend.addTo(map);

      const bounds = targetsLayer.getBounds().isValid()
        ? targetsLayer.getBounds()
        : backgroundLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.035));
      }
    } catch (error) {
      console.error(error);
      showMapFallback(element);
    }
  }

  function updateReconstructionZoneMetrics(zone) {
    const values = {
      "reconstruction-zone-id": zone.id,
      "reconstruction-zone-accessibility": `Niveau ${formatValue(zone.accessibility_level)}`,
      "reconstruction-validation-mae": formatResultNumber(zone.metrics.validation.mae, 3, false),
      "reconstruction-validation-r2": formatResultNumber(zone.metrics.validation.r2, 3, false),
      "reconstruction-test-mae": formatResultNumber(zone.metrics.test.mae, 3, false),
      "reconstruction-test-r2": formatResultNumber(zone.metrics.test.r2, 3, false)
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    });
  }

  function reconstructionSplitDecorations(index) {
    const splitMeta = [
      ["train", "Train", "rgba(38, 115, 109, 0.055)"],
      ["validation", "Validation", "rgba(199, 154, 69, 0.075)"],
      ["test", "Test", "rgba(155, 130, 208, 0.075)"]
    ];
    const shapes = [];
    const annotations = [];
    splitMeta.forEach(([key, label, color]) => {
      const split = index.splits && index.splits[key];
      if (!split) {
        return;
      }
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: split.start,
        x1: split.end,
        y0: 0,
        y1: 1,
        fillcolor: color,
        line: { width: 0 },
        layer: "below"
      });
      annotations.push({
        x: split.start,
        y: 0.985,
        xref: "x",
        yref: "paper",
        xanchor: "left",
        yanchor: "top",
        text: label,
        showarrow: false,
        font: { size: 10, color: "#617080" }
      });
    });
    return { shapes, annotations };
  }

  async function initReconstructionExplorer() {
    const select = document.getElementById("reconstruction-zone-select");
    const plot = document.getElementById("reconstruction-zone-plot");
    const status = document.getElementById("reconstruction-explorer-status");
    if (!select || !plot || !status) {
      return;
    }
    let index;
    try {
      index = await loadJson("reconstruction-temporal/index.json");
    } catch (error) {
      console.error(error);
      status.textContent = "L’index des reconstructions n’a pas pu être chargé.";
      return;
    }
    if (typeof Plotly === "undefined") {
      status.textContent = "La bibliothèque de tracé n’a pas pu être chargée.";
      return;
    }
    const zones = Array.isArray(index.zones) ? index.zones : [];
    if (zones.length !== 19 || index.method !== "diffusion4") {
      status.textContent = "L’index public des reconstructions est incohérent.";
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

    const temporalCache = new Map();
    const plotConfig = {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d"]
    };
    const decorations = reconstructionSplitDecorations(index);
    let requestNumber = 0;

    async function loadZone(zone) {
      if (!temporalCache.has(zone.id)) {
        temporalCache.set(zone.id, loadJson(zone.path));
      }
      return temporalCache.get(zone.id);
    }

    async function renderZone(zoneId) {
      const zone = zones.find((item) => item.id === String(zoneId));
      if (!zone) {
        return;
      }
      const currentRequest = ++requestNumber;
      select.disabled = true;
      status.textContent = `Chargement de la zone ${zone.id}…`;
      updateReconstructionZoneMetrics(zone);
      try {
        const payload = await loadZone(zone);
        if (currentRequest !== requestNumber) {
          return;
        }
        if (payload.method !== "diffusion4" || payload.lozo.source_used_in_fold !== false) {
          throw new Error(`Payload LOZO incohérent pour ${zone.id}.`);
        }
        const observedX = [];
        const observedY = [];
        payload.target_observed.forEach((observed, position) => {
          if (observed) {
            observedX.push(payload.timestamp[position]);
            observedY.push(payload.y_true[position]);
          }
        });
        const traces = [
          {
            type: "scattergl",
            mode: "markers",
            name: "Observations réelles",
            x: observedX,
            y: observedY,
            connectgaps: false,
            marker: { color: "#17202b", size: 3, opacity: 0.46 },
            hovertemplate: "date=%{x}<br>observation=%{y:.2f}<extra></extra>"
          },
          {
            type: "scattergl",
            mode: "lines",
            name: "Reconstruction diffusion4",
            x: payload.timestamp,
            y: payload.y_reconstructed,
            line: { color: "#26736d", width: 1.65 },
            hovertemplate: "date=%{x}<br>reconstruction=%{y:.2f}<extra></extra>"
          }
        ];
        const layout = {
          template: "plotly_white",
          hovermode: "x unified",
          dragmode: "pan",
          margin: { l: 62, r: 25, t: 82, b: 66 },
          legend: { orientation: "h", x: 0, y: 1.16 },
          meta: { zoneId: payload.zone_id },
          shapes: decorations.shapes,
          annotations: decorations.annotations,
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
            rangeslider: {
              visible: true,
              thickness: 0.12,
              bgcolor: "#f4f7fa",
              bordercolor: "#d8e2ea",
              borderwidth: 1
            }
          },
          yaxis: { title: "Comptage horaire", rangemode: "tozero" },
          uirevision: payload.zone_id
        };
        await Plotly.react(plot, traces, layout, plotConfig);
        status.textContent = `${formatValue(payload.timestamp.length)} timestamps · ${formatValue(observedX.length)} observations réelles`;
      } catch (error) {
        console.error(error);
        temporalCache.delete(zone.id);
        status.textContent = `La reconstruction de la zone ${zone.id} n’a pas pu être chargée.`;
      } finally {
        if (currentRequest === requestNumber) {
          select.disabled = false;
        }
      }
    }

    document.addEventListener("reconstruction-zone-select", (event) => {
      const zoneId = String(event.detail.zoneId);
      if (!zones.some((zone) => zone.id === zoneId)) {
        return;
      }
      select.value = zoneId;
      renderZone(zoneId);
    });
    select.addEventListener("change", () => selectReconstructionZone(select.value));
    const defaultZoneId = zones.some((zone) => zone.id === index.default_zone_id)
      ? index.default_zone_id
      : zones[0].id;
    selectReconstructionZone(defaultZoneId);
  }

  async function initReconstructionResults() {
    if (!document.querySelector("[data-reconstruction-results]")) {
      return;
    }
    try {
      const results = await loadJson("reconstruction_results.json");
      renderResultBindings(results);
      renderXgboostFeatures(results);
      renderMethodSelection(results);
      renderAccessibility(results);
      await Promise.allSettled([
        initReconstructionMap(results),
        initReconstructionExplorer()
      ]);
    } catch (error) {
      console.error(error);
      document.querySelectorAll("[data-results-error]").forEach((element) => {
        element.textContent = "Les résultats publics n'ont pas pu être chargés.";
      });
    }
  }

  async function initMetrics() {
    try {
      const metrics = await loadJson("site_metrics.json");
      renderProjectMetrics(metrics);
      renderCoverageDistribution(metrics);
      renderPermanentDistribution(metrics);
      renderPermanentTable(metrics);
      renderTemporalPreview(metrics);
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
      initPermanentExplorer(),
      initPunctualMap(),
      initPunctualExplorer(),
      initObservationCoverageMap(),
      initReconstructionResults()
    ]);
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
