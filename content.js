// Content script: overlay dialog, autocomplete, selection capture, DOM insertion
// Depends on: window.__TZ_CITIES (cities.js), window.__TZ_DateParser (dateparser.js)

(function () {
  "use strict";

  // Guard against double injection
  if (window.__TZ_CONVERTER_INJECTED) return;
  window.__TZ_CONVERTER_INJECTED = true;

  // State
  let overlayHost = null;
  let shadowRoot = null;
  let savedRange = null;
  let savedSelectionText = null;
  let savedInputElement = null;
  let savedInputSelectionEnd = null;
  let activeIndex = -1;
  let currentMatches = [];

  // Listen for messages from background.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== "open-converter") return;

    // Capture the current selection BEFORE creating the overlay
    captureSelection(message.selectionText);

    if (!savedSelectionText) {
      showToast("Select some text containing a date/time first.");
      return;
    }

    openOverlay();
  });

  function captureSelection(backgroundText) {
    savedRange = null;
    savedSelectionText = null;
    savedInputElement = null;
    savedInputSelectionEnd = null;

    // Check for selection inside input/textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      if (start !== end) {
        savedSelectionText = activeEl.value.substring(start, end).trim();
        savedInputElement = activeEl;
        savedInputSelectionEnd = end;
        return;
      }
    }

    // Regular DOM selection
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
      savedRange = sel.getRangeAt(0).cloneRange();
      savedSelectionText = sel.toString().trim();
    }

    // Use background-provided text if we didn't capture from DOM
    if (!savedSelectionText && backgroundText) {
      savedSelectionText = backgroundText;
    }
  }

  // ── Overlay ──────────────────────────────────────────────────

  function openOverlay() {
    if (overlayHost) {
      // Reuse existing overlay
      overlayHost.style.display = "block";
      const input = shadowRoot.querySelector("#tz-input");
      input.value = "";
      shadowRoot.querySelector("#tz-results").innerHTML = "";
      shadowRoot.querySelector("#tz-results").style.display = "none";
      shadowRoot.querySelector("#tz-error").style.display = "none";
      shadowRoot.querySelector("#tz-selected-text").textContent =
        'Selected: "' + truncate(savedSelectionText, 80) + '"';
      positionDialog();
      forceFocusInput();
      return;
    }

    // Create host element
    overlayHost = document.createElement("div");
    overlayHost.id = "tz-converter-host";
    overlayHost.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0;";
    document.body.appendChild(overlayHost);

    // Closed shadow DOM for style isolation
    shadowRoot = overlayHost.attachShadow({ mode: "closed" });

    // Inject CSS
    const style = document.createElement("style");
    style.textContent = getOverlayCSS();
    shadowRoot.appendChild(style);

    // Build overlay structure
    const overlay = document.createElement("div");
    overlay.id = "tz-overlay";
    overlay.innerHTML =
      '<div id="tz-backdrop"></div>' +
      '<div id="tz-dialog">' +
        '<div id="tz-header">' +
          '<span id="tz-title">Convert Timezone</span>' +
          '<button id="tz-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div id="tz-selected-text"></div>' +
        '<div id="tz-input-wrapper">' +
          '<input id="tz-input" type="text" placeholder="Type a city name (e.g., Tokyo, London)..." autocomplete="off" spellcheck="false" />' +
          '<ul id="tz-results" role="listbox"></ul>' +
        '</div>' +
        '<div id="tz-error"></div>' +
        '<div id="tz-hint">' +
          '<kbd>\u2191\u2193</kbd> navigate \u00b7 <kbd>Enter</kbd> select \u00b7 <kbd>Esc</kbd> close' +
        '</div>' +
      '</div>';

    overlay.querySelector("#tz-selected-text").textContent =
      'Selected: "' + truncate(savedSelectionText, 80) + '"';

    shadowRoot.appendChild(overlay);
    positionDialog();
    attachListeners();
    forceFocusInput();
  }

  function positionDialog() {
    const dialog = shadowRoot.querySelector("#tz-dialog");
    dialog.style.position = "fixed";

    if (savedRange) {
      const rect = savedRange.getBoundingClientRect();
      const dw = 380;
      const dh = 340;

      let top = rect.bottom + 8;
      let left = rect.left;

      if (top + dh > window.innerHeight) top = rect.top - dh - 8;
      if (left + dw > window.innerWidth) left = window.innerWidth - dw - 16;
      if (left < 8) left = 8;
      if (top < 8) top = 8;

      dialog.style.top = top + "px";
      dialog.style.left = left + "px";
      dialog.style.transform = "none";
    } else {
      dialog.style.top = "50%";
      dialog.style.left = "50%";
      dialog.style.transform = "translate(-50%, -50%)";
    }
  }

  function closeOverlay() {
    if (overlayHost) overlayHost.style.display = "none";
    activeIndex = -1;
    currentMatches = [];
  }

  function forceFocusInput() {
    const input = shadowRoot.querySelector("#tz-input");
    // Attempt focus immediately
    input.focus();
    // Retry after short delays to beat race conditions with
    // aggressive keyboard-capturing apps like Gmail
    setTimeout(() => input.focus(), 0);
    setTimeout(() => input.focus(), 50);
    setTimeout(() => input.focus(), 150);
  }

  // ── Event Listeners ──────────────────────────────────────────

  function attachListeners() {
    const input = shadowRoot.querySelector("#tz-input");
    const results = shadowRoot.querySelector("#tz-results");
    const closeBtn = shadowRoot.querySelector("#tz-close");
    const backdrop = shadowRoot.querySelector("#tz-backdrop");
    const dialog = shadowRoot.querySelector("#tz-dialog");

    // Stop keyboard events from propagating to the host page.
    // This prevents Gmail and similar apps from capturing keystrokes
    // that are intended for our dialog input.
    // IMPORTANT: Use bubble phase (no 'true'), NOT capture phase.
    // Capture phase would block events before they reach the input's
    // own keydown handler, breaking arrow keys and Enter.
    ["keydown", "keypress", "keyup"].forEach((evt) => {
      dialog.addEventListener(evt, (e) => e.stopPropagation());
    });

    input.addEventListener("input", () => {
      const query = input.value.trim();
      if (query.length < 1) {
        results.innerHTML = "";
        results.style.display = "none";
        currentMatches = [];
        activeIndex = -1;
        return;
      }
      currentMatches = filterCities(query);
      renderResults(currentMatches, query);
      activeIndex = currentMatches.length > 0 ? 0 : -1;
      updateHighlight();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeIndex < currentMatches.length - 1) activeIndex++;
        updateHighlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIndex > 0) activeIndex--;
        updateHighlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentMatches.length > 0) {
          // Use the highlighted item, or fall back to the first result
          var idx = (activeIndex >= 0 && activeIndex < currentMatches.length) ? activeIndex : 0;
          selectCity(currentMatches[idx]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    });

    results.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-index]");
      if (li) {
        const idx = +li.dataset.index;
        if (idx >= 0 && idx < currentMatches.length) {
          selectCity(currentMatches[idx]);
        }
      }
    });

    closeBtn.addEventListener("click", closeOverlay);
    backdrop.addEventListener("click", closeOverlay);

    // Global escape handler
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlayHost && overlayHost.style.display !== "none") {
        closeOverlay();
      }
    });
  }

  // ── Autocomplete ─────────────────────────────────────────────

  function filterCities(query) {
    const q = query.toLowerCase();
    const scored = [];

    for (const entry of window.__TZ_CITIES) {
      const cityLower = entry.city.toLowerCase();
      const tzLower = entry.tz.toLowerCase().replace(/_/g, " ");
      let score = 0;

      if (cityLower.startsWith(q)) {
        score = 100 - cityLower.length;
      } else if (cityLower.split(/\s+/).some((w) => w.startsWith(q))) {
        score = 50 - cityLower.length;
      } else if (cityLower.includes(q)) {
        score = 30 - cityLower.length;
      } else if (tzLower.includes(q)) {
        score = 10;
      } else if (entry.country.toLowerCase().startsWith(q)) {
        score = 5;
      }

      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map((s) => s.entry);
  }

  function renderResults(matches, query) {
    const results = shadowRoot.querySelector("#tz-results");

    if (matches.length === 0) {
      results.innerHTML = '<li class="tz-no-results">No matching cities</li>';
      results.style.display = "block";
      return;
    }

    let html = "";
    for (let i = 0; i < matches.length; i++) {
      const entry = matches[i];
      const highlighted = highlightMatch(entry.city, query);
      const country = entry.country ? ", " + escapeHtml(entry.country) : "";
      html +=
        '<li data-index="' + i + '" role="option" class="tz-result-item">' +
          '<span class="tz-city">' + highlighted + country + '</span>' +
          '<span class="tz-tz">' + escapeHtml(entry.tz) + '</span>' +
        '</li>';
    }

    results.innerHTML = html;
    results.style.display = "block";
  }

  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, idx)) +
      "<mark>" + escapeHtml(text.slice(idx, idx + query.length)) + "</mark>" +
      escapeHtml(text.slice(idx + query.length))
    );
  }

  function updateHighlight() {
    const items = shadowRoot.querySelectorAll(".tz-result-item");
    items.forEach((item, i) => {
      item.classList.toggle("tz-active", i === activeIndex);
    });
    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  // ── Conversion & Insertion ───────────────────────────────────

  function selectCity(cityEntry) {
    chrome.storage.sync.get({ defaultTimezone: null }, (settings) => {
      const defaultTz =
        settings.defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      const result = window.__TZ_DateParser.parse(savedSelectionText, defaultTz);

      if (result.error) {
        showError(result.error);
        return;
      }

      const converted = window.__TZ_DateParser.convert(result.date, cityEntry.tz);
      const insertText = " [" + converted + ", " + cityEntry.city + "]";

      insertAfterSelection(insertText);
      closeOverlay();
    });
  }

  function insertAfterSelection(text) {
    // Input/textarea path
    if (savedInputElement) {
      const val = savedInputElement.value;
      const pos = savedInputSelectionEnd;
      savedInputElement.value = val.slice(0, pos) + text + val.slice(pos);
      savedInputElement.setSelectionRange(pos + text.length, pos + text.length);
      savedInputElement.focus();
      savedInputElement = null;
      savedInputSelectionEnd = null;
      return;
    }

    // DOM range path
    if (!savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);

    const container = savedRange.endContainer;
    const isEditable = isEditableContext(container);

    if (isEditable) {
      const textNode = document.createTextNode(text);
      const endRange = savedRange.cloneRange();
      endRange.collapse(false);
      endRange.insertNode(textNode);
      endRange.setStartAfter(textNode);
      endRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(endRange);
    } else {
      // Non-editable: show floating tooltip near selection instead of mutating DOM
      showConvertedTooltip(text);
    }

    savedRange = null;
    savedSelectionText = null;
  }

  function isEditableContext(node) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el) {
      if (el.isContentEditable) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
      el = el.parentElement;
    }
    return false;
  }

  // ── Helpers ──────────────────────────────────────────────────

  function showError(msg) {
    const error = shadowRoot.querySelector("#tz-error");
    error.textContent = msg;
    error.style.display = "block";
  }

  function showToast(msg) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:#333;color:#fff;padding:12px 24px;border-radius:8px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "font-size:14px;z-index:2147483647;opacity:0;transition:opacity 0.3s ease;";
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function showConvertedTooltip(text) {
    const rect = savedRange.getBoundingClientRect();

    const tooltip = document.createElement("div");
    tooltip.textContent = text;
    tooltip.style.cssText =
      "position:fixed;z-index:2147483647;" +
      "background:#1a73e8;color:#fff;padding:6px 12px;border-radius:6px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "font-size:13px;font-weight:500;white-space:nowrap;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.15);" +
      "pointer-events:none;opacity:0;transition:opacity 0.2s ease;";

    // Position: top-right of selection
    var top = rect.top - 32;
    var left = rect.right + 6;

    // Clamp to viewport
    if (top < 4) top = rect.bottom + 6;
    if (left + 200 > window.innerWidth) left = rect.left - 6;

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";

    document.body.appendChild(tooltip);

    // Fade in
    requestAnimationFrame(function () { tooltip.style.opacity = "1"; });

    // Fade out after 3 seconds, then remove
    setTimeout(function () {
      tooltip.style.opacity = "0";
      setTimeout(function () { tooltip.remove(); }, 200);
    }, 3000);
  }

  function truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen) + "\u2026" : str;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── CSS ──────────────────────────────────────────────────────

  function getOverlayCSS() {
    return (
      "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }" +

      "#tz-backdrop {" +
        "position: fixed; inset: 0; background: rgba(0,0,0,0.25);" +
      "}" +

      "#tz-dialog {" +
        "position: fixed; width: 380px; max-height: 420px; background: #fff;" +
        "border-radius: 12px;" +
        "box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);" +
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;" +
        "font-size: 14px; color: #1f1f1f; overflow: hidden;" +
        "animation: tz-fade-in 0.15s ease-out;" +
      "}" +

      "@keyframes tz-fade-in {" +
        "from { opacity: 0; transform: translateY(-4px); }" +
        "to { opacity: 1; transform: translateY(0); }" +
      "}" +

      "#tz-header {" +
        "display: flex; align-items: center; justify-content: space-between;" +
        "padding: 14px 16px 10px; border-bottom: 1px solid #e8e8e8;" +
      "}" +

      "#tz-title { font-size: 15px; font-weight: 600; color: #1a1a1a; }" +

      "#tz-close {" +
        "background: none; border: none; font-size: 20px; color: #888;" +
        "cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1;" +
      "}" +
      "#tz-close:hover { background: #f0f0f0; color: #333; }" +

      "#tz-selected-text {" +
        "padding: 10px 16px; font-size: 12px; color: #666; background: #fafafa;" +
        "border-bottom: 1px solid #e8e8e8;" +
        "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" +
      "}" +

      "#tz-input-wrapper { position: relative; padding: 12px 16px 8px; }" +

      "#tz-input {" +
        "width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0;" +
        "border-radius: 8px; font-size: 14px; font-family: inherit;" +
        "outline: none; transition: border-color 0.15s; background: #fff; color: #1f1f1f;" +
      "}" +
      "#tz-input:focus { border-color: #1a73e8; }" +
      "#tz-input::placeholder { color: #aaa; }" +

      "#tz-results {" +
        "list-style: none; margin: 4px 0 0; padding: 4px 0;" +
        "max-height: 240px; overflow-y: auto; display: none;" +
        "border: 1px solid #e0e0e0; border-radius: 8px; background: #fff;" +
      "}" +

      ".tz-result-item {" +
        "padding: 8px 12px; cursor: pointer; display: flex;" +
        "justify-content: space-between; align-items: center;" +
        "transition: background 0.1s;" +
      "}" +
      ".tz-result-item:hover, .tz-result-item.tz-active { background: #e8f0fe; }" +

      ".tz-city { font-weight: 500; color: #1a1a1a; }" +
      ".tz-city mark { background: #fff3cd; color: inherit; border-radius: 2px; padding: 0 1px; }" +

      ".tz-tz { font-size: 12px; color: #888; margin-left: 8px; flex-shrink: 0; }" +

      ".tz-no-results { padding: 12px; color: #999; text-align: center; font-style: italic; }" +

      "#tz-error {" +
        "display: none; padding: 8px 16px; color: #d93025; font-size: 13px;" +
        "background: #fce8e6; margin: 0 16px 8px; border-radius: 6px;" +
      "}" +

      "#tz-hint {" +
        "padding: 8px 16px 12px; font-size: 11px; color: #aaa; text-align: center;" +
      "}" +
      "#tz-hint kbd {" +
        "background: #f0f0f0; border: 1px solid #ddd; border-radius: 3px;" +
        "padding: 1px 5px; font-family: inherit; font-size: 11px;" +
      "}"
    );
  }
})();
