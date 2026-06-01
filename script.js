/* import-games-script — frontend (v2.1)
 *
 * Talks to the Node backend on localhost:5174. Never touches Supabase
 * directly. Server credentials live in server/.env.
 *
 * Run: cd server && npm install && npm start
 * Open: http://localhost:5174/index.html
 */

const API = (() => {
  const sameOrigin = location.origin && !location.origin.startsWith("file");
  return sameOrigin ? "" : "http://localhost:5174";
})();

/* Canonical categories — mirror of web0.2's slugs. This is only a
 * fallback; the real list is fetched from GET /api/categories at boot so
 * the import UI can never drift from the site. {slug,label} pairs. */
let CATEGORIES = [
  { slug: "puzzles", label: "Puzzles" },
  { slug: "hypercasual", label: "Hypercasual" },
  { slug: "adventure", label: "Adventure" },
  { slug: "shooting", label: "Shooting" },
  { slug: "racing", label: "Racing" },
  { slug: "sports", label: "Sports" },
  { slug: "action", label: "Action" },
  { slug: "arcade", label: "Arcade" },
  { slug: "clicker", label: "Clicker" },
  { slug: "girls", label: "Girls" },
];
const DEFAULT_CATEGORY = "action";

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- DOM (every reference uses ?. so missing nodes can't crash boot) ---------- */
  const $ = (id) => document.getElementById(id);

  const providerSelect = $("provider");
  const mainCategorySelect = $("mainCategory"); /* legacy hidden select, may be absent */
  const mainCategoryContainer = $("mainCategoryContainer");
  const jsonFileInput = $("jsonFile");
  const importBtn = $("importBtn");
  const clearBtn = $("clearBtn");
  const progressBar = $("progressBar");
  const statusMessage = $("statusMessage");
  const resultsBody = $("resultsBody");
  const gamePreviewContainer = $("gamePreviewContainer");
  const gamesList = $("gamesList");
  const submitAllBtn = $("submitAllBtn");
  const confirmationModal = $("confirmationModal");
  const modalGameList = $("modalGameList");
  const confirmUploadBtn = $("confirmUploadBtn");
  const cancelUploadBtn = $("cancelUploadBtn");
  const closeModalBtn = document.querySelector(".close");

  const jsonModeRadio = $("jsonMode");
  const manualModeRadio = $("manualMode");
  const jsonImportForm = $("jsonImportForm");
  const manualEntryForm = $("manualEntryForm");
  const manualStoreBtn = $("manualStoreBtn");
  const manualPreviewBtn = $("manualPreviewBtn");
  const manualClearBtn = $("manualClearBtn");
  const manualMainCategorySelect = $("manual_main_category");

  const prevPageBtn = $("prevPageBtn");
  const nextPageBtn = $("nextPageBtn");
  const pageInfo = $("pageInfo");
  const pageSizeSelect = $("pageSize");
  const gamesCounter = $("gamesCounter");
  const prevPageBtnBottom = $("prevPageBtnBottom");
  const nextPageBtnBottom = $("nextPageBtnBottom");
  const pageInfoBottom = $("pageInfoBottom");

  const duplicateModal = $("duplicateModal");
  const duplicateGameList = $("duplicateGameList");
  const removeAllDuplicatesBtn = $("removeAllDuplicatesBtn");
  const removeSelectedDuplicatesBtn = $("removeSelectedDuplicatesBtn");
  const closeDuplicateModalBtn = $("closeDuplicateModalBtn");
  const closeDuplicateModalBtnTop = document.querySelector(".close-duplicate");
  const checkDuplicatesBtn = $("checkDuplicatesBtn");
  const selectAllDuplicatesCheckbox = $("selectAllDuplicates");
  const duplicateSelectionCount = $("duplicateSelectionCount");

  const serverStatusEl = $("serverStatus");
  const filterQualityInput = $("filterQuality");
  const filterRequireThumb = $("filterRequireThumb");
  const applyFiltersBtn = $("applyFiltersBtn");
  const downloadFailedBtn = $("downloadFailedBtn");

  /* ---------- state ---------- */
  let processedGames = [];
  let unfilteredGames = [];
  let currentPage = 1;
  let gamesPerPage = parseInt(pageSizeSelect?.value || "10");
  let activeImportId = null;
  let activeEventSource = null;
  let duplicatePairs = [];
  let selectedOverrideCategory = DEFAULT_CATEGORY;

  /* ---------- boot ---------- */
  loadCategories().then(populateCategorySelectors);
  pingServer();
  refreshProvidersList();

  importBtn?.addEventListener("click", handleImport);
  clearBtn?.addEventListener("click", clearForm);
  submitAllBtn?.addEventListener("click", showConfirmationModal);
  confirmUploadBtn?.addEventListener("click", handleSubmitAll);
  cancelUploadBtn?.addEventListener("click", closeModal);
  closeModalBtn?.addEventListener("click", closeModal);

  jsonModeRadio?.addEventListener("change", toggleImportMode);
  manualModeRadio?.addEventListener("change", toggleImportMode);
  manualStoreBtn?.addEventListener("click", handleManualStore);
  manualPreviewBtn?.addEventListener("click", handleManualPreview);
  manualClearBtn?.addEventListener("click", clearManualForm);

  prevPageBtn?.addEventListener("click", () => changePage(-1));
  nextPageBtn?.addEventListener("click", () => changePage(1));
  pageSizeSelect?.addEventListener("change", changePageSize);
  prevPageBtnBottom?.addEventListener("click", () => changePage(-1));
  nextPageBtnBottom?.addEventListener("click", () => changePage(1));

  checkDuplicatesBtn?.addEventListener("click", checkDuplicateGames);
  removeAllDuplicatesBtn?.addEventListener("click", removeAllDuplicateGames);
  removeSelectedDuplicatesBtn?.addEventListener("click", removeSelectedDuplicateGames);
  selectAllDuplicatesCheckbox?.addEventListener("change", onSelectAllDuplicates);
  closeDuplicateModalBtn?.addEventListener("click", closeDuplicateModal);
  closeDuplicateModalBtnTop?.addEventListener("click", closeDuplicateModal);

  applyFiltersBtn?.addEventListener("click", applyFilters);
  downloadFailedBtn?.addEventListener("click", downloadFailedGames);

  window.addEventListener("click", (event) => {
    if (event.target === confirmationModal) closeModal();
    if (event.target === duplicateModal) closeDuplicateModal();
  });

  /* Set initial mode visibility based on which radio is checked at load. */
  toggleImportMode();

  /* ---------- category selectors ---------- */
  /* Fetch the canonical category list from the server (single source of
   * truth = server/lib/categories.mjs). Falls back to the baked-in list. */
  async function loadCategories() {
    try {
      const res = await fetch(`${API}/api/categories`);
      const data = await res.json();
      if (Array.isArray(data.categories) && data.categories.length) {
        CATEGORIES = data.categories;
      }
      selectedOverrideCategory = data.default || CATEGORIES[0]?.slug || DEFAULT_CATEGORY;
    } catch {
      /* offline / file:// — keep the baked-in fallback list */
      selectedOverrideCategory = DEFAULT_CATEGORY;
    }
  }

  function populateCategorySelectors() {
    if (mainCategoryContainer) {
      let html =
        '<label class="detail-label">Category mapping</label>' +
        '<p class="muted-note">Genres are auto-detected from each game\'s category and tags ' +
        'and mapped to one of the site categories below. Unmapped games default to ' +
        `<strong>${escapeHtml(DEFAULT_CATEGORY)}</strong>.</p>` +
        '<label class="checkbox-row"><input type="checkbox" id="forceAllCategory">' +
        " Force one category for every game in this file (override auto-detect)</label>" +
        '<div class="radio-grid">';
      CATEGORIES.forEach((cat, index) => {
        const id = `cat_radio_${index}`;
        const checked = cat.slug === selectedOverrideCategory ? "checked" : "";
        html += `<div class="radio-item"><input type="radio" id="${id}" name="overrideCategory" value="${escapeAttr(cat.slug)}" ${checked}><label for="${id}">${escapeHtml(cat.label)}</label></div>`;
      });
      html += "</div>";
      mainCategoryContainer.innerHTML = html;
      mainCategoryContainer.querySelectorAll('input[name="overrideCategory"]').forEach((el) => {
        el.addEventListener("change", (e) => {
          if (e.target.checked) selectedOverrideCategory = e.target.value;
        });
      });
    }
    if (manualMainCategorySelect) {
      manualMainCategorySelect.innerHTML = CATEGORIES.map(
        (c) => `<option value="${escapeAttr(c.slug)}">${escapeHtml(c.label)}</option>`,
      ).join("");
    }
  }

  function getOverrideCategory() {
    const checked = document.querySelector('input[name="overrideCategory"]:checked');
    return checked?.value || selectedOverrideCategory;
  }

  function getForceAll() {
    return !!$("forceAllCategory")?.checked;
  }

  /* ---------- server health ---------- */
  async function pingServer() {
    if (!serverStatusEl) return;
    serverStatusEl.textContent = "Pinging server…";
    serverStatusEl.className = "status-pending";
    try {
      const res = await fetch(`${API}/api/health`);
      const data = await res.json();
      if (data.supabaseConfigured) {
        serverStatusEl.textContent = "Server connected, Supabase configured ✓";
        serverStatusEl.className = "status-ok";
      } else {
        serverStatusEl.textContent =
          "Server connected, Supabase NOT configured. Set SUPABASE_URL + SUPABASE_KEY in server/.env, then restart the server.";
        serverStatusEl.className = "status-warning";
      }
    } catch (err) {
      console.error("pingServer:", err);
      serverStatusEl.textContent =
        "Server unreachable. Start it: cd server && npm install && npm start";
      serverStatusEl.className = "status-error";
    }
  }

  async function refreshProvidersList() {
    if (!providerSelect) return;
    try {
      const res = await fetch(`${API}/api/providers`);
      if (!res.ok) return;
      const data = await res.json();
      const previous = providerSelect.value;
      const options = [`<option value="auto" selected>Auto-detect from file</option>`];
      for (const p of data.providers) {
        options.push(`<option value="${escapeAttr(p.id)}">${escapeHtml(p.label)}</option>`);
      }
      providerSelect.innerHTML = options.join("");
      if (previous) providerSelect.value = previous;
    } catch (err) {
      console.error("refreshProvidersList:", err);
    }
  }

  /* ---------- mode toggle ---------- */
  function toggleImportMode() {
    const showManual = !!manualModeRadio?.checked;
    if (showManual) {
      jsonImportForm?.classList.add("hidden");
      manualEntryForm?.classList.remove("hidden");
    } else {
      jsonImportForm?.classList.remove("hidden");
      manualEntryForm?.classList.add("hidden");
    }
  }

  /* ---------- JSON import flow ---------- */
  async function handleImport() {
    if (!validateInputs()) return;
    resetResults();
    updateStatus("Reading file…", "info");

    const file = jsonFileInput.files[0];
    const provider = providerSelect.value || "auto";
    const overrideCategory = getOverrideCategory();
    const forceAll = getForceAll();

    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch (err) {
      updateStatus(`Failed to parse JSON: ${err.message}`, "error");
      return;
    }

    updateStatus("Normalizing on server…", "info");
    try {
      const res = await fetch(`${API}/api/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, raw, overrideCategory, forceAll }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      unfilteredGames = data.games;
      processedGames = data.games.slice();
      currentPage = 1;
      const detectedNote = data.detected ? ` (auto-detected as ${data.providerLabel})` : "";
      updateStatus(
        `Loaded ${data.count} games${detectedNote}. Review, then submit.`,
        "success",
      );
      renderGamesList();
    } catch (err) {
      updateStatus(`Process failed: ${err.message}`, "error");
    }
  }

  async function applyFilters() {
    if (!unfilteredGames.length) {
      updateStatus("Nothing to filter — import a file first.", "warning");
      return;
    }
    const minQuality = filterQualityInput?.value ? parseFloat(filterQualityInput.value) : null;
    const requireThumbnail = !!filterRequireThumb?.checked;
    try {
      const res = await fetch(`${API}/api/filter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: unfilteredGames, minQuality, requireThumbnail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Filter failed");
      processedGames = data.games;
      currentPage = 1;
      updateStatus(
        `Filtered: ${data.count} of ${unfilteredGames.length} games match.`,
        data.count > 0 ? "success" : "warning",
      );
      renderGamesList();
    } catch (err) {
      updateStatus(`Filter error: ${err.message}`, "error");
    }
  }

  /* ---------- duplicates ---------- */
  async function checkDuplicateGames() {
    if (!processedGames.length) {
      updateStatus("No games to check.", "error");
      return;
    }
    updateStatus("Checking for duplicates on server…", "info");
    try {
      const res = await fetch(`${API}/api/check-duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: processedGames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate check failed");
      duplicatePairs = data.duplicates;
      if (duplicatePairs.length > 0) {
        displayDuplicateModal(duplicatePairs);
        updateStatus(`${duplicatePairs.length} duplicate(s) found.`, "warning");
      } else {
        updateStatus("No duplicates found in Supabase. Safe to upload.", "success");
      }
    } catch (err) {
      updateStatus(`Error checking duplicates: ${err.message}`, "error");
    }
  }

  function displayDuplicateModal(duplicates) {
    duplicateGameList.innerHTML = "";
    duplicates.forEach((dup, index) => {
      const item = document.createElement("div");
      item.className = "duplicate-game-item";
      item.dataset.index = String(index);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "duplicate-checkbox";
      checkbox.dataset.index = String(index);
      checkbox.addEventListener("change", updateDuplicateSelectionCount);

      const content = document.createElement("div");
      content.className = "duplicate-content";

      const title = document.createElement("h3");
      title.textContent = dup.localGame?.title || dup.existingGame?.title || "Unknown";

      const details = document.createElement("p");
      const local = dup.localGame || {};
      const existing = dup.existingGame || {};
      details.innerHTML = `
        <strong>Provider:</strong> ${escapeHtml(local.provider || "")}<br>
        <strong>Provider Game ID:</strong> ${escapeHtml(local.provider_game_id || "")}<br>
        <strong>Existing Supabase ID:</strong> ${escapeHtml(String(existing.id ?? ""))}<br>
        <strong>Existing Supabase Title:</strong> ${escapeHtml(existing.title || "")}
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-duplicate-btn";
      removeBtn.textContent = "Remove This";
      removeBtn.addEventListener("click", () => removeSingleDuplicate(index));

      content.append(title, details, removeBtn);
      item.append(checkbox, content);
      duplicateGameList.appendChild(item);
    });
    if (selectAllDuplicatesCheckbox) selectAllDuplicatesCheckbox.checked = false;
    updateDuplicateSelectionCount();
    duplicateModal.style.display = "block";
  }

  function updateDuplicateSelectionCount() {
    if (!duplicateSelectionCount) return;
    const selected = duplicateGameList.querySelectorAll(".duplicate-checkbox:checked").length;
    duplicateSelectionCount.textContent = `${selected} selected`;
  }

  function onSelectAllDuplicates(e) {
    const checked = e.target.checked;
    duplicateGameList.querySelectorAll(".duplicate-checkbox").forEach((cb) => {
      cb.checked = checked;
    });
    updateDuplicateSelectionCount();
  }

  function removeSingleDuplicate(index) {
    const dup = duplicatePairs[index];
    if (!dup?.localGame) return;
    processedGames = processedGames.filter(
      (g) =>
        !(
          g.provider === dup.localGame.provider &&
          g.provider_game_id === dup.localGame.provider_game_id
        ),
    );
    duplicatePairs = duplicatePairs.filter((_, i) => i !== index);
    if (duplicatePairs.length > 0) displayDuplicateModal(duplicatePairs);
    else {
      closeDuplicateModal();
      updateStatus("All flagged duplicates removed.", "success");
    }
    renderGamesList();
  }

  function removeSelectedDuplicateGames() {
    const checkedIndexes = [...duplicateGameList.querySelectorAll(".duplicate-checkbox:checked")]
      .map((cb) => Number(cb.dataset.index))
      .filter((i) => !Number.isNaN(i));
    if (!checkedIndexes.length) {
      updateStatus("No duplicates selected.", "warning");
      return;
    }
    const toRemove = new Set(
      checkedIndexes
        .map((i) => duplicatePairs[i])
        .filter(Boolean)
        .map((d) => `${d.localGame?.provider}::${d.localGame?.provider_game_id}`),
    );
    const before = processedGames.length;
    processedGames = processedGames.filter(
      (g) => !toRemove.has(`${g.provider}::${g.provider_game_id}`),
    );
    duplicatePairs = duplicatePairs.filter(
      (d, i) => !checkedIndexes.includes(i),
    );
    const removed = before - processedGames.length;
    if (duplicatePairs.length > 0) {
      displayDuplicateModal(duplicatePairs);
      updateStatus(`Removed ${removed} selected duplicates. ${duplicatePairs.length} remaining.`, "info");
    } else {
      closeDuplicateModal();
      updateStatus(`Removed ${removed} selected duplicates. List clear.`, "success");
    }
    renderGamesList();
  }

  function removeAllDuplicateGames() {
    const dupKeys = new Set(
      duplicatePairs
        .map((d) => `${d.localGame?.provider}::${d.localGame?.provider_game_id}`)
        .filter((k) => !k.includes("undefined")),
    );
    const before = processedGames.length;
    processedGames = processedGames.filter(
      (g) => !dupKeys.has(`${g.provider}::${g.provider_game_id}`),
    );
    duplicatePairs = [];
    closeDuplicateModal();
    updateStatus(`Removed ${before - processedGames.length} duplicates from upload list.`, "info");
    renderGamesList();
  }

  function closeDuplicateModal() {
    if (duplicateModal) duplicateModal.style.display = "none";
  }

  /* ---------- submit ---------- */
  function showConfirmationModal() {
    if (!processedGames.length) {
      updateStatus("No games to submit.", "error");
      return;
    }
    modalGameList.innerHTML = "";
    processedGames.slice(0, 50).forEach((g) => {
      const li = document.createElement("div");
      li.className = "modal-game-item";
      li.textContent = `${g.title} — ${g.category}`;
      modalGameList.appendChild(li);
    });
    if (processedGames.length > 50) {
      const more = document.createElement("div");
      more.className = "modal-game-item";
      more.textContent = `…and ${processedGames.length - 50} more.`;
      modalGameList.appendChild(more);
    }
    confirmationModal.style.display = "block";
  }

  function closeModal() {
    if (confirmationModal) confirmationModal.style.display = "none";
  }

  async function handleSubmitAll() {
    closeModal();
    resetResults();
    updateStatus(`Starting import of ${processedGames.length} games…`, "info");
    try {
      const res = await fetch(`${API}/api/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: processedGames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start import");
      activeImportId = data.importId;
      subscribeToProgress(activeImportId);
    } catch (err) {
      updateStatus(`Import error: ${err.message}`, "error");
    }
  }

  function subscribeToProgress(importId) {
    if (activeEventSource) activeEventSource.close();
    const es = new EventSource(`${API}/api/import/${importId}/progress`);
    activeEventSource = es;

    es.addEventListener("snapshot", (e) => handleProgressEvent(JSON.parse(e.data), false));
    es.addEventListener("progress", (e) => handleProgressEvent(JSON.parse(e.data), false));
    es.addEventListener("batch_error", (e) => {
      const info = JSON.parse(e.data);
      addResultRow(false, `Batch ${info.batchIndex}`, "—", info.error);
    });
    es.addEventListener("done", (e) => {
      handleProgressEvent(JSON.parse(e.data), true);
      es.close();
      activeEventSource = null;
      if (downloadFailedBtn) downloadFailedBtn.disabled = false;
    });
    es.onerror = () => {
      es.close();
      activeEventSource = null;
    };
  }

  function handleProgressEvent(snap, isFinal) {
    updateProgressBar(snap.pctComplete || 0);
    const msg = isFinal
      ? `Import ${snap.status}: ${snap.succeeded} succeeded, ${snap.failed} failed (of ${snap.total})`
      : `Importing… ${snap.processed}/${snap.total} (${snap.succeeded} ok, ${snap.failed} failed)`;
    updateStatus(msg, snap.failed > 0 && isFinal ? "warning" : "info");
  }

  function downloadFailedGames() {
    if (!activeImportId) {
      updateStatus("No active import to export.", "warning");
      return;
    }
    window.open(`${API}/api/import/${activeImportId}/failed`, "_blank");
  }

  /* ---------- manual entry ---------- */
  function getManualGameData() {
    return {
      provider_game_id: $("manual_provider_game_id")?.value.trim() || "",
      title: $("manual_title")?.value.trim() || "",
      description: $("manual_description")?.value || "",
      instructions: $("manual_instructions")?.value || "",
      slug: slugify($("manual_title")?.value || ""),
      /* Category is the canonical site slug chosen in the select. The free
       * sub-category text is informational only (web0.2 ignores it). */
      category: $("manual_main_category")?.value || CATEGORIES[0]?.slug || DEFAULT_CATEGORY,
      main_category: $("manual_main_category")?.value || CATEGORIES[0]?.slug || DEFAULT_CATEGORY,
      tags: $("manual_tags")?.value || "",
      orientation: determineOrientation(
        $("manual_width")?.value,
        $("manual_height")?.value,
      ),
      quality_score: null,
      width: Number($("manual_width")?.value) || 800,
      height: Number($("manual_height")?.value) || 600,
      date_modified: new Date().toISOString(),
      date_published: new Date().toISOString(),
      banner_image: null,
      thumbnail_image: $("manual_thumbnail_image")?.value.trim() || "",
      play_url: $("manual_play_url")?.value.trim() || "",
      provider: $("manual_provider")?.value.trim() || "manual",
      is_featured: !!$("manual_is_featured")?.checked,
      is_new: true,
    };
  }

  function validateManualInputs(game) {
    if (!game.title) {
      updateStatus("Manual entry: Title is required.", "error");
      return false;
    }
    if (!game.play_url) {
      updateStatus("Manual entry: Play URL is required.", "error");
      return false;
    }
    if (!game.provider_game_id) {
      updateStatus("Manual entry: Provider Game ID is required.", "error");
      return false;
    }
    if (!game.provider) {
      updateStatus("Manual entry: Provider is required.", "error");
      return false;
    }
    return true;
  }

  async function handleManualStore() {
    const game = getManualGameData();
    if (!validateManualInputs(game)) return;
    updateStatus("Submitting manual game…", "info");
    try {
      const res = await fetch(`${API}/api/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: [game] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Manual import failed");
      activeImportId = data.importId;
      subscribeToProgress(activeImportId);
    } catch (err) {
      updateStatus(`Manual import failed: ${err.message}`, "error");
    }
  }

  function handleManualPreview() {
    const game = getManualGameData();
    if (!validateManualInputs(game)) return;
    processedGames = [game];
    unfilteredGames = [game];
    currentPage = 1;
    renderGamesList();
    updateStatus("Previewing manual game.", "info");
  }

  function clearManualForm() {
    [
      "manual_provider_game_id",
      "manual_title",
      "manual_description",
      "manual_instructions",
      "manual_category",
      "manual_tags",
      "manual_width",
      "manual_height",
      "manual_thumbnail_image",
      "manual_play_url",
      "manual_provider",
    ].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    const ft = $("manual_is_featured");
    if (ft) ft.checked = false;
    resetResults();
  }

  /* ---------- list render (lazy iframe) ---------- */
  function renderGamesList() {
    if (!gamesList) return;
    gamesList.innerHTML = "";
    gamePreviewContainer.classList.remove("hidden");

    const totalGames = processedGames.length;
    const totalPages = Math.max(1, Math.ceil(totalGames / gamesPerPage));
    if (gamesCounter) gamesCounter.textContent = `${totalGames} games loaded`;

    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * gamesPerPage;
    const endIdx = Math.min(startIdx + gamesPerPage, totalGames);
    const slice = processedGames.slice(startIdx, endIdx);

    slice.forEach((game, idx) => {
      gamesList.appendChild(renderGameCard(game, startIdx + idx));
    });

    updatePaginationControls(totalPages);
  }

  function renderGameCard(game, originalIndex) {
    const card = document.createElement("div");
    card.className = "game-item";
    card.dataset.index = String(originalIndex);

    const previewBox = document.createElement("div");
    previewBox.className = "game-iframe-container";
    previewBox.style.position = "relative";

    const thumb = document.createElement("img");
    thumb.src = game.thumbnail_image || "";
    thumb.alt = game.title || "";
    thumb.loading = "lazy";
    thumb.style.width = "100%";
    thumb.style.height = "100%";
    thumb.style.objectFit = "cover";
    thumb.onerror = () => {
      thumb.style.background = "#222";
      thumb.alt = "(no thumbnail)";
    };
    previewBox.appendChild(thumb);

    const playOverlay = document.createElement("button");
    playOverlay.type = "button";
    playOverlay.textContent = "▶ Preview game";
    playOverlay.className = "preview-overlay";
    playOverlay.addEventListener("click", () => {
      previewBox.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.className = "game-iframe";
      iframe.src = game.play_url;
      iframe.setAttribute("allowfullscreen", "true");
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "0";
      previewBox.appendChild(iframe);
    });
    previewBox.appendChild(playOverlay);

    card.appendChild(previewBox);

    const details = document.createElement("div");
    details.className = "game-details";

    details.appendChild(labeledInput("Title:", game.title, (v) => update(originalIndex, "title", v)));
    details.appendChild(
      labeledTextarea("Description:", game.description, (v) => update(originalIndex, "description", v), 4),
    );
    details.appendChild(
      labeledTextarea("Instructions:", game.instructions || "", (v) => update(originalIndex, "instructions", v), 3),
    );

    const more = document.createElement("div");
    more.className = "additional-details";
    /* Category is constrained to canonical site slugs — editing it to a
     * free-text value would orphan the game on web0.2. Keep main_category
     * mirrored so the stored row stays consistent. */
    const categorySlugs = CATEGORIES.map((c) => c.slug);
    more.appendChild(
      labeledSelect("Category:", categorySlugs, game.category, (v) => {
        update(originalIndex, "category", v);
        update(originalIndex, "main_category", v);
      }),
    );
    more.appendChild(labeledInput("Tags:", game.tags, (v) => update(originalIndex, "tags", v)));

    const dims = document.createElement("div");
    dims.className = "dimensions-container";
    dims.appendChild(labeledInputSmall("Width:", game.width, (v) => update(originalIndex, "width", Number(v) || 0)));
    dims.appendChild(labeledInputSmall("Height:", game.height, (v) => update(originalIndex, "height", Number(v) || 0)));
    more.appendChild(dims);

    more.appendChild(labeledCheckbox("Featured:", !!game.is_featured, (v) => update(originalIndex, "is_featured", v)));
    more.appendChild(labeledInput("Game URL:", game.play_url, (v) => update(originalIndex, "play_url", v)));
    more.appendChild(labeledInput("Thumbnail URL:", game.thumbnail_image, (v) => update(originalIndex, "thumbnail_image", v)));

    details.appendChild(more);

    const actions = document.createElement("div");
    actions.className = "game-actions";
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-game-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeGame(originalIndex));
    actions.appendChild(removeBtn);
    details.appendChild(actions);

    card.appendChild(details);
    return card;
  }

  function update(index, field, value) {
    if (processedGames[index]) processedGames[index][field] = value;
  }

  function removeGame(index) {
    processedGames.splice(index, 1);
    renderGamesList();
  }

  function labeledInput(label, value, onChange) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.className = "detail-label";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "game-title-input";
    inp.value = value ?? "";
    inp.addEventListener("change", (e) => onChange(e.target.value));
    wrap.append(lab, inp);
    return wrap;
  }

  function labeledTextarea(label, value, onChange, rows = 3) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.className = "detail-label";
    const ta = document.createElement("textarea");
    ta.className = "game-description";
    ta.rows = rows;
    ta.value = value ?? "";
    ta.addEventListener("change", (e) => onChange(e.target.value));
    wrap.append(lab, ta);
    return wrap;
  }

  function labeledSelect(label, options, value, onChange) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.className = "detail-label";
    const sel = document.createElement("select");
    sel.className = "detail-select";
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", (e) => onChange(e.target.value));
    wrap.append(lab, sel);
    return wrap;
  }

  function labeledInputSmall(label, value, onChange) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.className = "detail-label-small";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "detail-input-small";
    inp.value = value ?? "";
    inp.addEventListener("change", (e) => onChange(e.target.value));
    wrap.append(lab, inp);
    return wrap;
  }

  function labeledCheckbox(label, checked, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "featured-container";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.className = "detail-label";
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.className = "detail-checkbox";
    inp.checked = !!checked;
    inp.addEventListener("change", (e) => onChange(e.target.checked));
    wrap.append(lab, inp);
    return wrap;
  }

  /* ---------- pagination ---------- */
  function updatePaginationControls(totalPages) {
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (pageInfoBottom) pageInfoBottom.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (prevPageBtnBottom) prevPageBtnBottom.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (nextPageBtnBottom)
      nextPageBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
    document.querySelectorAll(".pagination-controls").forEach((el) => {
      if (totalPages <= 1) el.classList.add("hidden");
      else el.classList.remove("hidden");
    });
  }

  function changePage(direction) {
    const totalPages = Math.ceil(processedGames.length / gamesPerPage);
    currentPage = Math.max(1, Math.min(totalPages, currentPage + direction));
    renderGamesList();
  }

  function changePageSize() {
    gamesPerPage = parseInt(pageSizeSelect.value);
    currentPage = 1;
    renderGamesList();
  }

  /* ---------- validation + ui plumbing ---------- */
  function validateInputs() {
    if (!jsonFileInput?.files?.[0]) {
      updateStatus("Choose a JSON file.", "error");
      return false;
    }
    return true;
  }

  function addResultRow(success, title, provider, message) {
    if (!resultsBody) return;
    const row = document.createElement("tr");
    [
      [success ? "Success" : "Failed", success ? "success" : "error"],
      [title, ""],
      [provider, ""],
      [message, ""],
    ].forEach(([text, cls]) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      row.appendChild(td);
    });
    resultsBody.appendChild(row);
  }

  function updateProgressBar(percentage) {
    if (progressBar) progressBar.style.width = `${percentage}%`;
  }

  function updateStatus(message, type) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type || ""}`;
    console.log(`[${type || "info"}] ${message}`);
  }

  function resetResults() {
    if (resultsBody) resultsBody.innerHTML = "";
    if (progressBar) progressBar.style.width = "0";
    if (statusMessage) {
      statusMessage.textContent = "";
      statusMessage.className = "status-message";
    }
    if (downloadFailedBtn) downloadFailedBtn.disabled = true;
  }

  function clearForm() {
    if (jsonFileInput) jsonFileInput.value = "";
    resetResults();
    processedGames = [];
    unfilteredGames = [];
    activeImportId = null;
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    gamePreviewContainer.classList.add("hidden");
    currentPage = 1;
  }

  /* ---------- helpers ---------- */
  function slugify(input) {
    if (!input) return "";
    return input
      .toString()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  function determineOrientation(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!w || !h) return "landscape";
    return w >= h ? "landscape" : "portrait";
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#96;");
  }
});
