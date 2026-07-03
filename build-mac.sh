#!/usr/bin/env bash
# Atlas Craft — macOS DMG Build
# Verwendung:
#   ./build-mac.sh             # Apple Silicon (arm64) — Standard
#   ./build-mac.sh x64         # Intel Mac
#   ./build-mac.sh both        # Beide (erstellt 2 DMG-Dateien)
# Voraussetzungen: macOS 12+, Xcode CLI Tools, Node 18+, curl
set -e

ARCH="${1:-arm64}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$SCRIPT_DIR/electron-client"
ASSETS="$FRONTEND/src/assets"
JRE_DIR="$FRONTEND/jre"
RELEASE_DIR="$FRONTEND/release"

echo ""
echo "========================================"
echo "  Atlas Craft -- macOS DMG Build ($ARCH)"
echo "========================================"
echo ""

# ── Plattform-Check ───────────────────────────────────────────────────────────
if [ "$(uname)" != "Darwin" ]; then
    echo "FEHLER: Dieser Build muss auf einem Mac ausgefuehrt werden." >&2
    echo "  electron-builder kann macOS-Pakete nicht auf anderen Plattformen erstellen."
    exit 1
fi

# ── ICNS Icon erstellen ───────────────────────────────────────────────────────
ICNS_FILE="$ASSETS/icon-512.icns"
echo "[1/5] Erstelle macOS Icon (.icns)..."
if [ -f "$ICNS_FILE" ]; then
    echo "  Icon bereits vorhanden."
else
    PNG_FILE="$ASSETS/icon-512.png"
    if [ ! -f "$PNG_FILE" ]; then
        echo "  FEHLER: $PNG_FILE nicht gefunden." >&2; exit 1
    fi

    ICONSET_DIR=$(mktemp -d /tmp/atlas-craft-icon.XXXXXX)
    ICONSET="$ICONSET_DIR/AppIcon.iconset"
    mkdir "$ICONSET"

    for SIZE in 16 32 64 128 256 512; do
        sips -z $SIZE $SIZE "$PNG_FILE" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" &>/dev/null
        DOUBLE=$((SIZE * 2))
        if [ $DOUBLE -le 1024 ]; then
            sips -z $DOUBLE $DOUBLE "$PNG_FILE" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" &>/dev/null
        fi
    done

    iconutil -c icns "$ICONSET" -o "$ICNS_FILE"
    rm -rf "$ICONSET_DIR"
    echo "  Icon erstellt: $ICNS_FILE"
fi

# ── JRE Download helper ───────────────────────────────────────────────────────
download_jre_mac() {
    local TARGET_ARCH="$1"
    local TARGET_DIR="$2"
    local API_ARCH
    [ "$TARGET_ARCH" = "arm64" ] && API_ARCH="aarch64" || API_ARCH="x64"

    if [ -f "$TARGET_DIR/bin/java" ] || find "$TARGET_DIR" -name "java" -type f 2>/dev/null | grep -q .; then
        echo "  JRE ($TARGET_ARCH) bereits vorhanden, ueberspringe Download."
        return
    fi

    echo "  Lade Temurin 21 JRE ($TARGET_ARCH) fuer macOS herunter (einmalig ~60 MB)..."
    mkdir -p "$TARGET_DIR"
    TMP_TAR=$(mktemp /tmp/temurin-jre-mac-$TARGET_ARCH.XXXXXX.tar.gz)

    curl -L --progress-bar \
        "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$API_ARCH/jre/hotspot/normal/eclipse" \
        -o "$TMP_TAR"

    echo "  Entpacke JRE..."
    TMP_EXTRACT=$(mktemp -d /tmp/temurin-jre-extract.XXXXXX)
    tar -xzf "$TMP_TAR" -C "$TMP_EXTRACT"

    # Adoptium-Archive haben eine .app-Struktur auf macOS: Contents/Home/
    INNER_HOME=$(find "$TMP_EXTRACT" -path "*/Contents/Home" -type d | head -1)
    if [ -n "$INNER_HOME" ]; then
        rm -rf "$TARGET_DIR"
        cp -R "$INNER_HOME" "$TARGET_DIR"
    else
        INNER_DIR=$(find "$TMP_EXTRACT" -maxdepth 1 -mindepth 1 -type d | head -1)
        rm -rf "$TARGET_DIR"
        mv "$INNER_DIR" "$TARGET_DIR"
    fi

    rm -rf "$TMP_EXTRACT" "$TMP_TAR"
    find "$TARGET_DIR" -name "java" -type f -exec chmod +x {} \;
    echo "  JRE ($TARGET_ARCH) installiert."
}

build_for_arch() {
    local TARGET_ARCH="$1"
    echo ""
    echo "── Build fuer $TARGET_ARCH ──────────────────────────────────────"

    local ARCH_JRE_DIR="$FRONTEND/jre-$TARGET_ARCH"
    download_jre_mac "$TARGET_ARCH" "$ARCH_JRE_DIR"

    rm -rf "$JRE_DIR"
    cp -R "$ARCH_JRE_DIR" "$JRE_DIR"

    cd "$FRONTEND"
    if [ "$TARGET_ARCH" = "arm64" ]; then
        npx electron-builder --mac dmg --arm64
    else
        npx electron-builder --mac dmg --x64
    fi

    echo "  $TARGET_ARCH Build abgeschlossen."
}

# ── 2. JRE ───────────────────────────────────────────────────────────────────
echo "[2/5] Pruefe Bundled JRE (Eclipse Temurin 21)..."
# (wird in build_for_arch erledigt)

# ── 3. Backend JAR ────────────────────────────────────────────────────────────
echo "[3/5] Baue Backend-JAR (Gradle)..."
cd "$SCRIPT_DIR"
./gradlew jar --quiet
echo "  Backend-JAR fertig."

# ── 4. npm install ────────────────────────────────────────────────────────────
echo "[4/5] Installiere npm-Abhaengigkeiten..."
cd "$FRONTEND"
npm install --prefer-offline --silent
echo "  Abhaengigkeiten OK."

# ── 5. Electron DMG Build ────────────────────────────────────────────────────
echo "[5/5] Baue Electron DMG..."

if [ "$ARCH" = "both" ]; then
    build_for_arch "arm64"
    build_for_arch "x64"
else
    build_for_arch "$ARCH"
fi

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  BUILD ABGESCHLOSSEN"
echo ""
echo "  DMG (Drag & Drop nach Applications):"
find "$RELEASE_DIR" -name "*.dmg" 2>/dev/null | while read f; do
    SIZE_MB=$(du -m "$f" 2>/dev/null | cut -f1)
    echo "    $f  (${SIZE_MB} MB)"
done
echo "========================================"
echo ""
echo "Verteilung & Notarisierung (fuer Gatekeeper-Freigabe ohne Warnung):"
echo "  xcrun notarytool submit \"Atlas-Craft-*.dmg\" \\"
echo "    --apple-id <deine@email.de> --team-id <TEAM_ID> --password <app-passwort>"
echo "  xcrun stapler staple \"Atlas-Craft-*.dmg\""
echo ""
echo "Verwendung:"
echo "  ./build-mac.sh             # Apple Silicon (arm64)"
echo "  ./build-mac.sh x64         # Intel Mac"
echo "  ./build-mac.sh both        # Beide Versionen"
echo ""
