#!/usr/bin/env bash
# Atlas Craft — Linux Build (AppImage + .deb)
# Verwendung:
#   ./build-linux.sh           # x64
#   ./build-linux.sh arm64     # ARM64 (Raspberry Pi 5, AWS Graviton, etc.)
#   ./build-linux.sh both      # Beide Architekturen
# Voraussetzungen: Node 18+, curl, tar, ein JDK fuer Gradle (systemeigen)
set -e

ARCH="${1:-x64}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$SCRIPT_DIR/electron-client"
JRE_DIR="$FRONTEND/jre"
RELEASE_DIR="$FRONTEND/release"

echo ""
echo "========================================"
echo "  Atlas Craft -- Linux Build ($ARCH)   "
echo "========================================"
echo ""

# ── JRE Download helper ───────────────────────────────────────────────────────
download_jre() {
    local TARGET_ARCH="$1"
    local TARGET_DIR="$2"
    local API_ARCH
    [ "$TARGET_ARCH" = "arm64" ] && API_ARCH="aarch64" || API_ARCH="x64"

    if [ -f "$TARGET_DIR/bin/java" ] || find "$TARGET_DIR" -name "java" -type f 2>/dev/null | grep -q .; then
        echo "  JRE ($TARGET_ARCH) bereits vorhanden, ueberspringe Download."
        return
    fi

    echo "  Lade Temurin 21 JRE ($TARGET_ARCH) herunter (einmalig ~60 MB)..."
    mkdir -p "$TARGET_DIR"
    TMP_TAR=$(mktemp /tmp/temurin-jre-linux-$TARGET_ARCH.XXXXXX.tar.gz)

    curl -L --progress-bar \
        "https://api.adoptium.net/v3/binary/latest/21/ga/linux/$API_ARCH/jre/hotspot/normal/eclipse" \
        -o "$TMP_TAR"

    echo "  Entpacke JRE..."
    TMP_EXTRACT=$(mktemp -d /tmp/temurin-jre-extract.XXXXXX)
    tar -xzf "$TMP_TAR" -C "$TMP_EXTRACT"

    INNER_DIR=$(find "$TMP_EXTRACT" -maxdepth 1 -mindepth 1 -type d | head -1)
    if [ -z "$INNER_DIR" ]; then
        echo "  FEHLER: Unerwartetes Archiv-Layout." >&2; exit 1
    fi

    rm -rf "$TARGET_DIR"
    mv "$INNER_DIR" "$TARGET_DIR"
    rm -rf "$TMP_EXTRACT" "$TMP_TAR"

    chmod +x "$TARGET_DIR/bin/java" "$TARGET_DIR/bin/javaw" 2>/dev/null || true
    echo "  JRE ($TARGET_ARCH) installiert."
}

build_for_arch() {
    local TARGET_ARCH="$1"

    echo ""
    echo "── Build fuer $TARGET_ARCH ──────────────────────────────────────"

    local ARCH_JRE_DIR="$FRONTEND/jre-$TARGET_ARCH"
    download_jre "$TARGET_ARCH" "$ARCH_JRE_DIR"

    # Kopiere richtige JRE in den standard jre/ Ordner fuer electron-builder
    rm -rf "$JRE_DIR"
    cp -r "$ARCH_JRE_DIR" "$JRE_DIR"

    cd "$FRONTEND"
    if [ "$TARGET_ARCH" = "arm64" ]; then
        npx electron-builder --linux AppImage deb --arm64
    else
        npx electron-builder --linux AppImage deb --x64
    fi

    echo "  $TARGET_ARCH Build abgeschlossen."
}

# ── 1. JRE ───────────────────────────────────────────────────────────────────
echo "[1/4] Pruefe Bundled JRE (Eclipse Temurin 21)..."

# ── 2. Backend JAR ────────────────────────────────────────────────────────────
echo "[2/4] Baue Backend-JAR (Gradle)..."
cd "$SCRIPT_DIR"
./gradlew jar --quiet
echo "  Backend-JAR fertig."

# ── 3. npm install ────────────────────────────────────────────────────────────
echo "[3/4] Installiere npm-Abhaengigkeiten..."
cd "$FRONTEND"
npm install --prefer-offline --silent
echo "  Abhaengigkeiten OK."

# ── 4. Electron Build ─────────────────────────────────────────────────────────
echo "[4/4] Baue Electron AppImage + .deb..."

if [ "$ARCH" = "both" ]; then
    build_for_arch "x64"
    build_for_arch "arm64"
else
    build_for_arch "$ARCH"
fi

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  BUILD ABGESCHLOSSEN"
echo ""
echo "  AppImages:"
find "$RELEASE_DIR" -name "*.AppImage" 2>/dev/null | while read f; do
    SIZE_MB=$(du -m "$f" 2>/dev/null | cut -f1)
    echo "    $f  (${SIZE_MB} MB)"
done
echo ""
echo "  .deb Pakete:"
find "$RELEASE_DIR" -name "*.deb" 2>/dev/null | while read f; do
    SIZE_MB=$(du -m "$f" 2>/dev/null | cut -f1)
    echo "    $f  (${SIZE_MB} MB)"
done
echo "========================================"
echo ""
echo "Hinweis AppImage: Benoetigt FUSE auf dem Zielgeraet."
echo "  Ubuntu/Debian: sudo apt-get install libfuse2"
echo "  Arch:          sudo pacman -S fuse2"
echo ""
echo "Hinweis .deb: Installation mit:"
echo "  sudo dpkg -i Atlas-Craft-*.deb"
echo ""
