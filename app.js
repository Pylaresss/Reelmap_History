// app.js — Supabase + carte + blocs 100 ans + frise années (points) + recherche + random + popup vidéo


const HOME_VIEW = {
  center: [0, 20],
  zoom: 1.2,
  bearing: 0,
  pitch: 0,
};

function resetMapView() {
  map.flyTo({
    ...HOME_VIEW,
    speed: 0.9,
    curve: 1.4,
    essential: true,
  });
}

// =====================
// Dates (BC-safe)
// =====================
function yearFromSupabaseDate(s) {
  // "0331-10-01 BC" -> -331
  // "1918-10-02"    -> 1918
  if (!s) return null;
  const isBC = s.includes("BC");
  const y = parseInt(s.slice(0, 4), 10);
  return isBC ? -y : y;
}

function displayYear(y) {
  if (y == null) return "";
  return y < 0 ? `${Math.abs(y)} av. J.-C.` : `${y}`;
}

function fmtDay2(iso) {
  if (!iso) return "—";
  const isBC = iso.includes("BC");
  const raw = iso.replace(" BC", "");
  const [yyyy, mm, dd] = raw.split("-");
  const y = parseInt(yyyy, 10);
  const base = `${dd}/${mm}/${y}`;
  return isBC ? `${base} av. J.-C.` : base;
}

function normalizeQuery(q) {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// =====================
// UI
// =====================
const randomBtn = document.getElementById("randomBtn");
const centuryBar = document.getElementById("centuryBar");
const timelineTrack = document.getElementById("timelineTrack");
const selectedDate = document.getElementById("selectedDate");
const eventsList = document.getElementById("eventsList");
const eventsPanel = document.getElementById("eventsPanel");
const togglePanel = document.getElementById("togglePanel");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const suggestionsEl = document.getElementById("suggestions");

const topToolbar = document.getElementById("topToolbar");
const toolbarToggle = document.getElementById("toolbarToggle");

toolbarToggle?.addEventListener("click", () => {
  const isOpen = topToolbar.classList.contains("expanded");
  topToolbar.classList.toggle("expanded", !isOpen);
  topToolbar.classList.toggle("collapsed", isOpen);
  toolbarToggle.textContent = isOpen ? "⌄" : "⌃";
});


// Modal vidéo
const videoModal = document.getElementById("videoModal");
const videoFrame = document.getElementById("videoFrame");
const modalClose = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");

// =====================
// Helpers UI
// =====================
function showError(msg) {
  console.error(msg);
  if (eventsList) eventsList.innerHTML = `<div class="hint">❌ ${msg}</div>`;
}

// Toggle panel
togglePanel?.addEventListener("click", () => {
  const isCollapsed = eventsPanel.classList.contains("collapsed");
  eventsPanel.classList.toggle("collapsed", !isCollapsed);
  eventsPanel.classList.toggle("expanded", isCollapsed);
  togglePanel.textContent = isCollapsed ? "⬇" : "⬆";
});

const PERIOD_BLOCKS = [
  { id: "antiq",  label: "-400 à -1",      start: -400, end: -1 },
  { id: "p1",     label: "0 à 999",        start: 0,    end: 999 },
  { id: "p2",     label: "1000 à 1699",    start: 1000, end: 1699 },
  { id: "p3",     label: "1700 à 1799",    start: 1700, end: 1799 },
  { id: "p4",     label: "1800 à 1899",    start: 1800, end: 1899 },
  { id: "p5",     label: "1900 à 1949",    start: 1900, end: 1949 },
  { id: "p6",     label: "1950 à 1999",    start: 1950, end: 1999 },
  { id: "p7",     label: "2000 à aujourd’hui", start: 2000, end: null }, // null = jusqu'à aujourd'hui
];


// =====================
// YouTube modal
// =====================
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

modalClose?.addEventListener("click", closeVideo);
modalBackdrop?.addEventListener("click", closeVideo);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && videoModal && !videoModal.classList.contains("hidden")) closeVideo();
});

// Click delegation video buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".eventLinkBtn, .watchBtn");
  if (!btn) return;
  const url = btn.dataset.youtube;
  if (!url) return;
  openVideo(url);
});

// =====================
// Supabase
// =====================
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

  return rows.map((e) => {
    const startYear = yearFromSupabaseDate(e.start_date);
    const endYear = yearFromSupabaseDate(e.end_date);

    // swap si inversé
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
      endYear: eY ?? sY,
      lat: e.lat,
      lng: e.lng,
      summary: e.summary || "",
      youtube: e.youtube_url || "",
    };
  });
}

// =====================
// Data
// =====================
let EVENTS = [];
try {
  EVENTS = await loadEventsFromSupabase();
} catch (err) {
  showError(`Impossible de charger les événements : ${err.message}`);
}

// =====================
// Map
// =====================
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

// =====================
// Filters
// =====================
function filterEventsForYear(year) {
  return EVENTS.filter((e) => {
    if (e.startYear == null) return false;
    const s = e.startYear;
    const en = e.endYear ?? e.startYear;
    return year >= s && year <= en;
  });
}

function filterEventsForYearRange(startYear, endYear) {
  return EVENTS.filter((e) => {
    if (e.startYear == null) return false;
    const s = e.startYear;
    const en = e.endYear ?? e.startYear;
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

// =====================
// Render list + GeoJSON
// =====================
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

function renderList(events) {
  if (!eventsList) return;

  if (!events || events.length === 0) {
    eventsList.innerHTML = `<div class="hint">Aucun événement pour cette sélection.</div>`;
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

// =====================
// 100-year blocks
// =====================


function resolveBlockEnd(block) {
  // end=null => jusqu'à aujourd'hui (maxYear des events)
  if (block.end != null) return block.end;

  const yearsAll = EVENTS
    .flatMap((e) => [e.startYear, e.endYear])
    .filter((y) => typeof y === "number" && !Number.isNaN(y));

  if (!yearsAll.length) return 2026; // fallback
  return Math.max(...yearsAll);
}

function findBlockForYear(year) {
  for (const b of PERIOD_BLOCKS) {
    const end = resolveBlockEnd(b);
    if (year >= b.start && year <= end) return b;
  }
  return null;
}


// =====================
// Years inside selected block
// =====================
function computeYearsInActiveBlock() {
  if (!ACTIVE_BLOCK) return [];

  const blockStart = ACTIVE_BLOCK.start;
  const blockEnd = ACTIVE_BLOCK.end;

  const eventsInRange = filterEventsForYearRange(blockStart, blockEnd);
  const set = new Set();

  for (const e of eventsInRange) {
    const s = Math.max(blockStart, e.startYear);
    const en = Math.min(blockEnd, e.endYear ?? e.startYear);
    for (let y = s; y <= en; y++) set.add(y);
  }

  return Array.from(set).sort((a, b) => a - b);
}


// =====================
// Timeline rendering
// =====================
let ACTIVE_BLOCK = null;  // {start,end}
let ACTIVE_YEAR = null;


function selectBlock(block) {
  closeOpenPopup();
  resetMapView();

  if (!block) return;

  const end = resolveBlockEnd(block);
  ACTIVE_BLOCK = { ...block, end };

  // UI active
  document.querySelectorAll(".centuryBlock").forEach((b) => {
    b.classList.toggle("active", b.dataset.id === block.id);
  });

  renderYearDotsForActiveBlock();
}


function selectYear(year) {
  closeOpenPopup();
  resetMapView();
  
  ACTIVE_YEAR = year;
  selectedDate.textContent = displayYear(year);

  // dots active
  document.querySelectorAll(".timelineDot").forEach((d) => {
    d.classList.toggle("active", parseInt(d.dataset.year, 10) === year);
  });

  // filtrage events année + MAJ map + list
  let filtered = filterEventsForYear(year);

  // texte (si actif)
  if (searchMode?.type === "text") {
    filtered = filterEventsByText(filtered, searchMode.text);
  }

  renderList(filtered);

  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON(filtered));
}

function renderYearDotsForActiveBlock() {
  if (!timelineTrack || !ACTIVE_BLOCK) return;

  timelineTrack.innerHTML = `<div class="timelineLine"></div>`;

  const { start, end } = ACTIVE_BLOCK;
  const years = computeYearsInActiveBlock();


  if (!years.length) {
    // si pas d’événement dans ce bloc
    selectedDate.textContent = "—";
    return;
  }

  for (const y of years) {
    const span = Math.max(1, (end - start));
    const t = (y - start) / span;

    const dot = document.createElement("div");
    dot.className = "timelineDot";
    dot.dataset.year = String(y);
    dot.style.left = `${t * 100}%`;

    const tip = document.createElement("div");
    tip.className = "timelineTip";
    tip.textContent = displayYear(y);
    dot.appendChild(tip);

    dot.addEventListener("click", () => {
      // si on était en mode période, on revient au normal
      if (searchMode?.type === "range") searchMode = null;
      selectYear(y);
    });

    timelineTrack.appendChild(dot);
  }

  // En mode "range" (recherche période), on n'auto-sélectionne pas une année
  // sinon ça écrase la recherche et ça te renvoie vers une année du bloc (ex: 1996).
  if (searchMode?.type !== "range") {
    const defaultYear = years[years.length - 1];
    selectYear(defaultYear);
  }

}

// =====================
// Search presets + autocomplete
// =====================
const PERIOD_PRESETS = [
  {
    keys: ["seconde guerre mondiale", "ww2", "world war ii", "2gm"],
    start: 1939,
    end: 1945,
  },
  {
    keys: ["premiere guerre mondiale", "première guerre mondiale", "ww1", "world war i", "1gm"],
    start: 1914,
    end: 1918,
  },
  { keys: ["guerre froide", "cold war"], start: 1947, end: 1991 },
  { keys: ["debarquement", "débarquement", "normandie", "d-day", "dday"], start: 1944, end: 1944 },
];

const PERIOD_SUGGESTIONS = [
  { label: "Seconde Guerre mondiale", start: 1939, end: 1945, keywords: PERIOD_PRESETS[0].keys },
  { label: "Première Guerre mondiale", start: 1914, end: 1918, keywords: PERIOD_PRESETS[1].keys },
  { label: "Guerre froide", start: 1947, end: 1991, keywords: PERIOD_PRESETS[2].keys },
  { label: "Débarquement (Normandie)", start: 1944, end: 1944, keywords: PERIOD_PRESETS[3].keys },
];

function findPreset(qNorm) {
  for (const p of PERIOD_PRESETS) {
    if (p.keys.some((k) => qNorm.includes(normalizeQuery(k)))) return p;
  }
  return null;
}

let searchMode = null;
// null
// {type:"range", start, end}
// {type:"text", text}

function applySearch() {
  const qNorm = normalizeQuery(searchInput.value);

  if (!qNorm) {
    searchMode = null;
    // revenir à l’année active
    if (ACTIVE_YEAR != null) selectYear(ACTIVE_YEAR);
    return;
  }

  const preset = findPreset(qNorm);
  if (preset) {
    searchMode = { type: "range", start: preset.start, end: preset.end, text: qNorm };

    const eventsRange = filterEventsForYearRange(preset.start, preset.end);
    renderList(eventsRange);
    const src = map.getSource("events");
    if (src) src.setData(toGeoJSON(eventsRange));
    selectedDate.textContent = `${preset.start}–${preset.end}`;

    // on se place sur le bloc du start
    selectBlock(findBlockForYear(preset.start));
    return;
  }

  // Texte : filtre sur l’année active
  searchMode = { type: "text", text: qNorm };
  if (ACTIVE_YEAR != null) selectYear(ACTIVE_YEAR);
}

searchBtn?.addEventListener("click", () => {
  hideSuggestions();
  applySearch();
});

clearBtn?.addEventListener("click", () => {
  searchInput.value = "";
  hideSuggestions();
  searchMode = null;
  if (ACTIVE_YEAR != null) selectYear(ACTIVE_YEAR);
});

// Autocomplete
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

  const eventsRange = filterEventsForYearRange(item.start, item.end);
  renderList(eventsRange);
  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON(eventsRange));

  selectedDate.textContent = `${item.start}–${item.end}`;
  selectBlock(findBlockForYear(item.start));
}

suggestionsEl?.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".suggestionItem");
  if (!itemEl) return;
  const idx = parseInt(itemEl.dataset.idx, 10);
  const picked = currentSuggestions[idx];
  if (picked) applySuggestion(picked);
});

searchInput?.addEventListener("input", () => {
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

searchInput?.addEventListener("keydown", (e) => {
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

// =====================
// Random
// =====================
function showRandomEvent() {
  if (!EVENTS || EVENTS.length === 0) return;

  // ✅ ferme la popup actuelle si elle existe
  closeOpenPopup();

  // 1) choisir un événement au hasard
  const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  if (!ev) return;

  // 2) année de référence
  const year = ev.startYear ?? ev.endYear;
  if (year == null) return;

  // 3) reset filtres/recherche
  searchMode = null;
  hideSuggestions?.();

  // 4) sélection bloc + année
  selectBlock(findBlockForYear(year));
  selectYear(year);

  // 5) n’afficher que cet événement (liste + map)
  renderList([ev]);
  const src = map.getSource("events");
  if (src) src.setData(toGeoJSON([ev]));

  // 6) zoom sur l’événement
  if (typeof ev.lng === "number" && typeof ev.lat === "number") {
    const coords = [ev.lng, ev.lat];

    map.flyTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 5),
      speed: 0.8,
      curve: 1.4,
      essential: true,
    });

    // ✅ ouvre la popup quand le zoom est fini
    map.once("moveend", () => {
      closeOpenPopup(); // au cas où on a recliqué très vite

      const dateTxt = `${fmtDay2(ev.start)} → ${fmtDay2(ev.end)}`;

      OPEN_POPUP = new maplibregl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
            <div style="font-weight:800; margin-bottom:6px;">${ev.title}</div>
            <div style="opacity:.8; margin-bottom:8px;">${dateTxt}</div>
            <div style="margin-bottom:10px;">${ev.summary || ""}</div>
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
        `)
        .addTo(map);
    });
  }
}


randomBtn?.addEventListener("click", showRandomEvent);

let OPEN_POPUP = null;

function closeOpenPopup() {
  if (OPEN_POPUP) {
    OPEN_POPUP.remove();
    OPEN_POPUP = null;
  }
}


// =====================
// Init map + layers + clicks
// =====================
map.on("load", () => {
  try { map.setProjection({ type: "globe" }); } catch (e) {}

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

// click point sur carte => zoom + popup + select bloc + année
map.on("click", "events-points", (e) => {
  const f = e.features?.[0];
  if (!f) return;

  const p = f.properties || {};
  const coords = f.geometry?.coordinates;
  if (!coords) return;

  // ✅ ferme l'ancien popup
  closeOpenPopup();

  // select bloc+année depuis start
  const y = yearFromSupabaseDate(p.start);
  if (typeof y === "number") {
    selectBlock(findBlockForYear(y));
    selectYear(y);
  }

  // zoom
  map.flyTo({
    center: coords,
    zoom: Math.max(map.getZoom(), 5),
    speed: 0.8,
    curve: 1.4,
    essential: true,
  });

  // ✅ ouvrir la popup quand le mouvement est fini (plus fiable que setTimeout)
  map.once("moveend", () => {
    closeOpenPopup(); // au cas où tu recliques très vite

    const dateTxt = `${fmtDay2(p.start)} → ${fmtDay2(p.end)}`;

    OPEN_POPUP = new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(`
        <div style="color:#0b0f14; font-family:system-ui; min-width: 220px;">
          <div style="font-weight:800; margin-bottom:6px;">${p.title ?? ""}</div>
          <div style="opacity:.8; margin-bottom:8px;">${dateTxt}</div>
          <div style="margin-bottom:10px;">${p.summary ?? ""}</div>
          ${
            p.youtube
              ? `<button class="watchBtn" data-youtube="${p.youtube}" style="
                background:#0b0f14;color:#e8eef7;border:1px solid rgba(0,0,0,.25);
                border-radius:10px;padding:6px 10px;cursor:pointer;
              ">▶️ Regarder</button>`
              : ""
          }
        </div>
      `)
      .addTo(map);
  });
});


  map.on("mouseenter", "events-points", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "events-points", () => (map.getCanvas().style.cursor = ""));

  // =====================
  // INIT UI blocs 100 ans
  // =====================

  centuryBar.innerHTML = "";

  for (const b of PERIOD_BLOCKS) {
    const el = document.createElement("div");
    el.className = "centuryBlock";
    el.dataset.id = b.id;
    el.textContent = b.label;

    el.addEventListener("click", () => {
      if (searchMode?.type === "range") searchMode = null;
      selectBlock(b);
    });

    centuryBar.appendChild(el);
  }

  // bloc par défaut = celui qui contient l'année max
  const yearsAll = EVENTS
    .flatMap((e) => [e.startYear, e.endYear])
    .filter((y) => typeof y === "number" && !Number.isNaN(y));

  const maxYear = yearsAll.length ? Math.max(...yearsAll) : 2026;
  selectBlock(findBlockForYear(maxYear) || PERIOD_BLOCKS[PERIOD_BLOCKS.length - 1]);

});
