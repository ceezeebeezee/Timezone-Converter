# Timezone Converter

A Chrome extension that lets you select any date and time on a webpage and instantly convert it to another timezone. No copying, no Googling, no mental math.

## How It Works

1. **Select** a date or time on any webpage — emails, articles, calendars, anywhere
2. **Invoke** the extension using the keyboard shortcut or right-click context menu
3. **Type** a few characters of a city name — the autocomplete narrows 280+ cities in real time
4. **Press Enter** — the converted time appears right next to the original text

### Keyboard Shortcut

| Platform | Shortcut |
|---|---|
| macOS | `Option + D` |
| Windows / ChromeOS | `Alt + D` |

You can also right-click selected text and choose **"Convert Timezone"** from the context menu.

### Output Behavior

- **Editable text** (Gmail compose, Google Docs, text fields): the converted time is inserted in brackets after the selection, e.g. `[Mar 26, 2025, 11:00 PM JST, Tokyo]`
- **Non-editable text** (news articles, documentation): a floating blue tooltip appears near the selection for 3 seconds showing the converted time

## Supported Date/Time Formats

The parser handles the way humans actually write dates and times:

| Format | Example |
|---|---|
| Month Day Time | `March 26 10AM` |
| Day Month Year Time | `15 Jan 2024 2:30 PM` |
| US numeric | `3/15/2025 2:30 PM` |
| European numeric | `15.03.2025 14:30` |
| ISO 8601 | `2024-01-15T10:30:00` |
| With timezone | `March 26 10AM EST` |
| Natural language | `Friday, December 1st at noon` |
| Time only | `2:30 PM` |
| With UTC offset | `10:00 UTC+5:30` |
| Compact times | `10AM`, `3PM` |

The parser also handles ordinal suffixes (1st, 2nd, 3rd, 4th), day-of-week prefixes (Monday, Tue), filler words (at, on), and noon/midnight.

## Timezone Abbreviations

The extension displays proper timezone abbreviations instead of generic GMT offsets:

- **Standard time**: PST, EST, CET, JST, IST, AEST, etc.
- **Daylight saving time**: PDT, EDT, CEST, BST, AEDT, etc.

DST detection is automatic — it checks whether the converted date falls in standard or daylight saving time for the target timezone.

## Settings

Open the extension's options page to configure:

- **Default Timezone**: The source timezone assumed when the selected text doesn't include one. Auto-detected from your system on first use. Can be set to any IANA timezone (e.g., `America/New_York`, `Europe/London`, `Asia/Tokyo`).

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the project root directory (the folder containing `manifest.json`)
6. The extension icon will appear in your Chrome toolbar

### From the Chrome Web Store

Search for **"Timezone Converter"** on the [Chrome Web Store](https://chromewebstore.google.com/) or use the direct listing link.

## Project Structure

```
Timezone Converter/
+-- manifest.json          # Extension manifest (MV3)
+-- background.js          # Service worker: context menu, keyboard shortcut, script injection
+-- content.js             # Injected UI: overlay dialog, autocomplete, DOM insertion
+-- content.css            # Styles for inserted converted-time spans
+-- dateparser.js          # Date/time parsing engine and timezone conversion
+-- cities.js              # 280+ city-to-IANA-timezone mappings
+-- options.html           # Settings page markup
+-- options.js             # Settings page logic
+-- options.css            # Settings page styles
+-- icons/                 # Extension icons (16, 48, 128 px)
+-- assets/                # Chrome Web Store listing assets
|   +-- icons/             # Store icon copies
|   +-- screenshot*.png    # Store screenshots (1280x800)
|   +-- promo_small_440x280.png    # Small promotional tile
|   +-- promo_marquee_1400x560.png # Marquee promotional tile
|   +-- store_description.txt      # Store listing text
+-- resources/
    +-- readme.md           # This file
```

## How It Works (Technical)

### Architecture

The extension uses Chrome's Manifest V3 architecture:

- **Service Worker** (`background.js`): Registers the context menu and keyboard shortcut. When invoked, it injects `cities.js`, `dateparser.js`, and `content.js` into the active tab using `chrome.scripting.executeScript`.
- **Content Scripts** (injected on demand): Not declared in `content_scripts` — they are injected only when the user invokes the extension, keeping the footprint minimal.
- **Shadow DOM**: The overlay dialog is rendered inside a closed Shadow DOM to isolate its styles from the host page and prevent conflicts.

### Date Parsing Pipeline

1. **Timezone extraction**: Strips any explicit timezone (e.g., `EST`, `UTC+5:30`) from the end of the text
2. **Normalization**: Preprocesses the text through 8 steps — strips day-of-week names, filler words, ordinal suffixes; replaces noon/midnight; expands compact times (`10AM` to `10:00 AM`); uppercases AM/PM
3. **Pattern matching**: Tries ISO 8601, 11 common regex patterns (with and without year), time-only, and native `Date` fallback
4. **Timezone adjustment**: If a source timezone was found in the text, adjusts the parsed date from the browser's local time to the correct UTC instant

### Timezone Conversion

Uses `Intl.DateTimeFormat` with the target IANA timezone — no external API calls or timezone databases. A custom `IANA_TZ_ABBR` map replaces generic `GMT+X` output with proper abbreviations (JST, IST, CET, etc.), and an `isDST()` function determines whether to use the standard or daylight abbreviation for the target timezone at the specific date being converted.

### Gmail Compatibility

Gmail aggressively captures keyboard events. The extension handles this by:
- Retrying `.focus()` on the input field at 0ms, 50ms, and 150ms after opening
- Using bubble-phase `stopPropagation` on the dialog to prevent keystrokes from reaching Gmail's handlers while still allowing the input's own keyboard handler to fire first

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read selected text and insert the converted result on the current page |
| `storage` | Store the user's preferred default timezone |
| `contextMenus` | Add "Convert Timezone" to the right-click menu |
| `scripting` | Inject the conversion dialog and logic into the active tab |

## Privacy

- All date parsing and timezone conversion happens locally in your browser
- No data is sent to any external server
- No analytics or tracking
- No account required
