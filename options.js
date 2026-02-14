document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("default-tz");
  const status = document.getElementById("status");

  // Populate with all IANA timezones
  let timezones = [];
  try {
    timezones = Intl.supportedValuesOf("timeZone");
  } catch (e) {
    // Fallback: just use a few common ones
    timezones = [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris",
      "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata",
      "Australia/Sydney", "Pacific/Auckland", "UTC",
    ];
  }

  timezones.forEach((tz) => {
    const option = document.createElement("option");
    option.value = tz;
    option.textContent = tz.replace(/_/g, " ");
    select.appendChild(option);
  });

  // Load saved setting or auto-detect
  chrome.storage.sync.get({ defaultTimezone: null }, (data) => {
    if (data.defaultTimezone) {
      select.value = data.defaultTimezone;
    } else {
      const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      select.value = systemTz;
      chrome.storage.sync.set({ defaultTimezone: systemTz });
    }
  });

  // Save on change
  select.addEventListener("change", () => {
    chrome.storage.sync.set({ defaultTimezone: select.value }, () => {
      status.textContent = "Settings saved.";
      status.className = "status visible";
      setTimeout(() => {
        status.className = "status";
      }, 2000);
    });
  });
});
