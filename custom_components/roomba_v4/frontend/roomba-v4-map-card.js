const ROOMBA_CARD_TYPE = "roomba-v4-map-card";
const ROOMBA_DOMAIN = "roomba_v4";
const ROOMBA_CARD_VERSION = "4.1.3";

const ROOM_COLORS = [
  "#4e79a7",
  "#59a14f",
  "#af7aa1",
  "#f28e2b",
  "#76b7b2",
  "#edc948",
  "#e15759",
  "#9c755f",
];

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px 8px; font-size: 18px; font-weight: 500;
    color: var(--primary-text-color);
  }
  .header .title { flex: 1; }
  .status {
    font-size: 12px; font-weight: 400; color: var(--secondary-text-color);
    text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .map-wrap {
    position: relative; background: var(--secondary-background-color, #111);
    margin: 0 12px; border-radius: 10px; overflow: hidden;
    min-height: 120px;
  }
  .map-wrap img {
    display: block; width: 100%; height: auto; user-select: none;
    -webkit-user-drag: none;
  }
  .map-wrap svg {
    position: absolute; inset: 0; width: 100%; height: 100%;
  }
  .map-wrap .empty {
    position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; color: var(--secondary-text-color); font-size: 14px;
  }
  .room { cursor: pointer; transition: fill .15s, stroke .15s; }
  .room:hover { fill-opacity: .45; }
  .room.selected { fill: #2196f3; fill-opacity: .45; stroke: #2196f3; stroke-width: 2.5; }
  .room.excluded { fill: #e53935; fill-opacity: .35; stroke: #e53935; stroke-width: 2; }
  .room.in-plan { stroke-dasharray: 6 5; stroke-width: 2; }
  .room.current { fill: #ff9800; fill-opacity: .55; stroke: #ff9800; stroke-width: 3; }
  .room.completed { fill: #66bb6a; fill-opacity: .35; stroke: #43a047; stroke-width: 2; }
  .room-label {
    font-size: 10px; fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,.7);
    stroke-width: 2px; pointer-events: none; text-anchor: middle; dominant-baseline: middle;
  }
  .body { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .modebar, .actions, .routine-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  button {
    font: inherit; font-size: 13px; border-radius: 8px; padding: 6px 10px;
    border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); cursor: pointer;
  }
  button:hover { background: var(--secondary-background-color, rgba(0,0,0,.05)); }
  button.active { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.danger { color: var(--error-color); border-color: var(--error-color); }
  button:disabled { opacity: .45; cursor: default; }
  select {
    font: inherit; font-size: 13px; padding: 5px 7px; border-radius: 7px;
    border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); max-width: 100%;
  }
  .rooms { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px;
    border-radius: 999px; border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color);
    font-size: 13px; cursor: pointer;
  }
  .chip .dot { width: 9px; height: 9px; border-radius: 50%; }
  .chip.selected { border-color: #2196f3; box-shadow: inset 0 0 0 1px #2196f3; }
  .chip.excluded { border-color: #e53935; color: var(--error-color); text-decoration: line-through; }
  .chip.current { border-color: #ff9800; box-shadow: inset 0 0 0 1px #ff9800; }
  .chip.completed { border-color: #43a047; }
  .settings {
    border: 1px solid var(--divider-color); border-radius: 10px;
    padding: 9px 10px; display: flex; flex-direction: column; gap: 8px;
  }
  .settings-head { font-size: 13px; font-weight: 500; }
  .settings-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
  .settings-row label { display: inline-flex; align-items: center; gap: 5px; color: var(--secondary-text-color); }
  .settings-row select:disabled { opacity: .45; }
  .progress { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--secondary-text-color); }
  .bar { height: 7px; border-radius: 999px; background: var(--divider-color); overflow: hidden; }
  .bar > div { height: 100%; background: var(--primary-color); width: 0; transition: width .3s; }
  .notice { font-size: 12px; color: var(--secondary-text-color); min-height: 15px; }
  .notice.error { color: var(--error-color); }
  .muted { color: var(--secondary-text-color); font-size: 12px; }
`;

class RoombaV4MapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._mode = "select";
    this._selected = new Set();
    this._settings = {};
    this._selectedRoutine = "";
    this._busy = false;
    this._notice = "";
    this._noticeIsError = false;
    this._raf = null;
    this._keys = {};
    this._built = false;
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (id) => id.startsWith("camera.") && hass.states[id].attributes &&
        Array.isArray(hass.states[id].attributes.room_geometry)
    );
    return { entity: entity || "camera.roomba_map" };
  }

  static getConfigElement() {
    return document.createElement("roomba-v4-map-card-editor");
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("You need to define a camera entity with room_geometry attributes");
    }
    this._config = { title: "Roomba", ...config };
    this._restoreLocalState();
    if (this._built) {
      this._keys = {};
      this._update();
    }
  }

  getCardSize() {
    return 9;
  }

  connectedCallback() {
    if (!this._built) {
      this._buildShell();
      this._built = true;
    }
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._update();
    });
  }

  _entityState() {
    if (!this._hass || !this._config) return null;
    return this._hass.states[this._config.entity] || null;
  }

  _buildShell() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    const card = document.createElement("ha-card");
    card.innerHTML = `
      <div class="header">
        <div class="title"></div>
        <div class="status"></div>
      </div>
      <div class="map-wrap">
        <img class="map-img" alt="" />
        <svg class="map-overlay" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="empty">Sin mapa disponible</div>
      </div>
      <div class="body">
        <div class="modebar">
          <button data-action="mode" data-mode="all">Toda la casa</button>
          <button data-action="mode" data-mode="select">Seleccionar</button>
          <button data-action="mode" data-mode="exclude">Excluir</button>
        </div>
        <div class="rooms"></div>
        <div class="settings"></div>
        <div class="routine-row">
          <select data-role="routine"></select>
          <button data-action="routine-apply">Aplicar</button>
          <button data-action="routine-start">Iniciar</button>
          <button data-action="routine-save">Guardar</button>
          <button data-action="routine-delete" class="danger">Borrar</button>
        </div>
        <div class="actions"></div>
        <div class="progress"></div>
        <div class="notice"></div>
      </div>
    `;
    this.shadowRoot.append(style, card);
    this._els = {
      title: card.querySelector(".title"),
      status: card.querySelector(".status"),
      wrap: card.querySelector(".map-wrap"),
      img: card.querySelector(".map-img"),
      svg: card.querySelector(".map-overlay"),
      empty: card.querySelector(".empty"),
      modebar: card.querySelector(".modebar"),
      rooms: card.querySelector(".rooms"),
      settings: card.querySelector(".settings"),
      routineSelect: card.querySelector('[data-role="routine"]'),
      routineRow: card.querySelector(".routine-row"),
      actions: card.querySelector(".actions"),
      progress: card.querySelector(".progress"),
      notice: card.querySelector(".notice"),
    };

    card.addEventListener("click", (event) => this._onClick(event));
    card.addEventListener("change", (event) => this._onChange(event));
    this._els.img.addEventListener("error", () => {
      this._els.img.style.display = "none";
      this._els.empty.style.display = "flex";
    });
    this._els.img.addEventListener("load", () => {
      this._els.img.style.display = "block";
      this._els.empty.style.display = "none";
    });
  }

  _restoreLocalState() {
    try {
      const raw = localStorage.getItem(`roomba_v4_card_${this._config.entity}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (typeof saved.mode === "string") this._mode = saved.mode;
        if (Array.isArray(saved.rooms)) this._selected = new Set(saved.rooms.map(String));
        if (saved.settings && typeof saved.settings === "object") {
          this._settings = saved.settings;
        } else if (saved.profiles && typeof saved.profiles === "object") {
          const legacy = Object.values(saved.profiles).find((value) => value && typeof value === "object");
          if (legacy) this._settings = legacy;
        }
        if (typeof saved.routine === "string") this._selectedRoutine = saved.routine;
      }
    } catch (err) {
      // Ignore malformed local storage.
    }
  }

  _saveLocalState() {
    try {
      localStorage.setItem(`roomba_v4_card_${this._config.entity}`, JSON.stringify({
        mode: this._mode,
        rooms: [...this._selected],
        settings: this._settings,
        routine: this._selectedRoutine,
      }));
    } catch (err) {
      // Ignore storage quota errors.
    }
  }

  _setNotice(text, isError = false) {
    this._notice = text || "";
    this._noticeIsError = isError;
    if (this._els) {
      this._els.notice.textContent = this._notice;
      this._els.notice.classList.toggle("error", this._noticeIsError);
    }
  }

  _update() {
    if (!this._built) return;
    const state = this._entityState();
    this._els.title.textContent = this._config.title || "Roomba";
    if (!state) {
      this._els.status.textContent = "Entidad no disponible";
      this._els.empty.style.display = "flex";
      this._els.img.style.display = "none";
      this._els.rooms.innerHTML = "";
      this._els.settings.innerHTML = "";
      this._els.actions.innerHTML = "";
      this._els.progress.innerHTML = "";
      return;
    }
    const attrs = state.attributes || {};
    const geo = Array.isArray(attrs.room_geometry) ? attrs.room_geometry : [];
    const status = this._statusText(attrs);
    this._els.status.textContent = status;

    this._updateImage(state);
    this._updateMap(attrs, geo);
    this._updateModes();
    this._updateRoomList(attrs, geo);
    this._updateSettings(attrs);
    this._updateRoutines(attrs);
    this._updateActions(attrs);
    this._updateProgress(attrs);
    this._setNotice(this._notice, this._noticeIsError);
  }

  _statusText(attrs) {
    const plan = attrs.active_plan;
    const vacuum = String(attrs.debug_vacuum_state || "").toLowerCase();
    const mission = plan && plan.status ? String(plan.status) : "";
    const labels = {
      starting: "Iniciando",
      cleaning: "Limpiando",
      paused: "Pausado",
      returning: "Volviendo",
      finished: "Terminado",
      docked: "En base",
      charging: "Cargando",
      idle: "Inactivo",
      error: "Error",
    };
    let text = labels[mission] || labels[vacuum] || vacuum || "Desconocido";
    if (plan && plan.current_room_name) {
      const total = plan.rooms ? plan.rooms.length : 0;
      const done = (plan.completed_room_ids || []).length;
      text += `: ${plan.current_room_name}`;
      if (total) text += ` (${done}/${total})`;
    } else if (plan && plan.rooms && plan.rooms.length) {
      const done = (plan.completed_room_ids || []).length;
      if (plan.status === "finished") text += ` (${done}/${plan.rooms.length})`;
    }
    return text;
  }

  _updateImage(state) {
    const picture = state.attributes && state.attributes.entity_picture;
    const src = picture || `/api/camera_proxy/${state.entity_id}`;
    const joiner = src.includes("?") ? "&" : "?";
    const next = `${src}${joiner}_=${encodeURIComponent(state.last_updated || Date.now())}`;
    if (this._els.img.dataset.src !== next) {
      this._els.img.dataset.src = next;
      this._els.img.src = next;
    }
  }

  _mapMeta(attrs) {
    const meta = attrs.map_render_metadata || {};
    const mapData = attrs.map_data || {};
    const image = meta.image || mapData.image || {};
    const bounds = meta.render_bounds || meta.bounds || mapData.bounds || null;
    return { meta, image, bounds };
  }

  _pointToPixel(point, info) {
    if (!info.bounds || !info.image) return null;
    const b = info.bounds;
    const minX = Number(b.min_x);
    const maxX = Number(b.max_x);
    const minY = Number(b.min_y);
    const maxY = Number(b.max_y);
    const width = Number(info.image.width);
    const height = Number(info.image.height);
    if (![minX, maxX, minY, maxY, width, height].every(Number.isFinite)) return null;
    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    return [
      ((Number(point[0]) - minX) / dx) * width,
      height - ((Number(point[1]) - minY) / dy) * height,
    ];
  }

  _updateMap(attrs, geo) {
    const info = this._mapMeta(attrs);
    const width = info.image && Number(info.image.width);
    const height = info.image && Number(info.image.height);
    if (!width || !height) {
      this._els.svg.innerHTML = "";
      return;
    }
    const boundsKey = info.bounds
      ? [info.bounds.min_x, info.bounds.max_x, info.bounds.min_y, info.bounds.max_y].join(",")
      : "";
    const geometryKey = `${width}x${height}:${boundsKey}:${geo.map((r) => `${r.id}:${(r.polygons || []).length}:${(r.center || []).join(",")}`).join("|")}`;
    const stateKey = `${this._mode}:${[...this._selected].sort().join(",")}:${attrs.current_room_id || ""}:${(attrs.completed_room_ids || []).join(",")}:${(attrs.mission_rooms || []).map((r) => r.id).join(",")}`;
    const key = `${geometryKey}:${stateKey}`;
    if (this._keys.map === key) return;
    this._keys.map = key;
    const svg = this._els.svg;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = "";
    const current = attrs.current_room_id;
    const completed = new Set((attrs.completed_room_ids || []).map(String));
    const inPlan = new Set((attrs.mission_rooms || []).map((room) => String(room.id)));
    geo.forEach((room, index) => {
      const id = String(room.id);
      const cls = this._roomClass(id, current, completed, inPlan);
      (room.polygons || []).forEach((ring) => {
        const points = ring
          .map((point) => this._pointToPixel(point, info))
          .filter((point) => Array.isArray(point));
        if (points.length < 3) return;
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", points.map((point) => `${point[0]},${point[1]}`).join(" "));
        polygon.setAttribute("class", cls);
        polygon.setAttribute("fill", ROOM_COLORS[index % ROOM_COLORS.length]);
        polygon.setAttribute("fill-opacity", "0.16");
        polygon.setAttribute("stroke", ROOM_COLORS[index % ROOM_COLORS.length]);
        polygon.setAttribute("stroke-opacity", "0.8");
        polygon.setAttribute("stroke-width", "1.5");
        polygon.dataset.roomId = id;
        polygon.dataset.action = "toggle-room";
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = room.name || id;
        polygon.appendChild(title);
        svg.appendChild(polygon);
      });
      if (room.center) {
        const center = this._pointToPixel(room.center, info);
        if (center) {
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", center[0]);
          text.setAttribute("y", center[1]);
          text.setAttribute("class", "room-label");
          text.textContent = room.name || id;
          svg.appendChild(text);
        }
      }
    });
  }

  _roomClass(id, current, completed, inPlan) {
    let cls = "room";
    const selected = this._selected.has(id);
    const willClean = this._mode === "all" ||
      (this._mode === "select" && selected) ||
      (this._mode === "exclude" && !selected);
    if (this._mode === "exclude" && selected) cls += " excluded";
    else if (willClean) cls += " selected";
    if (inPlan.has(id)) cls += " in-plan";
    if (completed.has(id)) cls += " completed";
    if (current !== null && current !== undefined && String(current) === id) cls += " current";
    return cls;
  }

  _updateModes() {
    this._els.modebar.querySelectorAll("[data-action='mode']").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === this._mode);
    });
  }

  _updateRoomList(attrs, geo) {
    const current = attrs.current_room_id;
    const completed = new Set((attrs.completed_room_ids || []).map(String));
    const inPlan = new Set((attrs.mission_rooms || []).map((room) => String(room.id)));
    const key = `${this._mode}:${[...this._selected].sort().join(",")}:${current || ""}:${[...completed].join(",")}:${[...inPlan].join(",")}:${geo.map((r) => `${r.id}:${r.name}`).join("|")}`;
    if (this._keys.rooms === key) return;
    this._keys.rooms = key;
    if (!geo.length) {
      this._els.rooms.innerHTML = `<span class="muted">El mapa todavía no expone las habitaciones. Actualiza el mapa desde la integración.</span>`;
      return;
    }
    this._els.rooms.innerHTML = "";
    geo.forEach((room, index) => {
      const id = String(room.id);
      const chip = document.createElement("button");
      chip.className = "chip";
      const selected = this._selected.has(id);
      const willClean = this._mode === "all" ||
        (this._mode === "select" && selected) ||
        (this._mode === "exclude" && !selected);
      if (this._mode === "exclude" && selected) chip.classList.add("excluded");
      else if (willClean) chip.classList.add("selected");
      if (completed.has(id)) chip.classList.add("completed");
      if (current !== null && current !== undefined && String(current) === id) chip.classList.add("current");
      chip.dataset.action = "toggle-room";
      chip.dataset.roomId = id;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = ROOM_COLORS[index % ROOM_COLORS.length];
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(`${room.name || id}${inPlan.has(id) && !completed.has(id) ? " *" : ""}`));
      this._els.rooms.appendChild(chip);
    });
  }

  _cleaningModeLabel(value) {
    const labels = {
      Vacuum: "Solo aspirar",
      Mop: "Solo fregar",
      "Vacuum + Mop": "Aspirar + fregar",
    };
    return labels[value] || value;
  }

  _updateSettings(attrs) {
    const caps = attrs.cleaning_profiles || {};
    const modes = Array.isArray(caps.cleaning_modes) && caps.cleaning_modes.length
      ? caps.cleaning_modes
      : ["Vacuum"];
    const suctionLevels = Array.isArray(caps.suction_levels) ? caps.suction_levels : [];
    const waterLevels = Array.isArray(caps.water_levels) ? caps.water_levels : [];

    if (!modes.includes(this._settings.mode)) {
      this._settings.mode = modes.includes(caps.preferred_cleaning_mode)
        ? caps.preferred_cleaning_mode
        : modes[0];
    }
    if (suctionLevels.length && !suctionLevels.includes(this._settings.suctionLevel)) {
      this._settings.suctionLevel = suctionLevels.includes(caps.preferred_suction_level)
        ? caps.preferred_suction_level
        : suctionLevels[0];
    }
    if (waterLevels.length && !waterLevels.includes(this._settings.waterLevel)) {
      this._settings.waterLevel = waterLevels.includes(caps.preferred_water_level)
        ? caps.preferred_water_level
        : waterLevels[0];
    }
    if (![1, 2].includes(Number(this._settings.passes))) this._settings.passes = 1;

    const mode = this._settings.mode || "Vacuum";
    const supportsMopping = Boolean(caps.supports_mopping);
    const waterEnabled = supportsMopping && mode !== "Vacuum";
    const suctionEnabled = mode !== "Mop";
    const key = JSON.stringify({
      mode,
      suction: this._settings.suctionLevel,
      water: this._settings.waterLevel,
      passes: this._settings.passes,
      modes,
      suctionLevels,
      waterLevels,
      supportsMopping,
    });
    if (this._keys.settings === key) return;
    this._keys.settings = key;

    const modeOptions = modes.map((value) => {
      const selected = value === mode ? " selected" : "";
      return `<option value="${this._escapeAttr(value)}"${selected}>${this._escapeHtml(this._cleaningModeLabel(value))}</option>`;
    }).join("");
    const suctionOptions = suctionLevels.map((value) => {
      const selected = String(this._settings.suctionLevel) === value ? " selected" : "";
      return `<option value="${this._escapeAttr(value)}"${selected}>${this._escapeHtml(value)}</option>`;
    }).join("");
    const waterOptions = waterLevels.map((value) => {
      const selected = String(this._settings.waterLevel) === value ? " selected" : "";
      return `<option value="${this._escapeAttr(value)}"${selected}>${this._escapeHtml(value)}</option>`;
    }).join("");
    const suctionControl = suctionLevels.length
      ? `<label>Succión <select data-role="setting-suction"${suctionEnabled ? "" : " disabled"}>${suctionOptions}</select></label>`
      : "";
    const waterControl = supportsMopping
      ? `<label>Agua <select data-role="setting-water"${waterEnabled ? "" : " disabled"}>${waterOptions}</select></label>`
      : "";
    this._els.settings.innerHTML = `
      <div class="settings-head">Ajustes de limpieza</div>
      <div class="settings-row">
        <label>Modo <select data-role="setting-mode">${modeOptions}</select></label>
        ${suctionControl}
        ${waterControl}
        <label>Pasadas
          <select data-role="setting-passes">
            <option value="1"${Number(this._settings.passes) === 1 ? " selected" : ""}>1</option>
            <option value="2"${Number(this._settings.passes) === 2 ? " selected" : ""}>2</option>
          </select>
        </label>
      </div>
    `;
  }

  _updateRoutines(attrs) {
    const routines = attrs.map_routines || {};
    const names = Object.keys(routines).sort((a, b) => a.localeCompare(b));
    const key = `${names.join("|")}:${this._selectedRoutine}`;
    if (this._keys.routines === key) return;
    this._keys.routines = key;
    const select = this._els.routineSelect;
    select.innerHTML = `<option value="">Rutinas guardadas</option>` + names.map((name) => (
      `<option value="${this._escapeAttr(name)}"${name === this._selectedRoutine ? " selected" : ""}>${this._escapeHtml(name)}</option>`
    )).join("");
  }

  _updateActions(attrs) {
    const plan = attrs.active_plan;
    const vacuum = String(attrs.debug_vacuum_state || "").toLowerCase();
    const mission = plan && plan.status ? String(plan.status) : "";
    const active = ["starting", "cleaning", "paused", "returning"].includes(mission) ||
      ["cleaning", "paused", "returning"].includes(vacuum);
    const paused = mission === "paused" || vacuum === "paused";
    const key = `${active}:${paused}:${this._busy}:${this._mode}:${this._selected.size}:${attrs.current_room_id || ""}`;
    if (this._keys.actions === key) return;
    this._keys.actions = key;
    const roomCount = this._startRoomIds(attrs).length;
    if (!active) {
      const label = this._mode === "all"
        ? "Limpiar toda la casa"
        : this._mode === "exclude"
          ? `Limpiar ${roomCount} habitación(es)`
          : `Limpiar ${roomCount} seleccionada(s)`;
      this._els.actions.innerHTML = `
        <button class="primary" data-action="start"${this._busy || !roomCount ? " disabled" : ""}>${label}</button>
        <button data-action="dock"${this._busy ? " disabled" : ""}>Volver a base</button>
      `;
      return;
    }
    this._els.actions.innerHTML = `
      ${paused
        ? `<button class="primary" data-action="resume"${this._busy ? " disabled" : ""}>Reanudar</button>`
        : `<button data-action="pause"${this._busy ? " disabled" : ""}>Pausar</button>`}
      <button data-action="skip"${this._busy || !attrs.current_room_id ? " disabled" : ""}>Saltar habitación</button>
      <button class="danger" data-action="stop"${this._busy ? " disabled" : ""}>Terminar</button>
      <button data-action="dock"${this._busy ? " disabled" : ""}>Volver a base</button>
    `;
  }

  _updateProgress(attrs) {
    const plan = attrs.active_plan;
    // Only show progress for a plan that is actually running. A finished (or
    // otherwise inactive) plan may linger in the attributes, but there is no
    // cleaning in progress, so it must not be rendered.
    const activeStatuses = ["starting", "cleaning", "paused", "returning"];
    const isActive =
      plan &&
      Array.isArray(plan.rooms) &&
      plan.rooms.length &&
      activeStatuses.includes(String(plan.status || ""));
    if (!isActive) {
      if (this._keys.progress !== "hidden") {
        this._keys.progress = "hidden";
        this._els.progress.innerHTML = "";
      }
      return;
    }
    const done = (plan.completed_room_ids || []).length;
    const total = plan.rooms.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const remaining = (plan.remaining_room_ids || []).length;
    const current = plan.current_room_name ? `Actual: ${plan.current_room_name}` : "Entre habitaciones";
    const key = `${done}:${total}:${remaining}:${current}:${plan.status}`;
    if (this._keys.progress === key) return;
    this._keys.progress = key;
    this._els.progress.innerHTML = `
      <div><span>${this._escapeHtml(current)}</span> - ${done}/${total} completadas, ${remaining} restantes</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
    `;
  }

  _startRoomIds(attrs) {
    const geo = Array.isArray(attrs.room_geometry) ? attrs.room_geometry : [];
    const ids = geo.map((room) => String(room.id));
    if (this._mode === "all") return ids;
    if (this._mode === "exclude") {
      return ids.filter((id) => !this._selected.has(id));
    }
    return ids.filter((id) => this._selected.has(id));
  }

  async _onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "toggle-room") {
      event.stopPropagation();
      this._toggleRoom(String(target.dataset.roomId));
      return;
    }
    if (action === "mode") {
      this._setMode(target.dataset.mode);
      return;
    }
    if (action === "routine-apply") {
      this._applyRoutine();
      return;
    }
    if (action === "routine-start") {
      this._applyRoutine();
      await this._start();
      return;
    }
    if (action === "routine-save") {
      await this._saveRoutine();
      return;
    }
    if (action === "routine-delete") {
      await this._deleteRoutine();
      return;
    }
    if (action === "start") {
      await this._start();
      return;
    }
    if (["pause", "resume", "stop", "dock", "skip"].includes(action)) {
      await this._mission(action);
    }
  }

  _onChange(event) {
    const target = event.target;
    if (target === this._els.routineSelect) {
      this._selectedRoutine = target.value;
      this._saveLocalState();
      if (this._selectedRoutine) this._applyRoutine(true);
      else this._update();
      return;
    }
    const role = target.dataset.role || "";
    if (!role.startsWith("setting-")) return;
    if (role === "setting-mode") this._settings.mode = target.value;
    else if (role === "setting-suction") this._settings.suctionLevel = target.value;
    else if (role === "setting-water") this._settings.waterLevel = target.value;
    else if (role === "setting-passes") this._settings.passes = Number(target.value);
    this._saveLocalState();
    this._keys.settings = null;
    this._update();
  }

  _toggleRoom(id) {
    if (this._mode === "all") {
      this._mode = "select";
      this._selected = new Set([id]);
    } else if (this._selected.has(id)) {
      this._selected.delete(id);
    } else {
      this._selected.add(id);
    }
    this._saveLocalState();
    this._keys = {};
    this._update();
  }

  _setMode(mode) {
    if (!["all", "select", "exclude"].includes(mode)) return;
    this._mode = mode;
    this._saveLocalState();
    this._keys = {};
    this._update();
  }

  _applyRoutine(silent = false) {
    const name = this._selectedRoutine;
    const state = this._entityState();
    if (!name || !state) return;
    const routines = state.attributes.map_routines || {};
    const routine = routines[name];
    const config = routine && routine.config;
    if (!config) {
      this._setNotice("Rutina no encontrada", true);
      return;
    }
    this._mode = ["all", "select", "exclude"].includes(config.mode) ? config.mode : "select";
    this._selected = new Set((config.rooms || []).map(String));
    if (config.settings && typeof config.settings === "object") {
      this._settings = { ...config.settings };
    } else if (config.profiles && typeof config.profiles === "object") {
      const legacy = Object.values(config.profiles).find((value) => value && typeof value === "object");
      this._settings = legacy ? { ...legacy } : {};
    }
    this._saveLocalState();
    this._keys = {};
    this._update();
    if (!silent) this._setNotice(`Rutina aplicada: ${name}`);
  }

  async _saveRoutine() {
    const suggested = this._selectedRoutine || "";
    const name = window.prompt("Nombre de la rutina", suggested);
    if (!name) return;
    const config = {
      mode: this._mode,
      rooms: [...this._selected],
      settings: this._settings,
    };
    await this._callService("save_routine", { name, config });
    this._selectedRoutine = name;
    this._saveLocalState();
    this._keys.routines = null;
    this._update();
  }

  async _deleteRoutine() {
    const name = this._selectedRoutine;
    if (!name) {
      this._setNotice("Selecciona una rutina para borrar", true);
      return;
    }
    if (!window.confirm(`Borrar la rutina "${name}"?`)) return;
    await this._callService("delete_routine", { name });
    this._selectedRoutine = "";
    this._saveLocalState();
    this._keys.routines = null;
    this._update();
  }

  async _start() {
    const state = this._entityState();
    if (!state) return;
    const attrs = state.attributes || {};
    const ids = this._startRoomIds(attrs);
    if (!ids.length) {
      this._setNotice("No hay habitaciones para limpiar", true);
      return;
    }
    const rooms = ids.map((id) => String(id));
    await this._callService("clean_rooms", { rooms, settings: this._settings });
  }

  async _mission(command) {
    const data = { command };
    await this._callService("mission_command", data);
  }

  async _callService(service, data) {
    if (!this._hass) return;
    this._busy = true;
    this._keys.actions = null;
    this._updateActions(this._entityState() ? this._entityState().attributes : {});
    try {
      const payload = { ...data };
      const state = this._entityState();
      const entryId = this._config.entry_id || (state && state.attributes && state.attributes.entry_id);
      if (entryId) payload.entry_id = entryId;
      await this._hass.callService(ROOMBA_DOMAIN, service, payload);
      this._setNotice("");
    } catch (err) {
      this._setNotice(err && err.message ? err.message : String(err), true);
    } finally {
      this._busy = false;
      this._keys.actions = null;
      this._update();
    }
  }

  _escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _escapeAttr(value) {
    return this._escapeHtml(value);
  }
}

class RoombaV4MapCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
  }

  connectedCallback() {
    this.innerHTML = `<div style="padding:8px;color:var(--secondary-text-color)">Configura la tarjeta en YAML con la entidad de cámara del mapa.</div>`;
  }
}

if (!customElements.get(ROOMBA_CARD_TYPE)) {
  customElements.define(ROOMBA_CARD_TYPE, RoombaV4MapCard);
}
if (!customElements.get(`${ROOMBA_CARD_TYPE}-editor`)) {
  customElements.define(`${ROOMBA_CARD_TYPE}-editor`, RoombaV4MapCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === ROOMBA_CARD_TYPE)) {
  window.customCards.push({
    type: ROOMBA_CARD_TYPE,
    name: "Roomba v4 Map",
    description: "Interactive iRobot map with room selection, routines and live mission progress.",
    preview: false,
  });
  console.info(
    `%c ROOMBA-V4-MAP-CARD %c ${ROOMBA_CARD_VERSION} `,
    "color:white;background:#4e79a7;font-weight:700",
    "color:#4e79a7;background:white;font-weight:700",
  );
}
