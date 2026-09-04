/**
 * Shell Tactical System
 * - Shell Codex (Database & QR Labels)
 * - Mech Hangar & Character Sheet (Tabletop Combat Companion)
 * - In-Browser Camera & Manual QR Part Scanner
 */
(function () {
  // Master database loaded from JSON
  let shellsData = [];
  let currentCategory = "All";
  let searchQuery = "";
  let currentMode = "codex"; // 'codex' | 'hangar'

  // Mechs Roster State (Persisted in localStorage)
  let mechs = [];
  let activeMechId = null;

  // Camera QR Scanner instance
  let html5QrCodeScanner = null;
  let activeTargetSlot = "auto";

  // DOM Elements
  const el = {
    // Mode Switcher
    navCodexBtn: document.getElementById("nav-codex-btn"),
    navHangarBtn: document.getElementById("nav-hangar-btn"),
    navMechCount: document.getElementById("nav-mech-count"),
    codexSection: document.getElementById("codex-section"),
    hangarSection: document.getElementById("hangar-section"),

    // Codex View
    catalogView: document.getElementById("catalog-view"),
    detailView: document.getElementById("detail-view"),
    shellsGrid: document.getElementById("shells-grid"),
    detailContent: document.getElementById("detail-content"),
    quickEquipContainer: document.getElementById("quick-equip-container"),
    backBtn: document.getElementById("back-btn"),
    tabBtns: document.querySelectorAll(".tab-btn"),
    searchInput: document.getElementById("search-input"),

    // Hangar View
    rosterTabs: document.getElementById("roster-tabs"),
    addMechBtn: document.getElementById("add-mech-btn"),
    deployFirstMechBtn: document.getElementById("deploy-first-mech-btn"),
    emptyHangarView: document.getElementById("empty-hangar-view"),
    activeMechSheet: document.getElementById("active-mech-sheet"),
    mechNameInput: document.getElementById("mech-name-input"),
    deleteMechBtn: document.getElementById("delete-mech-btn"),
    openCameraScannerBtn: document.getElementById("open-camera-scanner-btn"),
    manualIdInput: document.getElementById("manual-id-input"),
    manualEquipBtn: document.getElementById("manual-equip-btn"),

    // Combat HUD
    hudHpCurrent: document.getElementById("hud-hp-current"),
    hudHpMax: document.getElementById("hud-hp-max"),
    hudHpBar: document.getElementById("hud-hp-bar"),
    hudEnergyCurrent: document.getElementById("hud-energy-current"),
    hudEnergyMax: document.getElementById("hud-energy-max"),
    hudEnergyBar: document.getElementById("hud-energy-bar"),
    mechSpecsMatrix: document.getElementById("mech-specs-matrix"),
    mechAbilitiesDeck: document.getElementById("mech-abilities-deck"),

    // Slots
    slotBody: document.getElementById("slot-body-content"),
    slotArmLeft: document.getElementById("slot-armLeft-content"),
    slotArmRight: document.getElementById("slot-armRight-content"),
    slotLowers: document.getElementById("slot-lowers-content"),
    slotSupport: document.getElementById("slot-support-content"),

    // Scanner Modal
    scannerModal: document.getElementById("scanner-modal"),
    closeScannerBtn: document.getElementById("close-scanner-btn"),
    scannerTargetSlot: document.getElementById("scanner-target-slot"),
    scanFeedback: document.getElementById("scan-feedback"),

    // Toast
    toast: document.getElementById("toast"),
  };

  // =========================================================
  // INITIALIZATION & PERSISTENCE
  // =========================================================
  async function init() {
    try {
      const res = await fetch("data/shells.json");
      if (!res.ok) throw new Error("Could not load shells database.");
      shellsData = await res.json();

      loadMechsFromStorage();
      setupEventListeners();
      route();
      updateMechCountBadge();
    } catch (err) {
      console.error(err);
      if (el.shellsGrid) {
        el.shellsGrid.innerHTML = `
          <div class="empty-state">
            <p>Failed to load shells database.</p>
            <small style="color: #ef4444;">${err.message}</small>
          </div>
        `;
      }
    }
  }

  function loadMechsFromStorage() {
    try {
      const stored = localStorage.getItem("shell_tactical_mechs");
      if (stored) {
        mechs = JSON.parse(stored);
      } else {
        // Fresh start: no mechs initially
        mechs = [];
      }
    } catch (e) {
      console.warn("Could not parse stored mechs, initializing empty.");
      mechs = [];
    }

    const storedActiveId = localStorage.getItem("shell_tactical_active_mech");
    if (storedActiveId && mechs.some((m) => m.id === storedActiveId)) {
      activeMechId = storedActiveId;
    } else if (mechs.length > 0) {
      activeMechId = mechs[0].id;
    } else {
      activeMechId = null;
    }
  }

  function saveMechs() {
    localStorage.setItem("shell_tactical_mechs", JSON.stringify(mechs));
    if (activeMechId) {
      localStorage.setItem("shell_tactical_active_mech", activeMechId);
    } else {
      localStorage.removeItem("shell_tactical_active_mech");
    }
    updateMechCountBadge();
  }

  function createNewMech(name) {
    const num = mechs.length + 1;
    const newMech = {
      id: "mech-" + Date.now(),
      name: name || `Unit-0${num}: Frame`,
      slots: {
        body: null,
        armLeft: null,
        armRight: null,
        lowers: null,
        support: null,
      },
      currentHp: 0,
      currentEnergy: 0,
    };
    mechs.push(newMech);
    activeMechId = newMech.id;
    saveMechs();
    return newMech;
  }

  function getActiveMech() {
    if (!mechs || mechs.length === 0) return null;
    return mechs.find((m) => m.id === activeMechId) || mechs[0] || null;
  }

  function updateMechCountBadge() {
    if (el.navMechCount) {
      el.navMechCount.textContent = mechs ? mechs.length : 0;
    }
  }

  // =========================================================
  // ROUTING & NAVIGATION
  // =========================================================
  function route() {
    const params = new URLSearchParams(window.location.search);
    let shellId = params.get("id");

    if (!shellId && window.location.hash) {
      shellId = window.location.hash.replace("#", "").replace("/", "");
    }

    if (shellId) {
      // If a QR code is scanned externally, default to Codex detail view
      setMode("codex");
      const normalizedTarget = shellId.trim().toLowerCase();
      const shell = shellsData.find((s) => s.id.toLowerCase() === normalizedTarget);
      if (shell) {
        showDetail(shell);
      } else {
        showNotFound(shellId);
      }
    } else {
      if (currentMode === "codex") {
        showCatalog();
      } else {
        renderHangar();
      }
    }
  }

  function setMode(mode) {
    currentMode = mode;
    if (mode === "codex") {
      el.codexSection.style.display = "block";
      el.hangarSection.style.display = "none";
      el.navCodexBtn.classList.add("active");
      el.navHangarBtn.classList.remove("active");
    } else {
      el.codexSection.style.display = "none";
      el.hangarSection.style.display = "block";
      el.navHangarBtn.classList.add("active");
      el.navCodexBtn.classList.remove("active");
      renderHangar();
    }
  }

  function setupEventListeners() {
    // Mode Switcher Tabs
    el.navCodexBtn.addEventListener("click", () => setMode("codex"));
    el.navHangarBtn.addEventListener("click", () => setMode("hangar"));

    // Browser back/forward
    window.addEventListener("popstate", route);

    // Codex Back to Catalog Button
    el.backBtn.addEventListener("click", () => {
      const cleanUrl = window.location.pathname;
      window.history.pushState({}, "", cleanUrl);
      showCatalog();
    });

    // Category Tabs
    el.tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentCategory = btn.getAttribute("data-cat");
        renderCatalog();
      });
    });

    // Search Bar
    el.searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderCatalog();
    });

    // Hangar: Add Mech
    const handleAddMech = () => {
      const newMech = createNewMech();
      renderHangar();
      showToast(`Deployed ${newMech.name}`);
    };

    el.addMechBtn.addEventListener("click", handleAddMech);
    if (el.deployFirstMechBtn) {
      el.deployFirstMechBtn.addEventListener("click", handleAddMech);
    }

    // Hangar: Rename Mech
    el.mechNameInput.addEventListener("change", (e) => {
      const activeMech = getActiveMech();
      if (activeMech) {
        activeMech.name = e.target.value.trim() || "Unit Unnamed";
        saveMechs();
        renderRosterTabs();
        showToast("Mech renamed");
      }
    });

    // Hangar: Delete Mech (Allows scraping down to 0 mechs)
    el.deleteMechBtn.addEventListener("click", () => {
      const activeMech = getActiveMech();
      if (!activeMech) return;

      if (confirm(`Scrap ${activeMech.name}? This will remove it from your hangar.`)) {
        mechs = mechs.filter((m) => m.id !== activeMech.id);
        activeMechId = mechs.length > 0 ? mechs[0].id : null;
        saveMechs();
        renderHangar();
        showToast("Mech scrapped");
      }
    });

    // Hangar: Manual ID input & equip
    el.manualEquipBtn.addEventListener("click", () => {
      const code = el.manualIdInput.value.trim();
      if (code) {
        equipById(code);
        el.manualIdInput.value = "";
      }
    });

    el.manualIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.manualEquipBtn.click();
      }
    });

    // Hangar: Camera Scanner Modal
    el.openCameraScannerBtn.addEventListener("click", () => {
      openCameraScanner();
    });

    el.closeScannerBtn.addEventListener("click", () => {
      closeCameraScanner();
    });

    // Tabletop Tracker Stepper Buttons (+/- HP & Energy)
    document.querySelectorAll(".step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = btn.getAttribute("data-res");
        const val = parseInt(btn.getAttribute("data-val"), 10);
        adjustResource(res, val);
      });
    });

    // Tabletop Tracker Reset / Full Repair
    document.querySelectorAll(".reset-res-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = btn.getAttribute("data-res");
        resetResource(res);
      });
    });
  }

  // =========================================================
  // CODEX VIEW LOGIC
  // =========================================================
  function showCatalog() {
    el.detailView.classList.remove("active");
    el.catalogView.style.display = "block";
    renderCatalog();
  }

  function renderCatalog() {
    const filtered = shellsData.filter((shell) => {
      const matchesCategory =
        currentCategory === "All" || shell.category === currentCategory;

      if (!matchesCategory) return false;
      if (!searchQuery) return true;

      const inId = shell.id.toLowerCase().includes(searchQuery);
      const inName = shell.name.toLowerCase().includes(searchQuery);
      const inSubtype = (shell.subtype || "").toLowerCase().includes(searchQuery);
      const inTags = (shell.tags || []).some((t) =>
        t.toLowerCase().includes(searchQuery)
      );
      const inAbilities = (shell.abilities || []).some(
        (a) =>
          a.name.toLowerCase().includes(searchQuery) ||
          a.description.toLowerCase().includes(searchQuery)
      );

      return inId || inName || inSubtype || inTags || inAbilities;
    });

    if (filtered.length === 0) {
      el.shellsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>No shells found matching your criteria.</p>
        </div>
      `;
      return;
    }

    el.shellsGrid.innerHTML = filtered
      .map((shell) => {
        const catClass = `badge-${shell.category.toLowerCase()}`;
        const statsPreview = Object.entries(shell.stats || {})
          .slice(0, 4)
          .map(
            ([k, v]) => `
            <div class="stat-item">
              <span class="stat-label">${k}</span>
              <span class="stat-value">${v}</span>
            </div>`
          )
          .join("");

        const tagsHtml = (shell.tags || [])
          .map((t) => `<span class="tag-pill">#${t}</span>`)
          .join("");

        return `
          <div class="shell-card" data-id="${shell.id}" data-cat="${shell.category}">
            <div class="card-header">
              <span class="badge ${catClass}">${shell.category}</span>
              <span class="card-id-tag">[${shell.id}]</span>
            </div>
            <h3 class="card-title">${shell.name}</h3>
            <div class="card-subtype">${shell.subtype || ""}</div>
            <div class="card-stats-preview">
              ${statsPreview}
            </div>
            <div class="card-tags">
              ${tagsHtml}
            </div>
          </div>
        `;
      })
      .join("");

    el.shellsGrid.querySelectorAll(".shell-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        const shell = shellsData.find((s) => s.id === id);
        if (shell) {
          const newUrl = `${window.location.pathname}?id=${encodeURIComponent(shell.id)}`;
          window.history.pushState({ id: shell.id }, "", newUrl);
          showDetail(shell);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  }

  function showDetail(shell) {
    el.catalogView.style.display = "none";
    el.detailView.classList.add("active");

    const catClass = `badge-${shell.category.toLowerCase()}`;
    const activeMech = getActiveMech();

    // Quick Equip Button on the Detail Page
    let equipButtonHtml = "";
    if (!activeMech) {
      equipButtonHtml = `
        <button class="quick-equip-btn" id="deploy-with-part-btn">
          ⚡ Deploy New Mech with this Part
        </button>
      `;
    } else if (shell.category === "Arms") {
      equipButtonHtml = `
        <button class="quick-equip-btn" id="equip-left-btn">⚡ Equip Left Arm to ${activeMech.name}</button>
        <button class="quick-equip-btn" id="equip-right-btn" style="margin-left: 0.4rem;">⚡ Equip Right Arm</button>
      `;
    } else {
      equipButtonHtml = `
        <button class="quick-equip-btn" id="equip-single-btn">
          ⚡ Equip to ${activeMech.name}
        </button>
      `;
    }
    el.quickEquipContainer.innerHTML = equipButtonHtml;

    // Attach listeners for Quick Equip
    if (!activeMech) {
      const deployBtn = document.getElementById("deploy-with-part-btn");
      if (deployBtn) {
        deployBtn.addEventListener("click", () => {
          const slotMap = { Bodies: "body", Arms: "armLeft", Lowers: "lowers", Support: "support" };
          equipById(shell.id, slotMap[shell.category]);
          setMode("hangar");
        });
      }
    } else if (shell.category === "Arms") {
      const leftBtn = document.getElementById("equip-left-btn");
      const rightBtn = document.getElementById("equip-right-btn");
      if (leftBtn) {
        leftBtn.addEventListener("click", () => {
          equipPartToActiveMech(shell.id, "armLeft");
          setMode("hangar");
        });
      }
      if (rightBtn) {
        rightBtn.addEventListener("click", () => {
          equipPartToActiveMech(shell.id, "armRight");
          setMode("hangar");
        });
      }
    } else {
      const singleBtn = document.getElementById("equip-single-btn");
      if (singleBtn) {
        singleBtn.addEventListener("click", () => {
          const slotMap = { Bodies: "body", Lowers: "lowers", Support: "support" };
          equipPartToActiveMech(shell.id, slotMap[shell.category]);
          setMode("hangar");
        });
      }
    }

    // Stats Matrix
    const statsHtml = Object.entries(shell.stats || {})
      .map(
        ([key, val]) => `
        <div class="stat-box">
          <div class="stat-box-label">${key}</div>
          <div class="stat-box-val">${val}</div>
        </div>`
      )
      .join("");

    // Abilities
    const abilitiesHtml = (shell.abilities || [])
      .map(
        (ab) => `
        <div class="ability-card">
          <div class="ability-header">
            <span class="ability-name">${ab.name}</span>
            <span class="ability-cost">${ab.type ? `[${ab.type}] ` : ""}${ab.cost}</span>
          </div>
          <p class="ability-desc">${ab.description}</p>
        </div>`
      )
      .join("");

    // Full target URL for the QR code
    const targetUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(shell.id)}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;

    el.detailContent.innerHTML = `
      <div class="detail-card" data-cat="${shell.category}">
        <div class="detail-meta-row">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge ${catClass}">${shell.category}</span>
            <span class="id-badge">${shell.id}</span>
          </div>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">
            ${shell.rarity || ""}
          </span>
        </div>

        <h2 class="detail-title">${shell.name}</h2>
        <div class="detail-subtype">${shell.subtype || ""}</div>

        ${shell.flavorText ? `<div class="flavor-quote">"${shell.flavorText}"</div>` : ""}

        <div class="section-title">Core Specifications</div>
        <div class="stats-matrix">
          ${statsHtml}
        </div>

        <div class="section-title">Abilities & Spells</div>
        <div class="abilities-list">
          ${abilitiesHtml}
        </div>

        <!-- QR Code Physical Deployment Tool -->
        <div class="qr-container">
          <div class="qr-box">
            <img src="${qrApiUrl}" alt="QR code for ${shell.id} (${shell.name})" loading="lazy" />
          </div>
          <div class="qr-info">
            <h4>QR Sticker Label: <code>${shell.id}</code></h4>
            <p>Scan with a smartphone to route directly to this shell profile, or copy the direct URL below for your physical toy sticker label.</p>
            <div class="qr-link-copy">
              <button class="copy-btn" id="copy-qr-url" data-url="${targetUrl}">
                Copy Direct URL (?id=${shell.id})
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const copyBtn = document.getElementById("copy-qr-url");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const url = copyBtn.getAttribute("data-url");
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = "Copied to Clipboard!";
          setTimeout(() => {
            copyBtn.textContent = `Copy Direct URL (?id=${shell.id})`;
          }, 2000);
        });
      });
    }
  }

  function showNotFound(id) {
    el.catalogView.style.display = "none";
    el.detailView.classList.add("active");
    el.quickEquipContainer.innerHTML = "";
    el.detailContent.innerHTML = `
      <div class="detail-card" style="text-align: center; padding: 3rem 1.5rem;">
        <h2 style="color: #f87171; margin-bottom: 0.5rem;">Part Not Found</h2>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">No shell registered with Part ID: <code>${id}</code></p>
        <button class="copy-btn" onclick="document.getElementById('back-btn').click()">
          Return to Shell Archive
        </button>
      </div>
    `;
  }

  // =========================================================
  // MECH HANGAR & CHARACTER SHEET LOGIC
  // =========================================================
  function renderHangar() {
    if (!mechs || mechs.length === 0) {
      el.rosterTabs.innerHTML = `
        <span style="color: var(--text-muted); font-size: 0.85rem; padding: 0.45rem 0.25rem;">
          Hangar Empty (0 Mechs)
        </span>
      `;
      if (el.emptyHangarView) el.emptyHangarView.style.display = "block";
      if (el.activeMechSheet) el.activeMechSheet.style.display = "none";
      return;
    }

    if (el.emptyHangarView) el.emptyHangarView.style.display = "none";
    if (el.activeMechSheet) el.activeMechSheet.style.display = "block";
    renderRosterTabs();
    renderActiveMechSheet();
  }

  function renderRosterTabs() {
    el.rosterTabs.innerHTML = mechs
      .map((m) => {
        const isActive = m.id === activeMechId ? "active" : "";
        return `
          <button class="roster-tab ${isActive}" data-mech-id="${m.id}">
            🛡️ ${m.name}
          </button>
        `;
      })
      .join("");

    el.rosterTabs.querySelectorAll(".roster-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeMechId = tab.getAttribute("data-mech-id");
        saveMechs();
        renderHangar();
      });
    });
  }

  function renderActiveMechSheet() {
    const mech = getActiveMech();
    if (!mech) return;

    el.mechNameInput.value = mech.name;

    // Render Slots
    renderSlot("body", mech.slots.body, el.slotBody, "Bodies");
    renderSlot("armLeft", mech.slots.armLeft, el.slotArmLeft, "Arms");
    renderSlot("armRight", mech.slots.armRight, el.slotArmRight, "Arms");
    renderSlot("lowers", mech.slots.lowers, el.slotLowers, "Lowers");
    renderSlot("support", mech.slots.support, el.slotSupport, "Support");

    // Calculate Aggregated Specs
    const specs = calculateMechSpecs(mech);

    // Update HP & Energy Bars
    updateCombatHud(mech, specs);

    // Render Specs Matrix
    renderSpecsMatrix(specs);

    // Render Combined Abilities Deck
    renderAbilitiesDeck(mech);
  }

  function renderSlot(slotKey, partId, container, category) {
    if (!partId) {
      container.innerHTML = `
        <div class="slot-empty" data-slot="${slotKey}" data-cat="${category}">
          + Empty Slot<br>
          <small style="color: var(--text-muted);">Scan QR or click to select ${category}</small>
        </div>
      `;

      container.querySelector(".slot-empty").addEventListener("click", () => {
        promptSelectPartForSlot(slotKey, category);
      });
      return;
    }

    const part = shellsData.find((s) => s.id === partId);
    if (!part) {
      container.innerHTML = `
        <div class="slot-empty" style="border-color: #ef4444; color: #ef4444;">
          Invalid Part ID: [${partId}]
          <button class="slot-unequip-btn" data-slot="${slotKey}">✕ Remove</button>
        </div>
      `;
      container.querySelector(".slot-unequip-btn").addEventListener("click", () => {
        unequipSlot(slotKey);
      });
      return;
    }

    const statsPills = Object.entries(part.stats || {})
      .slice(0, 3)
      .map(([k, v]) => `<span class="slot-stat-pill">${k}: <b>${v}</b></span>`)
      .join("");

    container.innerHTML = `
      <div class="slot-filled">
        <div class="slot-part-header">
          <span class="slot-part-name">${part.name}</span>
          <span class="slot-part-id">[${part.id}]</span>
        </div>
        <div class="slot-part-subtype">${part.subtype || ""}</div>
        <div class="slot-stats-mini">${statsPills}</div>
        <div class="slot-actions">
          <button class="slot-unequip-btn" data-slot="${slotKey}">✕ Unequip</button>
        </div>
      </div>
    `;

    container.querySelector(".slot-unequip-btn").addEventListener("click", () => {
      unequipSlot(slotKey);
    });
  }

  function unequipSlot(slotKey) {
    const mech = getActiveMech();
    if (mech && mech.slots[slotKey]) {
      const partId = mech.slots[slotKey];
      mech.slots[slotKey] = null;
      saveMechs();
      renderHangar();
      showToast(`Unequipped [${partId}]`);
    }
  }

  function promptSelectPartForSlot(slotKey, category) {
    const available = shellsData.filter((s) => s.category === category);
    if (available.length === 0) {
      alert(`No parts found for category: ${category}`);
      return;
    }

    const promptText = available
      .map((p, idx) => `${idx + 1}. [${p.id}] ${p.name}`)
      .join("\n");

    const choice = prompt(
      `Select a part for ${slotKey} (Enter Number 1-${available.length} or Part ID): \n\n${promptText}`
    );

    if (!choice) return;

    let selectedPart = null;
    const num = parseInt(choice, 10);
    if (!isNaN(num) && num >= 1 && num <= available.length) {
      selectedPart = available[num - 1];
    } else {
      selectedPart = available.find(
        (p) => p.id.toLowerCase() === choice.trim().toLowerCase()
      );
    }

    if (selectedPart) {
      equipPartToActiveMech(selectedPart.id, slotKey);
    } else {
      showToast("Invalid selection");
    }
  }

  // =========================================================
  // STATS & COMBAT HUD CALCULATIONS
  // =========================================================
  function calculateMechSpecs(mech) {
    const specs = {
      hp: 0,
      armor: 0,
      energy: 0,
      attack: 0,
      mobility: 0,
      shieldHp: 0,
    };

    Object.values(mech.slots).forEach((partId) => {
      if (!partId) return;
      const part = shellsData.find((s) => s.id === partId);
      if (!part || !part.stats) return;

      Object.entries(part.stats).forEach(([stat, val]) => {
        const key = stat.toLowerCase();
        if (key.includes("hp")) specs.hp += val;
        else if (key.includes("armor") || key.includes("def")) specs.armor += val;
        else if (key.includes("energy") || key.includes("mana")) specs.energy += val;
        else if (key.includes("attack") || key.includes("dmg")) specs.attack += val;
        else if (key.includes("mobility") || key.includes("speed")) specs.mobility += val;
        else if (key.includes("shield")) specs.shieldHp += val;
      });
    });

    return specs;
  }

  function updateCombatHud(mech, specs) {
    // If not set or if higher than max, handle cleanly
    if (mech.currentHp === undefined || mech.currentHp === null) {
      mech.currentHp = specs.hp;
    }
    if (mech.currentEnergy === undefined || mech.currentEnergy === null) {
      mech.currentEnergy = specs.energy;
    }

    // Keep within bounds
    mech.currentHp = Math.max(0, Math.min(mech.currentHp, specs.hp));
    mech.currentEnergy = Math.max(0, Math.min(mech.currentEnergy, specs.energy));

    el.hudHpCurrent.textContent = mech.currentHp;
    el.hudHpMax.textContent = specs.hp;
    const hpPct = specs.hp > 0 ? (mech.currentHp / specs.hp) * 100 : 0;
    el.hudHpBar.style.width = `${hpPct}%`;

    el.hudEnergyCurrent.textContent = mech.currentEnergy;
    el.hudEnergyMax.textContent = specs.energy;
    const energyPct = specs.energy > 0 ? (mech.currentEnergy / specs.energy) * 100 : 0;
    el.hudEnergyBar.style.width = `${energyPct}%`;
  }

  function adjustResource(type, delta) {
    const mech = getActiveMech();
    if (!mech) return;

    const specs = calculateMechSpecs(mech);
    if (type === "hp") {
      mech.currentHp = Math.max(0, Math.min(specs.hp, (mech.currentHp || 0) + delta));
    } else if (type === "energy") {
      mech.currentEnergy = Math.max(0, Math.min(specs.energy, (mech.currentEnergy || 0) + delta));
    }
    saveMechs();
    updateCombatHud(mech, specs);
  }

  function resetResource(type) {
    const mech = getActiveMech();
    if (!mech) return;

    const specs = calculateMechSpecs(mech);
    if (type === "hp") {
      mech.currentHp = specs.hp;
      showToast("HP fully restored");
    } else if (type === "energy") {
      mech.currentEnergy = specs.energy;
      showToast("Core Energy fully recharged");
    }
    saveMechs();
    updateCombatHud(mech, specs);
  }

  function renderSpecsMatrix(specs) {
    el.mechSpecsMatrix.innerHTML = `
      <div class="stat-box">
        <div class="stat-box-label">Integrity (HP)</div>
        <div class="stat-box-val" style="color: #34d399;">${specs.hp}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Armor Rating</div>
        <div class="stat-box-val" style="color: #38bdf8;">${specs.armor}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Energy Pool</div>
        <div class="stat-box-val" style="color: #60a5fa;">${specs.energy}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Attack Rating</div>
        <div class="stat-box-val" style="color: #f97316;">${specs.attack}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Mobility / Speed</div>
        <div class="stat-box-val" style="color: #10b981;">${specs.mobility}</div>
      </div>
      ${
        specs.shieldHp > 0
          ? `<div class="stat-box">
              <div class="stat-box-label">Shield HP</div>
              <div class="stat-box-val" style="color: #a855f7;">${specs.shieldHp}</div>
            </div>`
          : ""
      }
    `;
  }

  function renderAbilitiesDeck(mech) {
    const combinedAbilities = [];

    const slotLabels = {
      body: { label: "Body Frame", class: "badge-bodies" },
      armLeft: { label: "Left Arm", class: "badge-arms" },
      armRight: { label: "Right Arm", class: "badge-arms" },
      lowers: { label: "Lowers Base", class: "badge-lowers" },
      support: { label: "Support Unit", class: "badge-support" },
    };

    Object.entries(mech.slots).forEach(([slotKey, partId]) => {
      if (!partId) return;
      const part = shellsData.find((s) => s.id === partId);
      if (!part || !part.abilities) return;

      part.abilities.forEach((ab) => {
        combinedAbilities.push({
          ...ab,
          sourceSlot: slotLabels[slotKey].label,
          sourceClass: slotLabels[slotKey].class,
          partName: part.name,
        });
      });
    });

    if (combinedAbilities.length === 0) {
      el.mechAbilitiesDeck.innerHTML = `
        <div class="empty-state">
          <p>No active abilities. Equip parts to assemble your combat deck.</p>
        </div>
      `;
      return;
    }

    el.mechAbilitiesDeck.innerHTML = combinedAbilities
      .map(
        (ab) => `
        <div class="ability-card">
          <div class="ability-header">
            <div>
              <span class="badge ${ab.sourceClass} ability-origin">${ab.sourceSlot}</span>
              <span class="ability-name" style="margin-left: 0.5rem;">${ab.name}</span>
            </div>
            <span class="ability-cost">${ab.type ? `[${ab.type}] ` : ""}${ab.cost}</span>
          </div>
          <p class="ability-desc">${ab.description}</p>
        </div>
      `
      )
      .join("");
  }

  // =========================================================
  // EQUIPPING LOGIC (AUTO-DETECT & MANUAL)
  // =========================================================
  function equipById(code, targetSlot = "auto") {
    if (!code) return;
    const clean = code.trim().toLowerCase();
    const part = shellsData.find((s) => s.id.toLowerCase() === clean);

    if (!part) {
      showToast(`Part [${code}] not found in database!`);
      return;
    }

    let mech = getActiveMech();
    if (!mech) {
      mech = createNewMech();
      showToast(`Deployed ${mech.name} for part`);
    }

    let slot = targetSlot;

    if (slot === "auto" || !slot) {
      if (part.category === "Bodies") slot = "body";
      else if (part.category === "Lowers") slot = "lowers";
      else if (part.category === "Support") slot = "support";
      else if (part.category === "Arms") {
        // If left arm is empty, put in left; else if right arm empty, put in right; else replace left
        if (!mech.slots.armLeft) slot = "armLeft";
        else if (!mech.slots.armRight) slot = "armRight";
        else slot = "armLeft";
      }
    }

    equipPartToActiveMech(part.id, slot);
  }

  function equipPartToActiveMech(partId, slotKey) {
    let mech = getActiveMech();
    if (!mech) {
      mech = createNewMech();
    }

    mech.slots[slotKey] = partId;
    saveMechs();
    renderHangar();
    showToast(`Equipped [${partId}] to ${mech.name}!`);
  }

  // =========================================================
  // CAMERA SCANNER (HTML5-QRCODE)
  // =========================================================
  function openCameraScanner() {
    el.scannerModal.style.display = "flex";
    el.scanFeedback.textContent = "Requesting camera access...";
    el.scanFeedback.style.color = "var(--text-muted)";

    if (typeof Html5Qrcode === "undefined") {
      el.scanFeedback.textContent = "Camera QR library not loaded. Use manual ID entry.";
      el.scanFeedback.style.color = "#ef4444";
      return;
    }

    try {
      html5QrCodeScanner = new Html5Qrcode("qr-reader");
      const config = { fps: 10, qrbox: { width: 220, height: 220 } };

      html5QrCodeScanner
        .start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            handleScannedQrResult(decodedText);
          },
          (errorMessage) => {
            // scan failure per frame - normal while looking for QR code
          }
        )
        .then(() => {
          el.scanFeedback.textContent = "Aim at a Shell QR Code";
          el.scanFeedback.style.color = "#38bdf8";
        })
        .catch((err) => {
          console.error(err);
          el.scanFeedback.textContent = "Camera error: " + (err.message || "Permission denied");
          el.scanFeedback.style.color = "#ef4444";
        });
    } catch (err) {
      console.error(err);
      el.scanFeedback.textContent = "Scanner initialization failed.";
    }
  }

  function closeCameraScanner() {
    if (html5QrCodeScanner) {
      html5QrCodeScanner
        .stop()
        .then(() => {
          html5QrCodeScanner.clear();
          html5QrCodeScanner = null;
        })
        .catch((err) => console.warn(err));
    }
    el.scannerModal.style.display = "none";
  }

  function handleScannedQrResult(text) {
    // Extract ID from full URL (e.g. ?id=B01 or #B01) or raw string
    let extractedId = text.trim();
    try {
      if (extractedId.includes("?id=")) {
        const urlObj = new URL(extractedId);
        extractedId = urlObj.searchParams.get("id");
      } else if (extractedId.includes("#")) {
        extractedId = extractedId.split("#")[1];
      }
    } catch (e) {
      // not a URL, keep raw
    }

    const targetSlot = el.scannerTargetSlot.value;
    const part = shellsData.find(
      (s) => s.id.toLowerCase() === extractedId.toLowerCase()
    );

    if (part) {
      el.scanFeedback.innerHTML = `✅ Scanned [${part.id}]: ${part.name}!`;
      el.scanFeedback.style.color = "#34d399";

      equipById(part.id, targetSlot);

      // Close modal after brief success feedback
      setTimeout(() => {
        closeCameraScanner();
      }, 1200);
    } else {
      el.scanFeedback.innerHTML = `⚠️ Unrecognized Part Code: ${extractedId}`;
      el.scanFeedback.style.color = "#f87171";
    }
  }

  // =========================================================
  // TOAST NOTIFICATION
  // =========================================================
  let toastTimeout;
  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.toast.classList.remove("show");
    }, 2400);
  }

  // Start
  document.addEventListener("DOMContentLoaded", init);
})();
