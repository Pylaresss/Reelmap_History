// app.js (module) — Supabase (Postgres) + carte satellite + slider par année + panneau événements repliable + player YouTube modal

// ---- UI elements (nouveau layout)
const range = document.getElementById("range");
const selectedDate = document.getElementById("selectedDate");
const eventsList = document.getElementById("eventsList");
const eventsPanel = document.getElementById("eventsPanel");
const togglePanel = document.getElementById("togglePanel");

// ---- Format date
const fmtDay = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

// ---- Modal video elements
const videoModal = document.getElementById("videoModal");
const videoFrame = document.getElementById("videoFrame");
const modalClose = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/");
    const embedIdx = parts.indexOf("embed");
    if (embedIdx !== -1 && parts[embedIdx + 1]) return parts[embedIdx + 1];
  } catch (e) {}
  return null;
}

function openVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return;

  videoFrame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  videoModal.classList.remove("hidden");
  videoModal.setAttribute("aria-hidden", "false");
}

function closeVideo() {
  videoModal.classList.add("hidden");
  videoModal.setAttribute("aria-hidden", "true");
  videoFrame.src = "";
}

modalClose.addEventListener("click", closeVideo);
modalBackdrop.addEventListener("click", closeVideo);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !videoModal.classList.contains("hidden")) closeVideo();
});

// ✅ Délégation click (liste + popup)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".eventLinkBtn, .watchBtn");
  if (!btn) return;
  const url = btn.dataset.youtube;
  if (!url) return;
  openVideo(url);
});

// ---- Toggle panneau événements
togglePanel.addEventListener("click", () => {
  const isCollapsed = eventsPanel.classList.contains("collapsed");
  eventsPanel.classList.toggle("collapsed", !isCollapsed);
  eventsPanel.classList.toggle("expanded", isCollapsed);
  togglePanel.textContent = isCollapsed ? "⬇" : "⬆";
});

// ---- Supabase config
const SUPABASE_URL = "https://dxcssekpwizrwkvtwxll.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bnZy8XWs7607Bag5f1jeqQ_7LUQl7IL";

async function loadEventsFromSupabase() {
  const url = `${SUPABASE_URL}/rest/v1/events?select=*&order=start_date.asc`;
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase ${r.status}: ${txt}`);
  }

  const rows = await r.json();

  // Normalisation : DB -> format front
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start_date,
    end: e.end_date,
    lat: e.lat,
    lng: e.lng,
    summary: e.summary || "",
    youtube: e.youtube_url || "",
  }));
}

function showError(msg) {
  console.error(msg);
  if (eventsList) {
    eventsList.innerHTML = `<div class="hint">❌ ${msg}</div>`;
  }
}

// ---- Load events (avec sécurité)
let EVENTS = [];
try {
  EVENTS = await loadEventsFromSupabase();
} catch (err) {
  showError(`Impossible de charger les événements : ${err.message}`);
}

// ---- Build timeline by year
function buildTimelineByYear(events) {
  if (!events || events.length === 0) return [2024]; // fallback
  const years = events.flatMap((e) => [
    new Date(e.start + "T00:00:00Z").getUTCFullYear(),
    new Date(e.end + "T00:00:00Z").getUTCFullYear(),
  ]);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const timeline = [];
  for (let y = minYear; y <= maxYear; y++) timeline.push(y);
  return timeline;
}

const timeline = buildTimelineByYear(EVENTS);

// ---- Filter events active during a year
function filterEventsForYear(year) {
  return EVENTS.filter((e) => {
    const startYear = new Date(e.start + "T00:00:00Z").getUTCFullYear();
    const endYear = new Date(e.end + "T00:00:00Z").getUTCFullYear();
    return year >= startYear && year <= endYear;
  });
}

// ---- GeoJSON
function toGeoJSON(events) {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: {
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        summary: e.summary,
        youtube: e.youtube,
      },
    })),
  };
}

// ---- Render list
function renderList(events) {
  if (!eventsList) return;

  if (!events || events.length === 0) {
    eventsList.innerHTML = `<div class="hint">Aucun événement pour cette année.</div>`;
    return;
  }

  eventsList.innerHTML = events
    .map(
      (e) => `
      <div class="eventCard">
        <div class="eventTitle">${e.title}</div>
        <div class="eventMeta">${fmtDay(e.start)} → ${fmtDay(e.end)}</div>
        <div class="eventSummary">${e.summary}</div>
        <div style="margin-top:6px;">
          ${e.youtube ? `<button class="eventLinkBtn" data-youtube="${e.youtube}">▶️ Regarder</button>` : ""}
        </div>
      </div>
    `
    )
    .join("");
}

// ---- Create map (satellite)
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "esri" }],
  },
  center: [0, 20],
  zoom: 1.2,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

map.on("load", () => {
  // Globe si dispo
  try {
    map.setProjection({ type: "globe" });
  } catch (e) {}

  map.addSource("events", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "events-points",
    type: "circle",
    source: "events",
    paint: {
      "circle-radius": 8,
      "circle-color": "#ff3b3b",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.95,
    },
  });

  // Popup au clic
  map.on("click", "events-points", (e) => {
    const f = e.features[0];
    const p = f.properties;

    new maplibregl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
          <div style="font-weight:800; margin-bottom:6px;">${p.title}</div>
          <div style="opacity:.8; margin-bottom:8px;">${p.start} → ${p.end}</div>
          <div style="margin-bottom:10px;">${p.summary}</div>
          ${p.youtube ? `<button class="watchBtn" data-youtube="${p.youtube}" style="
            background:#0b0f14;
            color:#e8eef7;
            border:1px solid rgba(0,0,0,.25);
            border-radius:10px;
            padding:6px 10px;
            cursor:pointer;
          ">▶️ Regarder</button>` : ""}
        </div>
      `)
      .addTo(map);
  });

  map.on("mouseenter", "events-points", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "events-points", () => (map.getCanvas().style.cursor = ""));

  initTimeline();
});

// ---- Slider
function initTimeline() {
  range.min = "0";
  range.max = String(timeline.length - 1);
  range.value = String(timeline.length - 1);

  range.addEventListener("input", updateForSlider);
  updateForSlider();
}

function updateForSlider() {
  const idx = parseInt(range.value, 10);
  const year = timeline[idx];

  selectedDate.textContent = String(year);

  const filtered = filterEventsForYear(year);
  renderList(filtered);

  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON(filtered));
}
