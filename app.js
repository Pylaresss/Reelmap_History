// app.js (module) — Supabase + carte satellite + slider par année + panneau repliable + modal vidéo + recherche intelligente + suggestions

function yearFromSupabaseDate(s) {
  // "0331-10-01 BC" -> -331
  // "1918-10-02"    -> 1918
  if (!s) return null;

  const isBC = s.includes("BC");
  const y = parseInt(s.slice(0, 4), 10); // "0331" -> 331
  return isBC ? -y : y;
}

function displayYear(y) {
  if (y == null) return "";
  return y < 0 ? `${Math.abs(y)} av. J.-C.` : `${y}`;
}

// Format affichage jour/mois/année (supporte BC)
function fmtDay(iso) {
  if (!iso) return "—";

  const isBC = iso.includes("BC");
  const raw = iso.replace(" BC", "");
  const [yyyy, mm, dd] = raw.split("-");
  const y = parseInt(yyyy, 10);

  const base = `${dd}/${mm}/${String(y).padStart(1, "0")}`;
  return isBC ? `${base} av. J.-C.` : `${base}/${y}`.replace(`${dd}/${mm}/${y}`, `${dd}/${mm}/${y}`);
}

// Variante plus simple/robuste : DD/MM/YYYY + suffixe BC si besoin
function fmtDay2(iso) {
  if (!iso) return "—";
  const isBC = iso.includes("BC");
  const raw = iso.replace(" BC", "");
  const [yyyy, mm, dd] = raw.split("-");
  const y = parseInt(yyyy, 10);
  const base = `${dd}/${mm}/${y}`;
  return isBC ? `${base} av. J.-C.` : base;
}

// ---- UI elements
const randomBtn = document.getElementById("randomBtn");
const range = document.getElementById("range");
const selectedDate = document.getElementById("selectedDate");
const eventsList = document.getElementById("eventsList");
const eventsPanel = document.getElementById("eventsPanel");
const togglePanel = document.getElementById("togglePanel");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const suggestionsEl = document.getElementById("suggestions");

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

// ---- Helpers
function showError(msg) {
  console.error(msg);
  if (eventsList) {
    eventsList.innerHTML = `<div class="hint">❌ ${msg}</div>`;
  }
}

function normalizeQuery(q) {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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

  // DB -> format front
  // ✅ Ajout startYear/endYear + correction si inversé
  return rows.map((e) => {
    const startYear = yearFromSupabaseDate(e.start_date);
    const endYear = yearFromSupabaseDate(e.end_date);

    // Si end < start, on swap pour éviter de filtrer "dans le vide"
    let start = e.start_date;
    let end = e.end_date;
    let sY = startYear;
    let eY = endYear;

    if (sY != null && eY != null && eY < sY) {
      [start, end] = [end, start];
      [sY, eY] = [eY, sY];
    }

    return {
      id: e.id,
      title: e.title,
      start,
      end,
      startYear: sY,
      endYear: eY,
      lat: e.lat,
      lng: e.lng,
      summary: e.summary || "",
      youtube: e.youtube_url || "",
    };
  });
}

// ---- Load events
let EVENTS = [];
try {
  EVENTS = await loadEventsFromSupabase();
} catch (err) {
  showError(`Impossible de charger les événements : ${err.message}`);
}

// ---- Build timeline by year (✅ BC-safe)
function buildTimelineByYear(events) {
  if (!events || events.length === 0) return [2024];

  const years = events
    .flatMap((e) => [e.startYear, e.endYear])
    .filter((y) => typeof y === "number" && !Number.isNaN(y));

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const timeline = [];
  for (let y = minYear; y <= maxYear; y++) timeline.push(y);
  return timeline;
}

const timeline = buildTimelineByYear(EVENTS);

function clampYearToTimeline(year) {
  const minY = timeline[0];
  const maxY = timeline[timeline.length - 1];
  return Math.min(maxY, Math.max(minY, year));
}

function setSliderToYear(year) {
  const y = clampYearToTimeline(year);
  const idx = timeline.indexOf(y);
  if (idx !== -1) {
    range.value = String(idx);
    updateForSlider();
  }
}

// ---- Filters (✅ BC-safe)
function filterEventsForYear(year) {
  return EVENTS.filter((e) => {
    const startYear = e.startYear;
    const endYear = e.endYear ?? e.startYear;

    if (startYear == null) return false;
    return year >= startYear && year <= endYear;
  });
}

function filterEventsForYearRange(startYear, endYear) {
  return EVENTS.filter((e) => {
    const s = e.startYear;
    const en = e.endYear ?? e.startYear;
    if (s == null) return false;
    return !(en < startYear || s > endYear);
  });
}

function filterEventsByText(events, qNorm) {
  if (!qNorm) return events;
  return events.filter((e) => {
    const hay = normalizeQuery(`${e.title} ${e.summary || ""}`);
    return hay.includes(qNorm);
  });
}

// ---- Intelligent search presets (termes -> période)
const PERIOD_PRESETS = [
  {
    keys: [
      "seconde guerre mondiale",
      "seconde guerre mondial",
      "2e guerre mondiale",
      "2eme guerre mondiale",
      "2ème guerre mondiale",
      "deuxieme guerre mondiale",
      "deuxième guerre mondiale",
      "ww2",
      "world war 2",
      "world war ii",
      "2gm",
    ],
    start: 1939,
    end: 1945,
  },
  {
    keys: [
      "premiere guerre mondiale",
      "première guerre mondiale",
      "premiere guerre mondial",
      "première guerre mondial",
      "1ere guerre mondiale",
      "1ère guerre mondiale",
      "ww1",
      "world war 1",
      "world war i",
      "1gm",
    ],
    start: 1914,
    end: 1918,
  },
  {
    keys: ["guerre froide", "cold war"],
    start: 1947,
    end: 1991,
  },
  {
    keys: ["debarquement", "débarquement", "normandie", "d-day", "dday"],
    start: 1944,
    end: 1944,
  },
];

const PERIOD_SUGGESTIONS = [
  { label: "Seconde Guerre mondiale", start: 1939, end: 1945, keywords: PERIOD_PRESETS[0].keys },
  { label: "Première Guerre mondiale", start: 1914, end: 1918, keywords: PERIOD_PRESETS[1].keys },
  { label: "Guerre froide", start: 1947, end: 1991, keywords: PERIOD_PRESETS[2].keys },
  { label: "Débarquement (Normandie)", start: 1944, end: 1944, keywords: PERIOD_PRESETS[3].keys },
];

function findPreset(qNorm) {
  // match direct
  for (const p of PERIOD_PRESETS) {
    if (p.keys.some((k) => qNorm.includes(normalizeQuery(k)))) return p;
  }

  // match par mots (robuste fautes/ordre)
  const qWords = new Set(qNorm.split(/\s+/).filter(Boolean));
  for (const p of PERIOD_PRESETS) {
    for (const k of p.keys) {
      const kWords = normalizeQuery(k).split(/\s+/).filter(Boolean);
      const hits = kWords.filter((w) => qWords.has(w)).length;
      if (hits >= 2) return p;
    }
  }
  return null;
}

// ---- Search state
let searchMode = null;
// null = normal (slider année)
// {type:"range", start, end} = période
// {type:"text", text} = texte

function showRandomEvent() {
  if (!EVENTS || EVENTS.length === 0) return;

  // 1) Choisir un événement au hasard
  const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];

  // 2) Trouver une année valide
  const year = ev.startYear ?? ev.endYear;
  if (year == null) return;

  // 3) Désactiver les filtres/recherches
  searchMode = null;
  hideSuggestions();

  // 4) Positionner le slider sur l’année de l’event
  setSliderToYear(year);

  // 5) N’afficher que cet événement
  renderList([ev]);
  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON([ev]));

  // 6) Mettre à jour l’affichage de la date
  selectedDate.textContent = displayYear(year);

  // 7) Centrer la carte sur l’événement
  if (typeof ev.lng === "number" && typeof ev.lat === "number") {
    map.flyTo({
      center: [ev.lng, ev.lat],
      zoom: 5,
      speed: 0.8,
      curve: 1.4,
    });
  }

  // 8) OUVRIR AUTOMATIQUEMENT LA POPUP (page de l’événement)
  setTimeout(() => {
    const popupHtml = `
      <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
        <div style="font-weight:800; margin-bottom:6px;">${ev.title}</div>
        <div style="opacity:.8; margin-bottom:8px;">
          ${fmtDay2(ev.start)} → ${fmtDay2(ev.end)}
        </div>
        <div style="margin-bottom:10px;">${ev.summary}</div>
        ${
          ev.youtube
            ? `<button class="watchBtn" data-youtube="${ev.youtube}" style="
              background:#0b0f14;
              color:#e8eef7;
              border:1px solid rgba(0,0,0,.25);
              border-radius:10px;
              padding:6px 10px;
              cursor:pointer;
            ">▶️ Regarder</button>`
            : ""
        }
      </div>
    `;

    new maplibregl.Popup()
      .setLngLat([ev.lng, ev.lat])
      .setHTML(popupHtml)
      .addTo(map);
  }, 600); // petit délai pour laisser le temps à la carte de se recentrer
}



function applySearch() {
  const qNorm = normalizeQuery(searchInput.value);

  if (!qNorm) {
    searchMode = null;
    updateForSlider();
    return;
  }

  const preset = findPreset(qNorm);

  if (preset) {
    searchMode = { type: "range", start: preset.start, end: preset.end, text: qNorm };
    setSliderToYear(preset.start);

    const eventsRange = filterEventsForYearRange(preset.start, preset.end);
    renderList(eventsRange);

    const src = map.getSource("events");
    if (src) src.setData(toGeoJSON(eventsRange));

    selectedDate.textContent = `${preset.start}–${preset.end}`;
    return;
  }

  // Sinon filtre texte sur l’année courante
  searchMode = { type: "text", text: qNorm };
  updateForSlider();
}

searchBtn.addEventListener("click", () => {
  hideSuggestions();
  applySearch();
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  hideSuggestions();
  searchMode = null;
  updateForSlider();
});

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
    eventsList.innerHTML = `<div class="hint">Aucun événement pour cette recherche.</div>`;
    return;
  }

  eventsList.innerHTML = events
    .map(
      (e) => `
      <div class="eventCard">
        <div class="eventTitle">${e.title}</div>
        <div class="eventMeta">${fmtDay2(e.start)} → ${fmtDay2(e.end)}</div>
        <div class="eventSummary">${e.summary}</div>
        <div style="margin-top:6px;">
          ${e.youtube ? `<button class="eventLinkBtn" data-youtube="${e.youtube}">▶️ Regarder</button>` : ""}
        </div>
      </div>
    `
    )
    .join("");
}

// ---- Map (satellite)
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

  map.on("click", "events-points", (e) => {
    const f = e.features[0];
    const p = f.properties;
    const coords = f.geometry.coordinates; // [lng, lat]

    // 1️⃣ Zoom + déplacement fluide vers le point
    map.flyTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 5), // au moins zoom 5
      speed: 0.8,
      curve: 1.4,
      essential: true,
    });

    // 2️⃣ Fermer les popups existantes (optionnel mais propre)
    document.querySelectorAll(".maplibregl-popup").forEach((el) => el.remove());

    // 3️⃣ Ouvrir la popup après un petit délai (effet plus fluide)
    setTimeout(() => {
      const dateTxt = `${fmtDay2(p.start)} → ${fmtDay2(p.end)}`;

      new maplibregl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
            <div style="font-weight:800; margin-bottom:6px;">${p.title}</div>
            <div style="opacity:.8; margin-bottom:8px;">${dateTxt}</div>
            <div style="margin-bottom:10px;">${p.summary}</div>
            ${
              p.youtube
                ? `<button class="watchBtn" data-youtube="${p.youtube}" style="
                  background:#0b0f14;
                  color:#e8eef7;
                  border:1px solid rgba(0,0,0,.25);
                  border-radius:10px;
                  padding:6px 10px;
                  cursor:pointer;
                ">▶️ Regarder</button>`
                : ""
            }
          </div>
        `)
        .addTo(map);
    }, 450); // petit délai pour laisser le temps au zoom
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

  range.addEventListener("input", () => {
    // bouger le slider = revenir à un mode normal
    if (searchMode?.type === "range") {
      searchMode = null;
    }
    updateForSlider();
  });

  updateForSlider();
}

function updateForSlider() {
  const idx = parseInt(range.value, 10);
  const year = timeline[idx];

  // En mode période, c’est la recherche qui affiche
  if (searchMode?.type === "range") return;

  // ✅ Affichage BC-friendly dans la pill "Chronologie"
  selectedDate.textContent = displayYear(year);

  let filtered = filterEventsForYear(year);

  if (searchMode?.type === "text") {
    filtered = filterEventsByText(filtered, searchMode.text);
  }

  renderList(filtered);

  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON(filtered));
}

// =========================
// AUTOCOMPLETE (Google-like)
// =========================
let currentSuggestions = [];
let activeIndex = -1;

function showSuggestions(items) {
  currentSuggestions = items;
  activeIndex = -1;

  if (!items.length) {
    suggestionsEl.classList.add("hidden");
    suggestionsEl.innerHTML = "";
    return;
  }

  suggestionsEl.innerHTML = items
    .map(
      (it, idx) => `
      <div class="suggestionItem" data-idx="${idx}">
        <div class="suggestionLabel">${it.label}</div>
        <div class="suggestionMeta">${it.start}–${it.end}</div>
      </div>
    `
    )
    .join("");

  suggestionsEl.classList.remove("hidden");
}

function hideSuggestions() {
  suggestionsEl.classList.add("hidden");
  suggestionsEl.innerHTML = "";
  currentSuggestions = [];
  activeIndex = -1;
}

function setActiveSuggestion(newIdx) {
  const nodes = suggestionsEl.querySelectorAll(".suggestionItem");
  if (!nodes.length) return;

  nodes.forEach((n) => n.classList.remove("active"));

  activeIndex = newIdx;
  if (activeIndex >= 0 && activeIndex < nodes.length) {
    nodes[activeIndex].classList.add("active");
    nodes[activeIndex].scrollIntoView({ block: "nearest" });
  }
}

function applySuggestion(item) {
  searchInput.value = item.label;
  hideSuggestions();

  searchMode = { type: "range", start: item.start, end: item.end, text: normalizeQuery(item.label) };
  setSliderToYear(item.start);

  const eventsRange = filterEventsForYearRange(item.start, item.end);
  renderList(eventsRange);

  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON(eventsRange));

  selectedDate.textContent = `${item.start}–${item.end}`;
}

suggestionsEl.addEventListener("click", (e) => {
  const item = e.target.closest(".suggestionItem");
  if (!item) return;
  const idx = parseInt(item.dataset.idx, 10);
  const picked = currentSuggestions[idx];
  if (picked) applySuggestion(picked);
});

searchInput.addEventListener("input", () => {
  const q = normalizeQuery(searchInput.value);

  if (!q || q.length < 2) {
    hideSuggestions();
    return;
  }

  const matched = PERIOD_SUGGESTIONS.filter((s) => {
    const labelNorm = normalizeQuery(s.label);
    if (labelNorm.includes(q)) return true;

    return (s.keywords || []).some((k) => {
      const kn = normalizeQuery(k);
      return kn.includes(q) || q.includes(kn);
    });
  });

  showSuggestions(matched.slice(0, 6));
});

searchInput.addEventListener("keydown", (e) => {
  // Enter sans suggestion active -> lance recherche normale
  if (e.key === "Enter" && suggestionsEl.classList.contains("hidden")) {
    applySearch();
    return;
  }

  if (suggestionsEl.classList.contains("hidden")) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveSuggestion(Math.min(activeIndex + 1, currentSuggestions.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveSuggestion(Math.max(activeIndex - 1, 0));
  } else if (e.key === "Enter") {
    if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
      e.preventDefault();
      applySuggestion(currentSuggestions[activeIndex]);
    } else {
      applySearch();
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (e.target.closest(".searchWrap")) return;
  hideSuggestions();
});

randomBtn.addEventListener("click", () => {
  showRandomEvent();
});

