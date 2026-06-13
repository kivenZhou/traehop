# TraeHop

**A local session manager for your own Trae IDE accounts.**

TraeHop helps developers and teams who legitimately hold multiple Trae accounts (work, personal, client projects) switch between them manually — without re-logging in every time.

> **Not** a quota-arbitrage tool. No auto-switch on quota exhaustion. No cloud. No proxy.

[![GitHub stars](https://img.shields.io/github/stars/kivenZhou/traehop?style=flat-square&logo=github)](https://github.com/kivenZhou/traehop/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/kivenZhou/traehop?style=flat-square&logo=github)](https://github.com/kivenZhou/traehop/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)
[![Website](https://img.shields.io/badge/website-www.fastx.ink-6366f1?style=flat-square)](https://www.fastx.ink)

<p align="center">
  <img src="build/image.png" alt="TraeHop app screenshot" width="800" />
</p>

<p align="center">
  <sub>Manage multiple Trae accounts · manual switch · usage tracking</sub>
</p>

---

## ⭐ If TraeHop helps you, give us a Star!

Open source builds trust — your credentials stay local, and the code is auditable. A Star helps more developers discover TraeHop and keeps the project maintained.

**[⭐ Star on GitHub](https://github.com/kivenZhou/traehop)** · **[📥 Official downloads](https://github.com/kivenZhou/traehop/releases)** · **[🌐 Official website](https://www.fastx.ink)**

---

## Official channels

| Channel | Link | Notes |
|---------|------|-------|
| **Product (app + releases)** | [github.com/kivenZhou/traehop](https://github.com/kivenZhou/traehop) | MIT open source · Star here · installers in Releases |
| **Website** | [www.fastx.ink](https://www.fastx.ink) | Product landing page |
| **Website source** | [github.com/kivenZhou/fastx](https://github.com/kivenZhou/fastx) | MIT open source · Vue site only |

> Download only from the links above. Third-party repacks may be outdated or tampered with — we cannot verify them.

---

## ⚠️ Disclaimer (read before use)

- This tool is for managing **accounts you own and registered legitimately** under Trae's terms.
- All tokens, cookies, and account data are stored **locally on your machine only**. Nothing is uploaded to our servers — we don't run any server.
- This tool performs **manual account switching only**. It does not auto-rotate accounts to bypass billing or quota limits.
- Using this tool may violate Trae's Terms of Service. **You assume all risks**, including account suspension or termination.
- Do **not** use this tool for bulk registration, quota arbitrage, or reselling accounts.
- Advanced features (environment reset, device ID changes) may trigger platform risk controls. Use with caution.

By using this software, you agree to the above.

---

## Features

| Feature | Description |
|---------|-------------|
| **Manual switch** | One-click switch to another saved account; Trae restarts with the new session |
| **Browser login** | Add accounts via embedded login — supports 2FA / OAuth flows |
| **Token refresh** | Cookie-based session refresh to reduce re-login friction |
| **Notes & groups** | Organize accounts by project, client, or environment |
| **Usage monitor** *(optional)* | View API usage per account — informational only, not tied to switching |
| **Encrypted export** | Backup accounts with AES-256-GCM password encryption |
| **System tray** | Quick manual switch from the menu bar / tray |
| **macOS & Windows** | Native Electron desktop app |

---

## What this tool does NOT do

- ❌ Auto-switch when quota runs out  
- ❌ Upload credentials or conversations to any server  
- ❌ Proxy or intercept Trae API traffic  
- ❌ Sell, share, or batch-register accounts  

---

## Installation

### From source

```bash
git clone https://github.com/kivenZhou/traehop.git
cd traehop
npm install
npm run icons   # optional: regenerate app icons from build/icon.svg
npm start
```

### Pre-built installers (recommended)

Download the latest release from **[GitHub Releases](https://github.com/kivenZhou/traehop/releases)** — no build required.

| Platform | Download |
|----------|----------|
| macOS Apple Silicon | `TraeHop-*-mac-arm64.dmg` |
| macOS Intel | `TraeHop-*-mac-x64.dmg` |
| Windows x64 | `TraeHop-*-win-x64.exe` |

### Build & publish installers (maintainers)

```bash
npm run dist:all          # build all platforms → release/
npm run publish:release   # upload to GitHub Releases (requires gh CLI)
```

On a Mac (Apple Silicon), you can cross-build all three release artifacts:

```bash
npm run dist:mac-arm64   # macOS Apple Silicon (M 系列) — .dmg + .zip
npm run dist:mac-x64     # macOS Intel (x86_64) — .dmg + .zip
npm run dist:win         # Windows x64 — NSIS installer + .zip
npm run dist:all         # Run all three (sequential)
```

Output goes to `release/`, with filenames like:

| Platform | Example artifact |
|----------|------------------|
| macOS arm64 | `TraeHop-0.3.0-mac-arm64.dmg` |
| macOS x64 | `TraeHop-0.3.0-mac-x64.dmg` |
| Windows | `TraeHop-0.3.0-win-x64.exe` (NSIS) |

**Notes**

- **macOS**: `dist:mac-arm64` and `dist:mac-x64` produce separate DMGs (not Universal). Intel users must use the x64 build.
- **Windows on Mac**: electron-builder downloads the Windows Electron binary; no VM required for most cases.

---

## Quick start

1. **Launch** TraeHop and accept the disclaimer.
2. **Add an account** — browser login (recommended), paste token, or import from Trae IDE.
3. **Configure Trae path** in Settings if auto-scan doesn't find it.
4. **Switch** — click **切换** on the account you want. Trae will close and reopen with that session.

### Switch modes

| Mode | When to use |
|------|-------------|
| **切换** | Normal daily switching between your own accounts |
| **重置环境后切换** *(advanced)* | Only when sessions are corrupted — resets local cache & device IDs; may violate ToS |

---

## Data & privacy

| Item | Location |
|------|----------|
| Account store | `electron-store` in app user data directory |
| Trae session files | Written locally to Trae's app support folder on switch |
| Backups | User-chosen local directory (optional auto-backup) |

**macOS:** `~/Library/Application Support/traehop/`  
**Windows:** `%APPDATA%\traehop\`

Credentials are stored locally in plaintext by default (export supports encryption). We recommend using encrypted export for backups and keeping your OS account secure.

---

## Settings

- **Usage auto-refresh** — off by default; enable if you want periodic usage stats
- **Low-usage notifications** — off by default
- **Token expiry alerts** — on by default

---

## Development

```
traehop/
├── build/             # App icons (icon.svg → png/icns/ico)
├── electron/          # Main process (IPC, switching, API, cleaner)
├── scripts/           # publish-release.mjs, generate-icons.sh
├── src/               # Renderer UI (HTML/CSS/JS)
└── package.json
```

Stack: Electron 35, electron-store, vanilla JS UI.

Regenerate icons after editing `build/icon.svg`:

```bash
npm run icons
```

---

## License

[MIT](LICENSE) — with an additional restriction against using this software to circumvent Trae platform billing or terms of service.

---

## 中文说明

**TraeHop**（Trae 账号跃迁）是一款**本地多账号切换工具**，面向持有多个合法 Trae 账号的开发者与团队，支持手动一键切换，省去重复登录。

**如果觉得好用，欢迎 [⭐ Star 支持](https://github.com/kivenZhou/traehop)！** 开源让我们彼此信任，也能帮助更多开发者发现这个项目。

**官方渠道：**

- 产品与安装包：[github.com/kivenZhou/traehop](https://github.com/kivenZhou/traehop)（Star 请点这里）
- 官网：[www.fastx.ink](https://www.fastx.ink)
- 官网源码：[github.com/kivenZhou/fastx](https://github.com/kivenZhou/fastx)

**合规要点：**

- 仅管理您本人名下、合规注册的 Trae 账号  
- 所有数据保存在本地，不上传远程服务器  
- 仅手动切换，不提供额度耗尽自动换号  
- 使用风险（含封号）由用户自行承担  

安装与使用方式见上文 English 部分。
