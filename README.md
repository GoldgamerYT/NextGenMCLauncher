# Atlas Craft

<div align="center">
  <img src="electron-client/src/assets/icon-512.png" alt="Atlas Craft Logo" width="128" height="128">
  
  **Modern All-in-One Minecraft Launcher**
  
  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/gamehost24/atlas-craft)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()
</div>

---

## ✨ Features

### 🎮 Game Launching
- **Multi-Profile Support** — Create unlimited profiles with different versions, mods, and settings
- **Version Support** — Vanilla, Fabric, Forge, and NeoForge
- **Auto Java Provisioning** — Automatically downloads the correct Java version for each MC version
- **RAM & JVM Control** — Fine-tune memory allocation and JVM arguments per profile

### 🔐 Account Management
- **Microsoft OAuth Login** — Secure Device Code Flow authentication
- **Multi-Account Support** — Switch between multiple Microsoft accounts
- **Token Auto-Refresh** — Sessions stay active automatically

### 📦 Mod Management
- **Modrinth Integration** — Search, browse, and install mods directly
- **CurseForge Integration** — Full CurseForge mod repository access (API key required)
- **One-Click Install** — Install mods with automatic dependency resolution
- **Mod Toggle** — Enable/disable mods without deleting them

### 🔄 Auto-Update
- **Seamless Updates** — Automatic update checks and in-app installation
- **GitHub Releases** — Updates distributed via GitHub releases

### 🎨 Modern UI
- **Dark Theme** — Beautiful, modern dark interface
- **Responsive Design** — Scales beautifully on any screen size
- **Real-time Logs** — WebSocket-powered live game console

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** — For building the frontend
- **Java 17+** — For building the backend
- **Gradle 8+** — Build tool

### Development Setup

```bash
# Clone the repository
git clone https://github.com/gamehost24/atlas-craft.git
cd atlas-craft

# Build the backend
./gradlew build

# Setup frontend
cd electron-client
npm install

# Run in development mode
npm run electron:dev
```

### Building for Production

```bash
# Build backend JAR
./gradlew jar

# Build Electron app
cd electron-client
npm run electron:build
```

The installer will be created in `electron-client/release/`.

---

## 🏗️ Architecture

```
atlas-craft/
├── src/main/java/net/gamehost24/launcher/
│   ├── HeadlessServer.java      # REST API (Javalin)
│   ├── auth/
│   │   └── MicrosoftAuthenticator.java
│   ├── core/
│   │   ├── LauncherEngine.java   # Game launching
│   │   ├── ProfileManager.java   # Profile CRUD
│   │   ├── VersionManager.java   # Version downloads
│   │   ├── JavaManager.java      # Java auto-provisioning
│   │   └── NeoForgeManager.java  # NeoForge support
│   ├── mods/
│   │   └── CurseForgeClient.java # CurseForge API
│   └── model/
│       ├── Profile.java
│       └── LauncherConfig.java
│
├── electron-client/
│   ├── electron/main.js          # Electron main process
│   └── src/
│       ├── components/           # React components
│       ├── stores/               # Zustand state management
│       └── services/             # API & WebSocket clients
│
└── build.gradle.kts              # Gradle build config
```

---

## 🔧 Configuration

### CurseForge API Key

To enable CurseForge mod search, set the `CURSEFORGE_API_KEY` environment variable:

1. Get an API key from [CurseForge Console](https://console.curseforge.com)
2. Set the environment variable:
   ```bash
   # Windows
   set CURSEFORGE_API_KEY=your-api-key
   
   # Linux/macOS
   export CURSEFORGE_API_KEY=your-api-key
   ```

### Auto-Update

Auto-update is configured for GitHub releases. To publish:

1. Create a GitHub repository
2. Update `package.json` with your repo details
3. Set `GH_TOKEN` environment variable
4. Run `npm run electron:publish`

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/profiles` | GET | List all profiles |
| `/api/profiles` | POST | Create profile |
| `/api/profiles/{name}` | PUT | Update profile |
| `/api/profiles/{name}` | DELETE | Delete profile |
| `/api/launch/{name}` | POST | Launch/stop game |
| `/api/auth/device-code` | POST | Start OAuth flow |
| `/api/auth/poll` | GET | Poll for token |
| `/api/versions/game` | GET | List MC versions |
| `/api/versions/loader/{type}/{version}` | GET | List loader versions |
| `/api/curseforge/search` | GET | Search CurseForge |

---

## 🧪 Testing

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests "ProfileManagerTest"
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [JMCCC](https://github.com/to2mbn/JMCCC) — Minecraft launcher library
- [Modrinth](https://modrinth.com) — Mod hosting platform
- [CurseForge](https://curseforge.com) — Mod hosting platform
- [Adoptium](https://adoptium.net) — Java runtime provider

---

<div align="center">
  Made with ❤️ by GameHost24
</div>
