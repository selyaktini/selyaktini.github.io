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

  async function loadJson(path) {
    const response = await fetch(DATA_ROOT + path);
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
      const classified = getByPath(metrics, "permanent_counts.n_classified_sensors") || 84;
      const rows = getByPath(metrics, "permanent_counts.time_span_utc.n_hourly_observation_rows") || 0;
      const sensors = getByPath(metrics, "permanent_counts.time_span_utc.n_sensors_in_hourly_table") || classified;
      element.innerHTML = `
        <div class="preview-metrics">
          <div><strong>${formatValue(sensors)}</strong><span>capteurs suivis</span></div>
          <div><strong>${formatValue(rows)}</strong><span>observations horaires</span></div>
          <div><strong>mai 2024 - mai 2026</strong><span>période publiée</span></div>
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

  function zoneStyle(feature) {
    const hasSeries = feature.properties && feature.properties.has_hourly_series;
    return {
      color: hasSeries ? "#8db9b5" : "#9aaab6",
      weight: hasSeries ? 0.75 : 0.45,
      fillColor: hasSeries ? "#d9eeee" : "#e7eef4",
      fillOpacity: hasSeries ? 0.42 : 0.28
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
    return `
      <strong>Zone ${escapeHtml(properties.zone_id)}</strong><br>
      Commune : ${escapeHtml(properties.zone_commune || "non documentée")}<br>
      Série horaire permanente : ${properties.has_hourly_series ? "oui" : "non"}<br>
      Capteurs dans la zone : ${formatValue(properties.sensor_count || 0)}
    `;
  }

  function sensorPopup(properties) {
    const meta = classMeta(properties.polarity_type);
    return `
      <strong>${escapeHtml(properties.sensor_ident)}</strong><br>
      ${escapeHtml(properties.sensor_name || "")}<br>
      Type : ${escapeHtml(properties.sensor_type || "")}<br>
      Classe : ${escapeHtml(meta.label)}<br>
      Jours valides : ${formatValue(properties.n_valid_days)}
    `;
  }

  async function initStudyMap() {
    const element = document.getElementById("study-map");
    if (!element) {
      return;
    }
    if (typeof L === "undefined") {
      showMapFallback(element);
      return;
    }
    try {
      const [zones, rocade, sensors] = await Promise.all([
        loadJson("zones_modeling.geojson"),
        loadJson("rocade_interior.geojson"),
        loadJson("permanent_sensors.geojson")
      ]);

      const map = buildBaseMap(element);
      const zonesLayer = L.geoJSON(zones, {
        style: zoneStyle,
        onEachFeature(feature, layer) {
          layer.bindPopup(zonePopup(feature.properties || {}));
        }
      }).addTo(map);

      const rocadeLayer = L.geoJSON(rocade, {
        style: rocadeStyle
      }).addTo(map);

      const sensorLayer = L.geoJSON(sensors, {
        pointToLayer(feature, latlng) {
          return sensorMarker(feature, latlng, 5);
        },
        onEachFeature(feature, layer) {
          layer.bindPopup(sensorPopup(feature.properties || {}));
        }
      }).addTo(map);

      L.control.layers(null, {
        "Périmètre rocade": rocadeLayer,
        "Zones de modélisation": zonesLayer,
        "Capteurs permanents": sensorLayer
      }, { collapsed: true }).addTo(map);

      const bounds = rocadeLayer.getBounds().isValid() ? rocadeLayer.getBounds() : zonesLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.035));
      }
    } catch (error) {
      console.error(error);
      showMapFallback(element);
    }
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
      const [zones, rocade, sensors] = await Promise.all([
        loadJson("zones_modeling.geojson"),
        loadJson("rocade_interior.geojson"),
        loadJson("permanent_sensors.geojson")
      ]);
      const map = buildBaseMap(element);
      const zonesLayer = L.geoJSON(zones, {
        style: zoneStyle,
        onEachFeature(feature, layer) {
          layer.bindPopup(zonePopup(feature.properties || {}));
        }
      }).addTo(map);
      const rocadeLayer = L.geoJSON(rocade, {
        style: rocadeStyle
      }).addTo(map);
      const markerGroup = L.layerGroup().addTo(map);
      const filters = Array.from(document.querySelectorAll("[data-polarity-filter]"));

      function selectedTypes() {
        return new Set(
          filters
            .filter((input) => input.checked)
            .map((input) => input.getAttribute("data-polarity-filter"))
        );
      }

      function renderMarkers() {
        const active = selectedTypes();
        markerGroup.clearLayers();
        sensors.features.forEach((feature) => {
          const properties = feature.properties || {};
          if (!active.has(String(properties.polarity_type))) {
            return;
          }
          const coordinates = feature.geometry && feature.geometry.coordinates;
          if (!coordinates || coordinates.length < 2) {
            return;
          }
          const marker = sensorMarker(feature, [coordinates[1], coordinates[0]], 5.8);
          marker.bindPopup(sensorPopup(properties));
          marker.addTo(markerGroup);
        });
      }

      filters.forEach((input) => input.addEventListener("change", renderMarkers));
      renderMarkers();

      L.control.layers(null, {
        "Périmètre rocade": rocadeLayer,
        "Zones de modélisation": zonesLayer,
        "Capteurs permanents": markerGroup
      }, { collapsed: true }).addTo(map);

      const sensorBounds = L.geoJSON(sensors).getBounds();
      const bounds = rocadeLayer.getBounds().isValid() ? rocadeLayer.getBounds() : sensorBounds;
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.055));
      }
    } catch (error) {
      console.error(error);
      showMapFallback(element);
    }
  }

  async function boot() {
    setActiveNav();
    try {
      const metrics = await loadJson("site_metrics.json");
      renderPermanentDistribution(metrics);
      renderPermanentTable(metrics);
      renderTemporalPreview(metrics);
      renderPunctualYearTable(metrics);
      initPunctualTabs(metrics);
      await Promise.all([
        initStudyMap(),
        initPermanentMap()
      ]);
    } catch (error) {
      console.error(error);
      document.querySelectorAll(".map").forEach((element) => {
        if (!element.querySelector(".leaflet-pane") && !element.classList.contains("map-fallback")) {
          showMapFallback(element);
        }
      });
      document.querySelectorAll("[data-load-error]").forEach((element) => {
        element.textContent = "Les données publiques n'ont pas pu être chargées.";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
