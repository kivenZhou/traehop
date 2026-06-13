# TraeHop

[简体中文](./README.md)

**Local multi-account session manager for Trae IDE — open source, local-only, manual switch**

TraeHop helps developers and teams who legitimately hold multiple Trae accounts switch IDE sessions manually on macOS and Windows — no repeated logins.

[![GitHub stars](https://img.shields.io/github/stars/kivenZhou/traehop?style=flat-square&logo=github)](https://github.com/kivenZhou/traehop/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/kivenZhou/traehop?style=flat-square&logo=github)](https://github.com/kivenZhou/traehop/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)
[![Website](https://img.shields.io/badge/website-www.fastx.ink-6366f1?style=flat-square)](https://www.fastx.ink)

<p align="center">
  <img src="build/image.png" alt="TraeHop screenshot" width="780" />
</p>

**[📥 Download Releases](https://github.com/kivenZhou/traehop/releases)** · **[⭐ Star this repo](https://github.com/kivenZhou/traehop)** · **[🌐 Website](https://www.fastx.ink)**

---

## What is TraeHop

TraeHop is an **Electron desktop app** with one job: **manually** switch IDE sessions among multiple Trae accounts that you **legitimately own and registered in compliance**.

| | TraeHop | Typical tools |
|---|---------|---------------|
| 🔒 Data | ✅ 100% local, no remote server | ⚠️ Some use cloud or closed-source, unauditable |
| 🔄 Switch | ✅ Manual only — you decide when | ⚠️ Some auto-rotate on quota exhaustion |
| 📖 Code | ✅ MIT open source, auditable | ❌ Mostly closed source |
| 🖥️ Platform | ✅ macOS + Windows | ⚠️ Mostly Windows only |
| 🌐 Login | ✅ Browser login (2FA), token, IDE import | ⚠️ Usually token-only |

> ⛔ **Not a quota-arbitrage tool.** No auto-switch, no API proxy, no credential upload.

---

## Features

| | Module | Capabilities |
|---|--------|--------------|
| 👤 | **Accounts** | Browser login / token paste / IDE import; groups, notes, search & filter |
| 🔄 | **Switch** | Write session & restart Trae; system tray quick switch |
| 🔑 | **Renewal** | Browser re-login, cookie token refresh, pre-login |
| 📊 | **Usage** | Optional background refresh & history (off by default, informational) |
| 💾 | **Backup** | JSON export with AES-256-GCM encryption; scheduled auto-backup |
| 🎨 | **UI** | Dark / light theme, Chinese / English |
| ⚙️ | **Advanced** | Environment cleanup & device ID — only when sessions break |

---

## Disclaimer

Before use:

- ✅ For **accounts you legitimately own** only
- 🔒 All tokens & cookies stay local (see [Data locations](#data-locations)) — never uploaded
- ⚠️ Use **may violate Trae ToS** — account suspension risk is yours
- 🚫 No bulk registration, quota arbitrage, reselling, or billing circumvention
- ⚡ “Clean switch” & device ID changes are advanced — may trigger platform risk controls

You must accept the in-app disclaimer on first launch.

---

## Installation

### 📥 Pre-built installers (recommended)

Download from [GitHub Releases](https://github.com/kivenZhou/traehop/releases):

| Platform | File |
|----------|------|
| 🍎 macOS Apple Silicon | `TraeHop-*-mac-arm64.dmg` |
| 🍎 macOS Intel | `TraeHop-*-mac-x64.dmg` |
| 🪟 Windows x64 | `TraeHop-*-win-x64.exe` |

Download only from Releases or the [official website](https://www.fastx.ink). Third-party repacks cannot be verified.

### 🔨 Run from source

```bash
git clone https://github.com/kivenZhou/traehop.git
cd traehop
npm install
npm run icons   # optional
npm start
```

### 📦 Build installers (maintainers)

```bash
npm run dist:mac-arm64   # macOS Apple Silicon
npm run dist:mac-x64     # macOS Intel
npm run dist:win         # Windows x64
npm run dist:all         # all three → release/
npm run publish:release  # upload to GitHub Releases (needs gh CLI)
```

---

## Quick start

```
🚀 Launch → 📋 Accept disclaimer → ⚙️ Set Trae path → ➕ Add account → 🔄 Switch
```

**Add account** — pick one:

| | Method | How |
|---|--------|-----|
| 🌐 | **Browser login** (recommended) | Pop-up login at trae.ai with 2FA; auto-added on success |
| 📋 | **Paste token** | F12 → Network → filter `GetUserToken` → copy token from response |
| 📥 | **Import from IDE** | Log into target account in IDE, then one-click import |

**Switch account**: Click **Switch** on the account page. Trae closes and reopens with the target session. Save unsaved work first.

**Switch modes**:

| | Button | Description |
|---|--------|-------------|
| 🔄 | **Switch** | Daily use: write session & restart Trae |
| ⚡ | **Clean switch** | Advanced: clean cache & device ID first — only when sessions are broken |

**Backup & migration**: 💾 Export JSON from Accounts (optional encryption); 📥 import to restore on a new machine or share config.

---

## Data locations

| | Item | Path |
|---|------|------|
| 📁 | App data & accounts | macOS: `~/Library/Application Support/traehop/`<br>Windows: `%APPDATA%\traehop\` |
| 🔗 | Trae session files | Written to Trae's app support folder on switch |
| 💾 | Manual & auto backup | Local directory chosen in Settings |

Credentials are stored locally in plaintext by default. Use 🔐 encrypted export and keep your OS account secure.

---

## Settings

| | Option | Default | Description |
|---|--------|---------|-------------|
| 📊 | Usage auto-refresh | Off | Fetch API usage every 5–60 min when enabled |
| 🔔 | Low-quota alert | Off | System notification when below threshold |
| ⏰ | Token expiry alert | On | Notify on expiry or near-expiry |
| 💾 | Auto backup | Off | Scheduled plain JSON export to chosen folder |

---

## FAQ

| | Question | Answer |
|---|----------|--------|
| 🔄 | Trae didn't reopen after switch? | Verify Trae path in Settings; on macOS check required permissions. |
| 🔑 | Invalid token? | Check for extra spaces or expiry. Prefer 🌐 browser login. |
| 👤 | Still shows old account? | Close Trae manually, try ⚡ clean switch, or run cleanup first. |
| 🐧 | Linux support? | No. Trae IDE officially supports Windows and macOS only. |
| ❓ | How is TraeHop different? | Compliant local session manager: open source, local-only, manual switch, dual platform, browser login & encrypted backup. See comparison table above. |

---

## Official channels

| | Channel | Link |
|---|---------|------|
| 📦 | App & releases | [github.com/kivenZhou/traehop](https://github.com/kivenZhou/traehop) |
| 🌐 | Website | [www.fastx.ink](https://www.fastx.ink) |
| 💻 | Website source | [github.com/kivenZhou/fastx](https://github.com/kivenZhou/fastx) |

---

## Development

```
traehop/
├── electron/     # Main process: switch, API, login, cleanup, tray
├── src/          # Renderer UI (HTML / CSS / JS)
├── build/        # Icons & screenshots
└── scripts/      # Icon generation, release scripts
```

Stack: ⚡ Electron 35 · 💾 electron-store · 🎨 Vanilla JS · 🌍 i18n (ZH / EN)

```bash
npm run icons   # Regenerate icons after editing build/icon.svg
```

Issues: [github.com/kivenZhou/traehop/issues](https://github.com/kivenZhou/traehop/issues)

---

## License

[MIT](LICENSE) — Additional restriction: you may not use this software to circumvent Trae billing, quota limits, or terms of service.
