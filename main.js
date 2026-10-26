/**
 * main.js — GeoJSON Route Map
 * Menggunakan Croot.js (crootjs/lib/map.js) via CDN untuk
 * menampilkan dan memvalidasi jalur GeoJSON di atas peta OSM.
 *
 * Referensi API Croot.js:
 *   createMap(id, options)       — buat peta di elemen dengan id tertentu
 *   addGeoJSON(id, geojson, {style, popup})  — tambah layer GeoJSON
 *   fitMap(id, geojson, padding) — sesuaikan viewport ke data
 *   clearMap(id)                 — hapus semua layer GeoJSON
 *   setMapView(id, center, zoom) — atur posisi & zoom peta
 *   onMapClick(id, fn)           — listener klik peta
 */

import {
    createMap,
    addGeoJSON,
    fitMap,
    clearMap,
    setMapView,
} from "https://cdn.jsdelivr.net/gh/crootjs/lib/map.js";

// ─── Konstanta ────────────────────────────────────────────────────────────────
const MAP_ID = "map";

const ROUTE_COLORS = [
    "#3b82f6", // blue-500
    "#ef4444", // red-500
    "#10b981", // emerald-500
    "#f59e0b", // amber-500
    "#8b5cf6", // violet-500
    "#06b6d4", // cyan-500
    "#f97316", // orange-500
    "#6366f1", // indigo-500
    "#14b8a6", // teal-500
    "#ec4899", // pink-500
];
const INVALID_COLOR = "#64748b";

// ─── State Global ─────────────────────────────────────────────────────────────
let currentGeoJSON = null;
let currentFeatureValidations = [];
let selectedIndex = null;

// ─── Elemen DOM ───────────────────────────────────────────────────────────────
const domAlertBanner = document.getElementById("alert-banner");
const domAlertIcon = document.getElementById("alert-icon");
const domAlertTitle = document.getElementById("alert-title");
const domAlertMessage = document.getElementById("alert-message");
const domBtnCloseAlert = document.getElementById("btn-close-alert");
const domValidationStatusBadge = document.getElementById("validation-status-badge");
const domStatTotal = document.getElementById("stat-total-features");
const domStatValid = document.getElementById("stat-valid-features");
const domStatInvalid = document.getElementById("stat-invalid-features");
const domStatDistance = document.getElementById("stat-total-distance");
const domValidationDetailBox = document.getElementById("validation-detail-box");
const domSelectedRouteBadge = document.getElementById("selected-route-badge");
const domSelectedRouteContent = document.getElementById("selected-route-content");
const domLegendList = document.getElementById("legend-list");
const domLegendCountBadge = document.getElementById("legend-count-badge");
const domNetworkBadge = document.getElementById("network-badge");
const domNetworkText = document.getElementById("network-text");
const domNetworkWarning = document.getElementById("network-warning");
const domBtnFitAll = document.getElementById("btn-fit-all");
const domBtnReload = document.getElementById("btn-reload-default");
const domFileInput = document.getElementById("file-input-geojson");

// ─── Utilitas Geospasial ──────────────────────────────────────────────────────
function haversineKm(c1, c2) {
    const R = 6371;
    const dLat = (c2[1] - c1[1]) * Math.PI / 180;
    const dLon = (c2[0] - c1[0]) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(c1[1] * Math.PI / 180) * Math.cos(c2[1] * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineStringLengthKm(coords) {
    let d = 0;
    for (let i = 0; i < coords.length - 1; i++) d += haversineKm(coords[i], coords[i + 1]);
    return d;
}

function isValidFeature(f) {
    if (!f?.geometry) return false;
    const { type, coordinates: c } = f.geometry;
    if (type === "LineString") return Array.isArray(c) && c.length >= 2;
    if (type === "Point") return Array.isArray(c) && c.length >= 2;
    if (type === "Polygon") return Array.isArray(c) && c[0]?.length >= 4;
    return true;
}

function routeColor(i, valid) {
    return valid ? ROUTE_COLORS[i % ROUTE_COLORS.length] : INVALID_COLOR;
}

function fmtDist(km) {
    return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
}

function fmtCoords(coords) {
    if (!coords?.length) return "—";
    const a = coords[0], b = coords[coords.length - 1];
    return `[${a[0].toFixed(6)}, ${a[1].toFixed(6)}] → [${b[0].toFixed(6)}, ${b[1].toFixed(6)}]`;
}

function bboxOfCoords(allCoords) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    allCoords.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    });
    return [minLng, minLat, maxLng, maxLat];
}

function collectCoords(features, validations) {
    const all = [];
    features.forEach((f, i) => {
        if (validations && !validations[i]) return;
        const g = f.geometry;
        if (!g) return;
        if (g.type === "LineString") all.push(...g.coordinates);
        else if (g.type === "Point") all.push(g.coordinates);
        else if (g.type === "Polygon") all.push(...(g.coordinates[0] ?? []));
    });
    return all;
}

// ─── Alert ────────────────────────────────────────────────────────────────────
function showAlert(title, msg, type = "error") {
    domAlertBanner.classList.remove("is-hidden", "alert-warning");
    if (type === "warning") {
        domAlertBanner.classList.add("alert-warning");
        domAlertIcon.textContent = "⚠️";
    } else {
        domAlertIcon.textContent = "❌";
    }
    domAlertTitle.textContent = title;
    domAlertMessage.textContent = msg;
}

function hideAlert() { domAlertBanner.classList.add("is-hidden"); }

domBtnCloseAlert.addEventListener("click", hideAlert);

// ─── Inisialisasi Peta ────────────────────────────────────────────────────────
createMap(MAP_ID, {
    center: [107.5795, -6.8703],
    zoom: 14,
    minZoom: 3,
    maxZoom: 20,
    // tiles: default OSM sudah disertakan oleh Croot.js
});

// ─── Render GeoJSON ───────────────────────────────────────────────────────────
function renderGeoJSON(geojson) {
    currentGeoJSON = geojson;
    selectedIndex = null;

    // Hapus semua layer lama
    clearMap(MAP_ID);

    const features = geojson?.features ?? [];
    const validations = features.map(isValidFeature);
    currentFeatureValidations = validations;

    const totalValid = validations.filter(Boolean).length;
    const totalInvalid = validations.filter(v => !v).length;
    const invalidIdx = validations.map((v, i) => !v ? i + 1 : null).filter(v => v !== null);

    // Total jarak semua LineString valid
    let totalDist = 0;
    features.forEach((f, i) => {
        if (validations[i] && f.geometry?.type === "LineString") {
            totalDist += lineStringLengthKm(f.geometry.coordinates);
        }
    });

    // ── Update statistik sidebar ──────────────────────────────────────────────
    domStatTotal.textContent = features.length;
    domStatValid.textContent = totalValid;
    domStatInvalid.textContent = totalInvalid;
    domStatDistance.textContent = fmtDist(totalDist);

    // Badge status
    const bp = domValidationStatusBadge;
    bp.className = "status-pill";
    if (features.length === 0) {
        bp.classList.add("status-loading"); bp.textContent = "Kosong";
    } else if (totalInvalid === 0) {
        bp.classList.add("status-success"); bp.textContent = "✓ Valid";
    } else if (totalValid > 0) {
        bp.classList.add("status-warning"); bp.textContent = "⚠ Sebagian";
    } else {
        bp.classList.add("status-error"); bp.textContent = "✗ Tidak Valid";
    }

    // Detail invalid
    if (invalidIdx.length > 0) {
        domValidationDetailBox.classList.remove("is-hidden");
        domValidationDetailBox.innerHTML = `
            <div class="validation-detail-title">⚠️ ${invalidIdx.length} fitur tidak valid</div>
            <div>Fitur nomor: <span class="validation-detail-code">${invalidIdx.join(", ")}</span></div>
            <div>Kemungkinan penyebab: LineString hanya memiliki 1 titik koordinat.</div>
        `;
    } else {
        domValidationDetailBox.classList.add("is-hidden");
        domValidationDetailBox.innerHTML = "";
    }

    // ── Tambahkan setiap feature sebagai layer GeoJSON terpisah ──────────────
    features.forEach((feature, i) => {
        const valid = validations[i];
        const color = routeColor(i, valid);
        const geomType = feature.geometry?.type ?? "Unknown";
        const coords = feature.geometry?.coordinates ?? [];
        const len = geomType === "LineString" ? fmtDist(lineStringLengthKm(coords)) : "—";
        const props = feature.properties ?? {};
        const propEntries = Object.entries(props)
            .filter(([, v]) => v !== null && v !== undefined && v !== "");

        const singleFC = { type: "FeatureCollection", features: [feature] };

        addGeoJSON(MAP_ID, singleFC, {
            style: () => ({
                stroke: color,
                strokeWidth: valid ? 4 : 2,
                strokeOpacity: valid ? 0.9 : 0.45,
                fill: color,
                fillOpacity: geomType === "Polygon" ? 0.15 : 0,
            }),
            popup: () => `
                <div class="popup-route-card">
                    <div class="popup-header">
                        <div class="popup-color-dot" style="background:${color}"></div>
                        <span class="popup-badge">Jalur ${i + 1}</span>
                        <span style="margin-left:auto;font-size:0.72rem;color:${valid ? '#10b981' : '#f59e0b'};font-weight:600">
                            ${valid ? '✓ Valid' : '⚠ Tidak Valid'}
                        </span>
                    </div>
                    <div class="popup-body">
                        <div class="popup-row">
                            <span class="popup-label">Tipe</span>
                            <span class="popup-val">${geomType}</span>
                        </div>
                        <div class="popup-row">
                            <span class="popup-label">Titik</span>
                            <span class="popup-val">${Array.isArray(coords) ? coords.length : 0}</span>
                        </div>
                        <div class="popup-row">
                            <span class="popup-label">Panjang</span>
                            <span class="popup-val">${len}</span>
                        </div>
                        ${propEntries.map(([k, v]) => `
                        <div class="popup-row">
                            <span class="popup-label">${k}</span>
                            <span class="popup-val">${v}</span>
                        </div>`).join("")}
                    </div>
                    <button
                        onclick="window.__selectRouteFromPopup(${i})"
                        style="margin-top:8px;width:100%;padding:5px 0;border:none;border-radius:5px;background:${color};color:#fff;font-size:0.75rem;font-weight:600;cursor:pointer;">
                        Lihat Detail di Sidebar
                    </button>
                </div>`,
        });
    });

    // ── Fit peta ke semua jalur valid ────────────────────────────────────────
    const validCoords = collectCoords(features, validations);
    if (validCoords.length > 0) {
        const bbox = bboxOfCoords(validCoords);
        // fitMap menerima bbox [minLng, minLat, maxLng, maxLat]
        fitMap(MAP_ID, bbox, 40);
    }

    // ── Bangun legenda ────────────────────────────────────────────────────────
    buildLegend(features, validations);
    resetDetailPanel();
}

// ─── Bridge untuk tombol popup ke sidebar ─────────────────────────────────────
window.__selectRouteFromPopup = (index) => {
    if (!currentGeoJSON) return;
    selectRoute(index, currentFeatureValidations, currentGeoJSON.features ?? []);
};

// ─── Pilih Rute ───────────────────────────────────────────────────────────────
function selectRoute(index, validations, features) {
    selectedIndex = index;
    const f = features[index];
    const valid = validations[index];
    const color = routeColor(index, valid);
    const geom = f?.geometry;
    const coords = geom?.coordinates ?? [];
    const geomType = geom?.type ?? "Unknown";
    const len = geomType === "LineString" ? fmtDist(lineStringLengthKm(coords)) : "—";
    const props = f?.properties ?? {};
    const propEntries = Object.entries(props)
        .filter(([, v]) => v !== null && v !== undefined && v !== "");

    domSelectedRouteBadge.classList.remove("is-hidden");
    domSelectedRouteContent.innerHTML = `
        <div class="route-info-card">
            <div class="route-info-header">
                <span class="route-info-name">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;margin-right:4px"></span>
                    Jalur ${index + 1}
                </span>
                <span class="status-pill ${valid ? 'status-success' : 'status-warning'}">
                    ${valid ? '✓ Valid' : '⚠ Tidak Valid'}
                </span>
            </div>
            <div class="route-info-row">
                <span class="route-info-label">Tipe Geometri</span>
                <span class="route-info-value">${geomType}</span>
            </div>
            <div class="route-info-row">
                <span class="route-info-label">Jumlah Titik</span>
                <span class="route-info-value">${Array.isArray(coords) ? coords.length : 0}</span>
            </div>
            <div class="route-info-row">
                <span class="route-info-label">Panjang Jalur</span>
                <span class="route-info-value">${len}</span>
            </div>
            ${geomType === "LineString" && coords.length >= 2 ? `
            <div class="route-info-row">
                <span class="route-info-label">Koordinat</span>
                <span class="route-info-value"></span>
            </div>
            <div class="route-info-coords">${fmtCoords(coords)}</div>
            ` : ""}
            ${propEntries.length > 0 ? `
            <div style="margin-top:6px;font-size:0.72rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Properti</div>
            ${propEntries.map(([k, v]) => `
            <div class="route-info-row">
                <span class="route-info-label">${k}</span>
                <span class="route-info-value">${v}</span>
            </div>`).join("")}
            ` : ""}
        </div>`;

    updateLegendActive(index);
}

function resetDetailPanel() {
    selectedIndex = null;
    domSelectedRouteBadge.classList.add("is-hidden");
    domSelectedRouteContent.innerHTML = `<p class="empty-state-text">Klik salah satu garis pada peta atau daftar legenda untuk melihat informasi rute.</p>`;
}

// ─── Legenda ──────────────────────────────────────────────────────────────────
function buildLegend(features, validations) {
    domLegendList.innerHTML = "";
    domLegendCountBadge.textContent = `${features.length} Jalur`;

    features.forEach((f, i) => {
        const valid = validations[i];
        const color = routeColor(i, valid);
        const geom = f?.geometry;
        const coords = geom?.coordinates ?? [];
        const geomType = geom?.type ?? "Unknown";
        const len = geomType === "LineString" ? fmtDist(lineStringLengthKm(coords)) : "—";

        const item = document.createElement("div");
        item.className = `legend-item${!valid ? " is-invalid" : ""}`;
        item.setAttribute("role", "listitem");
        item.setAttribute("tabindex", "0");
        item.dataset.index = i;
        item.innerHTML = `
            <div class="legend-item-left">
                <div class="legend-swatch" style="background-color:${color}"></div>
                <div class="legend-title-box">
                    <span class="legend-title">Jalur ${i + 1}</span>
                    <span class="legend-subtitle">${geomType} · ${Array.isArray(coords) ? coords.length : 0} titik${!valid ? " · ⚠ Tidak Valid" : ""}</span>
                </div>
            </div>
            <span class="legend-item-right">${len}</span>
        `;

        item.addEventListener("click", () => selectRoute(i, validations, features));
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRoute(i, validations, features); }
        });

        domLegendList.appendChild(item);
    });
}

function updateLegendActive(activeIdx) {
    domLegendList.querySelectorAll(".legend-item").forEach((el, i) => {
        el.classList.toggle("is-active", i === activeIdx);
    });
}

// ─── Network Status ───────────────────────────────────────────────────────────
function updateNetworkStatus(online) {
    if (online) {
        domNetworkBadge.className = "badge badge-online";
        domNetworkText.textContent = "OSM Online";
        domNetworkWarning.classList.add("is-hidden");
    } else {
        domNetworkBadge.className = "badge badge-offline";
        domNetworkText.textContent = "Offline";
        domNetworkWarning.classList.remove("is-hidden");
    }
}

window.addEventListener("online", () => updateNetworkStatus(true));
window.addEventListener("offline", () => updateNetworkStatus(false));
updateNetworkStatus(navigator.onLine);

// ─── Load GeoJSON ─────────────────────────────────────────────────────────────
async function loadFromURL(url) {
    hideAlert();
    domValidationStatusBadge.className = "status-pill status-loading";
    domValidationStatusBadge.textContent = "Memuat...";
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const geojson = await res.json();
        renderGeoJSON(geojson);
    } catch (err) {
        showAlert("Gagal Memuat GeoJSON", err.message);
        domValidationStatusBadge.className = "status-pill status-error";
        domValidationStatusBadge.textContent = "✗ Error";
    }
}

function loadFromFile(file) {
    hideAlert();
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            renderGeoJSON(JSON.parse(e.target.result));
        } catch (err) {
            showAlert("Format Tidak Valid", "Bukan GeoJSON yang valid: " + err.message);
        }
    };
    reader.onerror = () => showAlert("Error Baca File", "Tidak dapat membaca file.");
    reader.readAsText(file);
}

// ─── Kontrol ──────────────────────────────────────────────────────────────────
domBtnFitAll.addEventListener("click", () => {
    if (!currentGeoJSON) return;
    const features = currentGeoJSON.features ?? [];
    const coords = collectCoords(features, currentFeatureValidations);
    if (coords.length > 0) fitMap(MAP_ID, bboxOfCoords(coords), 40);
});

domBtnReload.addEventListener("click", () => loadFromURL("./geo-map.geojson"));

domFileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) { loadFromFile(f); e.target.value = ""; }
});

// ─── Mulai ────────────────────────────────────────────────────────────────────
loadFromURL("./geo-map.geojson");
