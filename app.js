// app.js (module) — slider par ANNÉE + carte satellite + points visibles + player YouTube en modal + ajout d’événement (génération JSON)

// ---- Format date (pour afficher start/end)
const fmtDay = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

// ---- Elements UI
const range = document.getElementById("range");
const selectedDate = document.getElementById("selectedDate");
const eventsList = document.getElementById("eventsList");

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
  if (!id) {
    console.warn("URL YouTube invalide:", url);
    return;
  }

  videoFrame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  videoModal.classList.remove("hidden");
  videoModal.setAttribute("aria-hidden", "false");
}

function closeVideo() {
  videoModal.classList.add("hidden");
  videoModal.setAttribute("aria-hidden", "true");
  videoFrame.src = ""; // stop la vidéo
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

// ---- Add event UI
const addToggle = document.getElementById("addToggle");
const addPanel = document.getElementById("addPanel");
const addHint = document.getElementById("addHint");

const evTitle = document.getElementById("evTitle");
const evStart = document.getElementById("evStart");
const evEnd = document.getElementById("evEnd");
const evYoutube = document.getElementById("evYoutube");
const evSummary = document.getElementById("evSummary");
const evCoords = document.getElementById("evCoords");

const genJson = document.getElementById("genJson");
const clearForm = document.getElementById("clearForm");
const jsonOut = document.getElementById("jsonOut");

let addMode = false;
let pickedLngLat = null;

// ---- Load events
const SUPABASE_URL = "https://dxcssekpwizrwkvtwxll.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bnZy8XWs7607Bag5f1jeqQ_7LUQl7IL";

async function loadEventsFromSupabase() {
  const url = `${SUPABASE_URL}/rest/v1/events?select=*`;
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase error ${r.status}: ${txt}`);
  }

  const rows = await r.json();

  // Normalisation : on convertit les noms de colonnes DB -> format utilisé par ton front
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

const EVENTS = await loadEventsFromSupabase();


// ---- Build timeline by year
function buildTimelineByYear(events) {
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
        <div style="opacity:.9">${e.summary}</div>
        <div style="margin-top:6px;">
          <button class="eventLinkBtn" data-youtube="${e.youtube}">▶️ Regarder</button>
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

// Toggle add mode UI
addToggle.addEventListener("click", () => {
  addMode = !addMode;
  addPanel.classList.toggle("hidden", !addMode);
  addHint.textContent = addMode ? "Mode ajout : clique sur la carte pour placer le point." : "";
});

map.on("load", () => {
  // Globe si dispo
  try {
    map.setProjection({ type: "globe" });
  } catch (e) {}

  // Source points
  map.addSource("events", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Points visibles sur satellite
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

  // Popup au clic (bouton qui ouvre la modal)
  map.on("click", "events-points", (e) => {
    // Si on est en mode ajout, on ne veut pas ouvrir de popup
    if (addMode) return;

    const f = e.features[0];
    const p = f.properties;

    new maplibregl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
          <div style="font-weight:800; margin-bottom:6px;">${p.title}</div>
          <div style="opacity:.8; margin-bottom:8px;">${p.start} → ${p.end}</div>
          <div style="margin-bottom:10px;">${p.summary}</div>
          <button class="watchBtn" data-youtube="${p.youtube}" style="
            background:#0b0f14;
            color:#e8eef7;
            border:1px solid rgba(0,0,0,.25);
            border-radius:10px;
            padding:6px 10px;
            cursor:pointer;
          ">▶️ Regarder</button>
        </div>
      `)
      .addTo(map);
  });

  // Clic carte pour choisir coordonnées en mode ajout
  map.on("click", (e) => {
    if (!addMode) return;

    pickedLngLat = [e.lngLat.lng, e.lngLat.lat];
    evCoords.value = `${pickedLngLat[1].toFixed(6)}, ${pickedLngLat[0].toFixed(6)} (lat, lng)`;
  });

  map.on("mouseenter", "events-points", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "events-points", () => (map.getCanvas().style.cursor = ""));

  initTimeline();
});

// ---- Add-event helpers
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

genJson.addEventListener("click", () => {
  if (!pickedLngLat) {
    jsonOut.value = "❌ Clique d'abord sur la carte pour choisir l'emplacement.";
    return;
  }
  if (!evTitle.value || !evStart.value || !evYoutube.value) {
    jsonOut.value = "❌ Remplis au minimum : Titre, Date début, Lien YouTube.";
    return;
  }

  const obj = {
    id: slugify(evTitle.value) || `event-${Date.now()}`,
    title: evTitle.value.trim(),
    start: evStart.value,
    end: (evEnd.value || evStart.value),
    lat: Number(pickedLngLat[1].toFixed(6)),
    lng: Number(pickedLngLat[0].toFixed(6)),
    summary: (evSummary.value || "").trim(),
    youtube: evYoutube.value.trim()
  };

  jsonOut.value = JSON.stringify(obj, null, 2);
});

clearForm.addEventListener("click", () => {
  evTitle.value = "";
  evStart.value = "";
  evEnd.value = "";
  evYoutube.value = "";
  evSummary.value = "";
  evCoords.value = "";
  jsonOut.value = "";
  pickedLngLat = null;
});

// ---- Slider
function initTimeline() {
  range.min = "0";
  range.max = String(timeline.length - 1);
  range.value = String(timeline.length - 1); // dernière année par défaut

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
