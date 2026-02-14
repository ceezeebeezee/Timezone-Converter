// Date/time parsing and timezone conversion logic
// Exposed as window.__TZ_DateParser

(function () {
  "use strict";

  // Common timezone abbreviations → UTC offset in hours
  const TZ_ABBREVIATIONS = {
    // North America
    EST: -5, EDT: -4,
    CST: -6, CDT: -5,
    MST: -7, MDT: -6,
    PST: -8, PDT: -7,
    AKST: -9, AKDT: -8,
    HST: -10, HAST: -10, HADT: -9,
    AST: -4, ADT: -3,
    NST: -3.5, NDT: -2.5,
    // Europe
    GMT: 0, UTC: 0,
    BST: 1,
    CET: 1, CEST: 2,
    EET: 2, EEST: 3,
    WET: 0, WEST: 1,
    MSK: 3,
    // Asia
    IST: 5.5,
    PKT: 5,
    NPT: 5.75,
    BDT: 6,
    ICT: 7,
    WIB: 7,
    SGT: 8,
    HKT: 8,
    CST_CN: 8,
    PHT: 8,
    AWST: 8,
    JST: 9,
    KST: 9,
    ACST: 9.5, ACDT: 10.5,
    AEST: 10, AEDT: 11,
    // Pacific / Others
    NZST: 12, NZDT: 13,
    SAST: 2,
    WAT: 1,
    CAT: 2,
    EAT: 3,
    ART: -3,
    BRT: -3, BRST: -2,
    CLT: -4, CLST: -3,
    COT: -5,
    PET: -5,
    VET: -4,
  };

  // IANA timezone → preferred abbreviation (standard, daylight)
  // Used to replace generic "GMT+X" output from Intl.DateTimeFormat
  const IANA_TZ_ABBR = {
    // North America
    "America/New_York":      { std: "EST",  dst: "EDT" },
    "America/Chicago":       { std: "CST",  dst: "CDT" },
    "America/Denver":        { std: "MST",  dst: "MDT" },
    "America/Los_Angeles":   { std: "PST",  dst: "PDT" },
    "America/Phoenix":       { std: "MST",  dst: null },
    "America/Anchorage":     { std: "AKST", dst: "AKDT" },
    "Pacific/Honolulu":      { std: "HST",  dst: null },
    "America/Detroit":       { std: "EST",  dst: "EDT" },
    "America/Indiana/Indianapolis": { std: "EST", dst: "EDT" },
    "America/Halifax":       { std: "AST",  dst: "ADT" },
    "America/St_Johns":      { std: "NST",  dst: "NDT" },
    "America/Winnipeg":      { std: "CST",  dst: "CDT" },
    "America/Edmonton":      { std: "MST",  dst: "MDT" },
    "America/Vancouver":     { std: "PST",  dst: "PDT" },
    "America/Toronto":       { std: "EST",  dst: "EDT" },
    "America/Regina":        { std: "CST",  dst: null },
    // Central / South America
    "America/Mexico_City":   { std: "CST",  dst: null },
    "America/Bogota":        { std: "COT",  dst: null },
    "America/Lima":          { std: "PET",  dst: null },
    "America/Santiago":      { std: "CLT",  dst: "CLST" },
    "America/Buenos_Aires":  { std: "ART",  dst: null },
    "America/Argentina/Buenos_Aires": { std: "ART", dst: null },
    "America/Sao_Paulo":     { std: "BRT",  dst: "BRST" },
    "America/Caracas":       { std: "VET",  dst: null },
    // Europe
    "Europe/London":         { std: "GMT",  dst: "BST" },
    "Europe/Dublin":         { std: "GMT",  dst: "IST" },
    "Europe/Paris":          { std: "CET",  dst: "CEST" },
    "Europe/Berlin":         { std: "CET",  dst: "CEST" },
    "Europe/Madrid":         { std: "CET",  dst: "CEST" },
    "Europe/Rome":           { std: "CET",  dst: "CEST" },
    "Europe/Amsterdam":      { std: "CET",  dst: "CEST" },
    "Europe/Brussels":       { std: "CET",  dst: "CEST" },
    "Europe/Vienna":         { std: "CET",  dst: "CEST" },
    "Europe/Zurich":         { std: "CET",  dst: "CEST" },
    "Europe/Stockholm":      { std: "CET",  dst: "CEST" },
    "Europe/Oslo":           { std: "CET",  dst: "CEST" },
    "Europe/Copenhagen":     { std: "CET",  dst: "CEST" },
    "Europe/Warsaw":         { std: "CET",  dst: "CEST" },
    "Europe/Prague":         { std: "CET",  dst: "CEST" },
    "Europe/Budapest":       { std: "CET",  dst: "CEST" },
    "Europe/Athens":         { std: "EET",  dst: "EEST" },
    "Europe/Bucharest":      { std: "EET",  dst: "EEST" },
    "Europe/Helsinki":       { std: "EET",  dst: "EEST" },
    "Europe/Istanbul":       { std: "TRT",  dst: null },
    "Europe/Moscow":         { std: "MSK",  dst: null },
    "Europe/Lisbon":         { std: "WET",  dst: "WEST" },
    // Africa
    "Africa/Johannesburg":   { std: "SAST", dst: null },
    "Africa/Lagos":          { std: "WAT",  dst: null },
    "Africa/Cairo":          { std: "EET",  dst: "EEST" },
    "Africa/Nairobi":        { std: "EAT",  dst: null },
    "Africa/Casablanca":     { std: "WET",  dst: "WEST" },
    // Middle East
    "Asia/Dubai":            { std: "GST",  dst: null },
    "Asia/Riyadh":           { std: "AST",  dst: null },
    "Asia/Tehran":           { std: "IRST", dst: "IRDT" },
    "Asia/Jerusalem":        { std: "IST",  dst: "IDT" },
    // South Asia
    "Asia/Kolkata":          { std: "IST",  dst: null },
    "Asia/Calcutta":         { std: "IST",  dst: null },
    "Asia/Karachi":          { std: "PKT",  dst: null },
    "Asia/Kathmandu":        { std: "NPT",  dst: null },
    "Asia/Dhaka":            { std: "BST",  dst: null },
    "Asia/Colombo":          { std: "IST",  dst: null },
    // Southeast Asia
    "Asia/Bangkok":          { std: "ICT",  dst: null },
    "Asia/Ho_Chi_Minh":      { std: "ICT",  dst: null },
    "Asia/Jakarta":          { std: "WIB",  dst: null },
    "Asia/Singapore":        { std: "SGT",  dst: null },
    "Asia/Kuala_Lumpur":     { std: "MYT",  dst: null },
    "Asia/Manila":           { std: "PHT",  dst: null },
    // East Asia
    "Asia/Shanghai":         { std: "CST",  dst: null },
    "Asia/Hong_Kong":        { std: "HKT",  dst: null },
    "Asia/Taipei":           { std: "CST",  dst: null },
    "Asia/Tokyo":            { std: "JST",  dst: null },
    "Asia/Seoul":            { std: "KST",  dst: null },
    // Oceania
    "Australia/Sydney":      { std: "AEST", dst: "AEDT" },
    "Australia/Melbourne":   { std: "AEST", dst: "AEDT" },
    "Australia/Brisbane":    { std: "AEST", dst: null },
    "Australia/Perth":       { std: "AWST", dst: null },
    "Australia/Adelaide":    { std: "ACST", dst: "ACDT" },
    "Australia/Darwin":      { std: "ACST", dst: null },
    "Australia/Hobart":      { std: "AEST", dst: "AEDT" },
    "Pacific/Auckland":      { std: "NZST", dst: "NZDT" },
    "Pacific/Fiji":          { std: "FJT",  dst: "FJST" },
    // UTC / GMT
    "UTC":                   { std: "UTC",  dst: null },
    "GMT":                   { std: "GMT",  dst: null },
    "Etc/UTC":               { std: "UTC",  dst: null },
    "Etc/GMT":               { std: "GMT",  dst: null },
  };

  /**
   * Check if a given date falls in DST for a specific IANA timezone.
   * Compares the UTC offset at the given date vs. the offset in January (winter).
   * If they differ, the date is in DST.
   */
  function isDST(date, timeZone) {
    // Get offset in January (definitely standard time in Northern Hemisphere,
    // but we compare offsets — if they differ, the one farther from UTC is DST)
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);

    function getOffset(d) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        hour: "numeric",
        hourCycle: "h23",
        timeZoneName: "longOffset",
      }).formatToParts(d);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      if (!tzPart) return 0;
      // Format: "GMT+05:30" or "GMT-08:00" or "GMT"
      const m = tzPart.value.match(/GMT([+-]\d{2}):?(\d{2})?/);
      if (!m) return 0;
      return parseInt(m[1]) * 60 + (parseInt(m[2] || "0") * (m[1][0] === "-" ? -1 : 1));
    }

    const janOff = getOffset(jan);
    const julOff = getOffset(jul);
    // If Jan and Jul offsets are the same, there's no DST
    if (janOff === julOff) return false;
    const dateOff = getOffset(date);
    // The offset farther from zero is DST (more positive or less negative)
    const stdOff = Math.min(janOff, julOff);
    return dateOff !== stdOff;
  }

  /**
   * Get the preferred timezone abbreviation for an IANA timezone at a given date.
   * Returns null if no mapping exists (will fall back to Intl output).
   */
  function getTzAbbreviation(date, timeZone) {
    const entry = IANA_TZ_ABBR[timeZone];
    if (!entry) return null;
    if (!entry.dst) return entry.std; // No DST for this zone
    return isDST(date, timeZone) ? entry.dst : entry.std;
  }

  // Month name → 1-indexed number
  const MONTH_MAP = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9, sept: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  function monthNameToNumber(name) {
    return MONTH_MAP[name.toLowerCase()] || -1;
  }

  function buildDate(yearStr, monthStr, dayStr, hourStr, minStr, secStr, ampm) {
    const year = +yearStr;
    const day = +dayStr;
    let month = +monthStr;
    if (isNaN(month) || month === 0) {
      month = monthNameToNumber(monthStr);
      if (month === -1) return null;
    }
    let hour = +(hourStr || 0);
    const min = +(minStr || 0);
    const sec = +(secStr || 0);
    if (ampm) {
      const up = ampm.toUpperCase();
      if (up === "PM" && hour < 12) hour += 12;
      if (up === "AM" && hour === 12) hour = 0;
    }
    const d = new Date(year, month - 1, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  // Extract timezone abbreviation or UTC±N from end of text
  function extractTimezone(text) {
    // Match UTC+5, GMT-3:30, UTC+05:30, etc.
    const utcOffsetPattern = /(?:UTC|GMT)\s*([+-]\d{1,2}(?::?\d{2})?)\s*$/i;
    let match = text.match(utcOffsetPattern);
    if (match) {
      const raw = match[1].replace(":", "");
      let hours;
      if (raw.length > 3) {
        // e.g., "+0530" → 5.5
        const sign = raw[0] === "-" ? -1 : 1;
        const abs = raw.replace(/[+-]/, "");
        hours = sign * (parseInt(abs.slice(0, -2)) + parseInt(abs.slice(-2)) / 60);
      } else {
        hours = parseInt(raw);
      }
      return {
        cleanedText: text.slice(0, match.index).trim(),
        offset: hours,
        label: match[0].trim(),
      };
    }

    // Match 2-5 uppercase letter abbreviation at end
    const abbrPattern = /\b([A-Z]{2,5})\s*$/;
    match = text.match(abbrPattern);
    if (match && TZ_ABBREVIATIONS[match[1]] !== undefined) {
      return {
        cleanedText: text.slice(0, match.index).trim(),
        offset: TZ_ABBREVIATIONS[match[1]],
        label: match[1],
      };
    }

    return { cleanedText: text, offset: null, label: null };
  }

  // Normalize human-friendly text into forms our regex patterns can consume
  function normalizeText(text) {
    var t = text;

    // 1. Strip leading day-of-week names (with optional trailing comma)
    t = t.replace(
      /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun),?\s+/i,
      ""
    );

    // 2. Strip filler words "at" and "on" (whole words only)
    t = t.replace(/\b(?:at|on)\b/gi, "");

    // 3. Strip ordinal suffixes: "26th" → "26", "1st" → "1", "3rd" → "3"
    t = t.replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1");

    // 4. Replace noon/midnight — compound forms first to avoid "12:00 noon" → "12:00 12:00 PM"
    t = t.replace(/\b12:00\s*noon\b/gi, "12:00 PM");
    t = t.replace(/\b12:00\s*midnight\b/gi, "12:00 AM");
    t = t.replace(/\bnoon\b/gi, "12:00 PM");
    t = t.replace(/\bmidnight\b/gi, "12:00 AM");

    // 5. Add space before AM/PM when glued to digits: "10AM" → "10 AM", "10:30PM" → "10:30 PM"
    t = t.replace(/(\d)(am|pm)/gi, "$1 $2");

    // 6. Expand bare-hour AM/PM to HH:00 format, but NOT "10:30 AM"
    //    Negative lookbehind skips digits that follow a colon (i.e., minutes)
    t = t.replace(/(?<!\d:)(\b\d{1,2})\s+(am|pm)\b/gi, function (_, h, ap) {
      return h + ":00 " + ap.toUpperCase();
    });

    // 7. Uppercase any remaining lowercase am/pm for consistency
    t = t.replace(/\b(am|pm)\b/gi, function (m) {
      return m.toUpperCase();
    });

    // 8. Collapse multiple spaces to single, trim
    t = t.replace(/\s{2,}/g, " ").trim();

    return t;
  }

  // Strategy A: ISO 8601
  function tryISO(text) {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    return buildDate(m[1], m[2], m[3], m[4], m[5], m[6], null);
  }

  // Strategy B: Common named/numeric formats
  function tryCommonFormats(text) {
    const patterns = [
      // "Jan 15, 2024 2:30 PM" or "January 15 2024 14:30:00"
      {
        re: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => buildDate(m[3], m[1], m[2], m[4], m[5], m[6], m[7]),
      },
      // "15 Jan 2024 14:30"
      {
        re: /^(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => buildDate(m[3], m[2], m[1], m[4], m[5], m[6], m[7]),
      },
      // "MM/DD/YYYY HH:MM AM" or "DD/MM/YYYY HH:MM" (also dot-separated)
      {
        re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => {
          const a = +m[1], b = +m[2];
          const month = a > 12 ? b : a;
          const day = a > 12 ? a : b;
          return buildDate(m[3], String(month), String(day), m[4], m[5], m[6], m[7]);
        },
      },
      // "YYYY/MM/DD HH:MM"
      {
        re: /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => buildDate(m[1], m[2], m[3], m[4], m[5], m[6], m[7]),
      },
      // "March 26 10:00 AM" (month day time, no year — assume current year)
      {
        re: /^(\w+)\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => buildDate(String(new Date().getFullYear()), m[1], m[2], m[3], m[4], m[5], m[6]),
      },
      // "26 March 10:00 AM" (day month time, no year — assume current year)
      {
        re: /^(\d{1,2})\s+(\w+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
        fn: (m) => buildDate(String(new Date().getFullYear()), m[2], m[1], m[3], m[4], m[5], m[6]),
      },
      // Date only: "Jan 15, 2024"
      {
        re: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i,
        fn: (m) => buildDate(m[3], m[1], m[2], "12", "0", null, null),
      },
      // Date only: "15 Jan 2024"
      {
        re: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/i,
        fn: (m) => buildDate(m[3], m[2], m[1], "12", "0", null, null),
      },
      // Date only: "MM/DD/YYYY" or "DD/MM/YYYY"
      {
        re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/,
        fn: (m) => {
          const a = +m[1], b = +m[2];
          const month = a > 12 ? b : a;
          const day = a > 12 ? a : b;
          return buildDate(m[3], String(month), String(day), "12", "0", null, null);
        },
      },
    ];

    for (const { re, fn } of patterns) {
      const m = text.match(re);
      if (m) {
        const d = fn(m);
        if (d && !isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // Strategy C: Time only
  function tryTimeOnly(text) {
    const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!m) return null;
    let hour = +m[1];
    const min = +m[2];
    const sec = +(m[3] || 0);
    const ampm = m[4];
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
      if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, sec);
  }

  // Strategy D: Native Date fallback
  function tryNativeDate(text) {
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  }

  window.__TZ_DateParser = {
    /**
     * Parse selected text into a Date.
     * @param {string} text - The selected text
     * @param {string} defaultTimezone - IANA tz to assume if none found in text
     * @returns {{ date: Date|null, sourceTz: string|null, error: string|null }}
     */
    parse(text, defaultTimezone) {
      const trimmed = text.trim();
      const tzInfo = extractTimezone(trimmed);
      const cleanedText = normalizeText(tzInfo.cleanedText);

      // Try each parsing strategy
      let date =
        tryISO(cleanedText) ||
        tryCommonFormats(cleanedText) ||
        tryTimeOnly(cleanedText) ||
        tryNativeDate(cleanedText);

      if (!date) {
        return { date: null, sourceTz: null, error: "Could not parse a date/time from the selected text." };
      }

      // Adjust for source timezone if one was found in the text
      if (tzInfo.offset !== null) {
        // date was parsed in local time; adjust to represent the correct UTC instant
        const localOffsetHours = -date.getTimezoneOffset() / 60;
        const adjustment = (localOffsetHours - tzInfo.offset) * 60 * 60 * 1000;
        date = new Date(date.getTime() - adjustment);
      }

      return {
        date,
        sourceTz: tzInfo.label || defaultTimezone,
        error: null,
      };
    },

    /**
     * Convert a Date to a formatted string in the target timezone.
     * @param {Date} date
     * @param {string} targetTz - IANA timezone ID
     * @returns {string}
     */
    convert(date, targetTz) {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: targetTz,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      });
      let result = formatter.format(date);

      // Replace generic "GMT+X" / "GMT-X" with a proper abbreviation if available
      const abbr = getTzAbbreviation(date, targetTz);
      if (abbr) {
        // Intl outputs like "GMT+9", "GMT+5:30", "GMT-3", or sometimes just "GMT"
        result = result.replace(/\bGMT(?:[+-]\d{1,2}(?::?\d{2})?)?\b/, abbr);
      }

      return result;
    },
  };
})();
