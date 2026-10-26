import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

// Palette warna kontras dan harmonis untuk membedakan jalur
const ROUTE_COLORS = [
  '#2563eb', // Biru
  '#10b981', // Hijau Zamrud
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Ungu
  '#06b6d4', // Sian
  '#ef4444', // Merah Coral
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#f97316', // Oranye
];

// Helper: Menghitung jarak rute menggunakan formula Haversine (km)
function calculateDistanceKm(coords) {
  if (!coords || coords.length < 2) return 0;
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const R = 6371; // Jari-jari bumi (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalKm += R * c;
  }
  return totalKm;
}

// Komponen pengendali peta Leaflet (fit bounds & reset zoom)
function MapBoundsController({ allBounds, fitTrigger, focusBounds }) {
  const map = useMap();

  // Reset / Fit ke seluruh jalur saat data siap atau tombol diklik
  useEffect(() => {
    if (fitTrigger > 0 && allBounds && allBounds.isValid()) {
      map.fitBounds(allBounds, {
        padding: [40, 40],
        maxZoom: 16,
        animate: true,
      });
    }
  }, [allBounds, fitTrigger, map]);

  // Fokus ke jalur terpilih jika diminta
  useEffect(() => {
    if (focusBounds && focusBounds.isValid()) {
      map.fitBounds(focusBounds, {
        padding: [60, 60],
        maxZoom: 17,
        animate: true,
      });
    }
  }, [focusBounds, map]);

  return null;
}

export default function App() {
  const [routes, setRoutes] = useState([]);
  const [invalidRoutes, setInvalidRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [fitTrigger, setFitTrigger] = useState(1);
  const [focusBounds, setFocusBounds] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showWarningBanner, setShowWarningBanner] = useState(true);

  // Muat file geo-map.geojson sesuai konfigurasi base GitHub Pages
  useEffect(() => {
    const geoJsonUrl = `${import.meta.env.BASE_URL}geo-map.geojson`;
    setLoading(true);
    setLoadError(null);

    fetch(geoJsonUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Gagal memuat file GeoJSON (${res.status} ${res.statusText})`);
        }
        return res.json();
      })
      .then((data) => {
        processGeoJSON(data);
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setLoadError(`Tidak dapat memuat GeoJSON dari ${geoJsonUrl}: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Parsing dan validasi struktur GeoJSON
  const processGeoJSON = (data) => {
    try {
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Format GeoJSON tidak valid: root harus berupa FeatureCollection.');
      }

      const validList = [];
      const invalidList = [];

      data.features.forEach((feature, index) => {
        const featureNumber = index + 1;
        const name = feature.properties?.name || `Jalur ${featureNumber}`;
        const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
        const geometry = feature.geometry;

        // Validasi tipe geometri dan koordinat
        if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
          invalidList.push({
            id: `route-${index}`,
            index,
            number: featureNumber,
            name,
            geometryType: geometry?.type || 'Tidak ada',
            coordinates: geometry?.coordinates || [],
            error: 'Geometri bukan LineString yang valid.',
            feature,
          });
          return;
        }

        const rawCoords = geometry.coordinates;

        // LineString wajib memiliki minimal 2 titik posisi koordinat [lng, lat]
        if (rawCoords.length < 2) {
          invalidList.push({
            id: `route-${index}`,
            index,
            number: featureNumber,
            name,
            geometryType: 'LineString',
            coordinates: rawCoords,
            error: `LineString memerlukan minimal 2 posisi koordinat, ditemukan hanya ${rawCoords.length} titik.`,
            feature,
          });
          return;
        }

        // Periksa apakah setiap koordinat valid angka dan rentang geografis wajar
        const hasInvalidCoord = rawCoords.some(
          (pt) =>
            !Array.isArray(pt) ||
            pt.length < 2 ||
            typeof pt[0] !== 'number' ||
            typeof pt[1] !== 'number' ||
            isNaN(pt[0]) ||
            isNaN(pt[1])
        );

        if (hasInvalidCoord) {
          invalidList.push({
            id: `route-${index}`,
            index,
            number: featureNumber,
            name,
            geometryType: 'LineString',
            coordinates: rawCoords,
            error: 'Ditemukan koordinat yang bernilai NaN atau bukan angka.',
            feature,
          });
          return;
        }

        // Konversi koordinat GeoJSON [lng, lat] ke format Leaflet [lat, lng] untuk rendering
        const leafletCoords = rawCoords.map(([lng, lat]) => [lat, lng]);
        const distanceKm = calculateDistanceKm(rawCoords);

        validList.push({
          id: `route-${index}`,
          index,
          number: featureNumber,
          name,
          color,
          rawCoordinates: rawCoords,
          leafletCoords,
          distanceKm,
          feature,
        });
      });

      setRoutes(validList);
      setInvalidRoutes(invalidList);
      setLoading(false);
      setFitTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Processing error:', err);
      setLoadError(err.message);
      setLoading(false);
    }
  };

  // Hitung total bounding box dari seluruh jalur yang valid
  const allBounds = useMemo(() => {
    if (!routes || routes.length === 0) return null;
    const allLatLngs = [];
    routes.forEach((route) => {
      route.leafletCoords.forEach((pt) => allLatLngs.push(pt));
    });
    if (allLatLngs.length === 0) return null;
    return L.latLngBounds(allLatLngs);
  }, [routes]);

  // Jalur yang sedang aktif / diklik
  const selectedRoute = useMemo(() => {
    if (!selectedRouteId) return null;
    return routes.find((r) => r.id === selectedRouteId) || null;
  }, [selectedRouteId, routes]);

  // Handler reset zoom ke seluruh jalur
  const handleResetZoom = () => {
    setSelectedRouteId(null);
    setFocusBounds(null);
    setFitTrigger((prev) => prev + 1);
  };

  // Handler klik pada jalur tertentu
  const handleSelectRoute = (route) => {
    setSelectedRouteId(route.id);
    const bounds = L.latLngBounds(route.leafletCoords);
    setFocusBounds(bounds);
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">🗺️</div>
          <div>
            <h1 className="brand-title">GeoJSON Route Map</h1>
            <p className="brand-subtitle">Visualisasi jalur interaktif OpenStreetMap</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="stats-badge" title="Status data GeoJSON">
            <span className="badge-dot green"></span>
            <span>{routes.length} Jalur Valid</span>
            {invalidRoutes.length > 0 && (
              <span className="badge-warning">({invalidRoutes.length} bermasalah)</span>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResetZoom}
            title="Tampilkan semua jalur pada peta"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            <span>Lihat Seluruh Jalur</span>
          </button>
        </div>
      </header>

      {/* WARNING BANNER: Jika ada geometri GeoJSON yang tidak valid */}
      {invalidRoutes.length > 0 && showWarningBanner && (
        <div className="warning-banner" role="alert">
          <div className="warning-content">
            <svg className="warning-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <strong>Peringatan GeoJSON:</strong> Ditemukan {invalidRoutes.length} fitur dengan geometri tidak valid ({invalidRoutes.map(r => `${r.name}: ${r.error}`).join('; ')}). Fitur ini tetap dipertahankan dalam data sumber namun tidak digambar sebagai garis pada peta.
            </div>
          </div>
          <button
            type="button"
            className="btn-close-banner"
            onClick={() => setShowWarningBanner(false)}
            aria-label="Tutup peringatan"
          >
            &times;
          </button>
        </div>
      )}

      {/* ERROR LOAD BANNER */}
      {loadError && (
        <div className="error-banner" role="alert">
          <strong>Gagal Memuat:</strong> {loadError}
        </div>
      )}

      {/* AREA UTAMA: PETA LEAFLET */}
      <main className="map-wrapper">
        {loading ? (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Memuat peta dan data GeoJSON...</p>
          </div>
        ) : (
          <MapContainer
            center={[-6.872, 107.58]}
            zoom={15}
            scrollWheelZoom={true}
            className="leaflet-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Controller untuk fitBounds */}
            <MapBoundsController
              allBounds={allBounds}
              fitTrigger={fitTrigger}
              focusBounds={focusBounds}
            />

            {/* Render semua jalur yang valid */}
            {routes.map((route) => {
              const isSelected = selectedRouteId === route.id;

              return (
                <React.Fragment key={route.id}>
                  {/* Garis halo tebal di bawah untuk jalur yang sedang dipilih */}
                  {isSelected && (
                    <Polyline
                      positions={route.leafletCoords}
                      pathOptions={{
                        color: '#ffffff',
                        weight: 10,
                        opacity: 0.9,
                        lineCap: 'round',
                        lineJoin: 'round',
                      }}
                    />
                  )}

                  {/* Garis utama jalur */}
                  <Polyline
                    positions={route.leafletCoords}
                    pathOptions={{
                      color: route.color,
                      weight: isSelected ? 7 : 4.5,
                      opacity: isSelected ? 1 : 0.85,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                    eventHandlers={{
                      click: () => handleSelectRoute(route),
                      mouseover: (e) => {
                        const target = e.target;
                        if (!isSelected) {
                          target.setStyle({ weight: 6, opacity: 1 });
                        }
                      },
                      mouseout: (e) => {
                        const target = e.target;
                        if (!isSelected) {
                          target.setStyle({ weight: 4.5, opacity: 0.85 });
                        }
                      },
                    }}
                  >
                    <Tooltip sticky direction="top">
                      <div className="map-tooltip">
                        <strong>{route.name}</strong>
                        <span>{route.rawCoordinates.length} titik &bull; {route.distanceKm.toFixed(2)} km</span>
                      </div>
                    </Tooltip>
                  </Polyline>
                </React.Fragment>
              );
            })}
          </MapContainer>
        )}

        {/* FLOATING LEGEND: Daftar dan pembeda warna jalur */}
        <div className={`legend-card ${showLegend ? 'open' : 'collapsed'}`}>
          <div className="legend-header" onClick={() => setShowLegend(!showLegend)}>
            <div className="legend-title-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              <span>Legenda Jalur ({routes.length})</span>
            </div>
            <button
              type="button"
              className="btn-toggle-legend"
              aria-label={showLegend ? 'Sembunyikan legenda' : 'Buka legenda'}
            >
              {showLegend ? '−' : '+'}
            </button>
          </div>

          {showLegend && (
            <div className="legend-body">
              <div className="legend-list">
                {routes.map((route) => {
                  const isSelected = selectedRouteId === route.id;
                  return (
                    <div
                      key={route.id}
                      className={`legend-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectRoute(route)}
                    >
                      <span
                        className="color-swatch"
                        style={{ backgroundColor: route.color }}
                      ></span>
                      <span className="route-label">{route.name}</span>
                      <span className="route-count">{route.rawCoordinates.length} titik</span>
                    </div>
                  );
                })}

                {/* Tampilkan juga jalur yang tidak valid di legenda dengan tanda khusus */}
                {invalidRoutes.map((inv) => (
                  <div key={inv.id} className="legend-item invalid-item" title={inv.error}>
                    <span className="color-swatch invalid-swatch">✕</span>
                    <span className="route-label text-muted">{inv.name}</span>
                    <span className="route-count badge-invalid">Tidak Valid</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PANEL DETAIL JALUR TERPILIH */}
        {selectedRoute && (
          <div className="route-detail-panel">
            <div className="detail-header">
              <div className="detail-title-wrap">
                <span
                  className="detail-color-pill"
                  style={{ backgroundColor: selectedRoute.color }}
                ></span>
                <h3>{selectedRoute.name}</h3>
              </div>
              <button
                type="button"
                className="btn-close-detail"
                onClick={() => setSelectedRouteId(null)}
                aria-label="Tutup detail"
              >
                &times;
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Jumlah Koordinat</span>
                <span className="detail-value">{selectedRoute.rawCoordinates.length} titik</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Estimasi Jarak</span>
                <span className="detail-value">{selectedRoute.distanceKm.toFixed(3)} km</span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">Koordinat Awal [Lng, Lat]</span>
                <span className="detail-code">
                  {selectedRoute.rawCoordinates[0][0]}, {selectedRoute.rawCoordinates[0][1]}
                </span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">Koordinat Akhir [Lng, Lat]</span>
                <span className="detail-code">
                  {selectedRoute.rawCoordinates[selectedRoute.rawCoordinates.length - 1][0]},{' '}
                  {selectedRoute.rawCoordinates[selectedRoute.rawCoordinates.length - 1][1]}
                </span>
              </div>
            </div>

            <div className="detail-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const bounds = L.latLngBounds(selectedRoute.leafletCoords);
                  setFocusBounds(bounds);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
                <span>Fokuskan ke Jalur</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetZoom}
              >
                <span>Tutup</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
