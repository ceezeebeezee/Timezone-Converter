// Service worker: context menu registration, keyboard shortcut handling, script injection

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convert-timezone",
    title: "Convert \"%s\" to another timezone",
    contexts: ["selection"],
  });

  // Auto-detect and save default timezone on first install
  chrome.storage.sync.get({ defaultTimezone: null }, (data) => {
    if (!data.defaultTimezone) {
      chrome.storage.sync.set({
        defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  });
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "convert-timezone" && tab?.id) {
    injectAndActivate(tab.id, info.selectionText || null);
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "convert-timezone" && tab?.id) {
    injectAndActivate(tab.id, null);
  }
});

async function injectAndActivate(tabId, selectionText) {
  try {
    // Inject the content script CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });

    // Inject scripts in dependency order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["cities.js", "dateparser.js", "content.js"],
    });

    // Tell the content script to open the overlay
    chrome.tabs.sendMessage(tabId, {
      action: "open-converter",
      selectionText: selectionText,
    });
  } catch (err) {
    console.error("Timezone Converter: Failed to inject content script:", err);
  }
}
