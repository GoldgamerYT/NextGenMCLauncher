param(
    [ValidateSet("x64","arm64","both")]
    [string]$Arch = "x64"
)

$ErrorActionPreference = "Stop"
$root     = $PSScriptRoot
$frontend = Join-Path $root "electron-client"
$jreDir   = Join-Path $frontend "jre"

Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host "  Atlas Craft -- Windows Installer Build" -ForegroundColor White
Write-Host "  Architektur: $Arch                    " -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host ""

# ── JRE Download helper ───────────────────────────────────────────────────────
function Find-JavaExe($dir) {
    $direct = Join-Path $dir "bin\java.exe"
    if (Test-Path $direct) { return $direct }
    foreach ($sub in (Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue)) {
        $nested = Join-Path $sub.FullName "bin\java.exe"
        if (Test-Path $nested) { return $nested }
    }
    return $null
}

function Download-JRE($targetArch, $targetDir) {
    $javaExe = Find-JavaExe $targetDir
    if ($javaExe) {
        Write-Host "  JRE ($targetArch) bereits vorhanden ($javaExe)." -ForegroundColor Green
        return
    }

    $apiArch = if ($targetArch -eq "arm64") { "aarch64" } else { "x64" }
    Write-Host "  Lade Temurin 21 JRE ($targetArch) herunter (~60 MB, einmalig)..." -ForegroundColor Yellow

    $tmpZip     = Join-Path $env:TEMP "temurin21-jre-win-$targetArch.zip"
    $tmpExtract = Join-Path $env:TEMP "temurin21-extract-$targetArch"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"

    try {
        Invoke-WebRequest `
            -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/$apiArch/jre/hotspot/normal/eclipse" `
            -OutFile $tmpZip -UseBasicParsing
    } catch {
        Write-Host "  FEHLER beim JRE-Download ($targetArch): $_" -ForegroundColor Red
        Write-Host "  Lade manuell von https://adoptium.net" -ForegroundColor Red
        exit 1
    }

    $ProgressPreference = "Continue"
    Write-Host "  Entpacke JRE..." -ForegroundColor Yellow

    if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force

    $innerDirs = @(Get-ChildItem $tmpExtract -Directory)
    if ($innerDirs.Count -ne 1) {
        Write-Host "  FEHLER: Unerwartetes Archiv-Layout." -ForegroundColor Red; exit 1
    }

    if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force }
    Move-Item $innerDirs[0].FullName $targetDir
    Remove-Item $tmpZip     -Force
    Remove-Item $tmpExtract -Recurse -Force

    $found = Find-JavaExe $targetDir
    if (-not $found) {
        Write-Host "  FEHLER: JRE entpackt, aber java.exe nicht gefunden in: $targetDir" -ForegroundColor Red
        exit 1
    }
    Write-Host "  JRE installiert ($found)." -ForegroundColor Green
}

# ── 1. JRE ──────────────────────────────────────────────────────────────────
Write-Host "[1/4] Pruefe Bundled JRE (Eclipse Temurin 21)..." -ForegroundColor Cyan

if ($Arch -eq "both") {
    Download-JRE "x64"   (Join-Path $frontend "jre-x64")
    Download-JRE "arm64" (Join-Path $frontend "jre-arm64")
} else {
    Download-JRE $Arch $jreDir
}

# ── 2. Backend JAR ────────────────────────────────────────────────────────────
Write-Host "[2/4] Baue Backend-JAR (Gradle)..." -ForegroundColor Cyan
Set-Location $root
& .\gradlew.bat jar --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FEHLER: Gradle-Build fehlgeschlagen." -ForegroundColor Red; exit 1
}
Write-Host "  Backend-JAR fertig." -ForegroundColor Green

# ── 3. npm install ────────────────────────────────────────────────────────────
Write-Host "[3/4] Installiere npm-Abhaengigkeiten..." -ForegroundColor Cyan
Set-Location $frontend
& npm install --prefer-offline 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FEHLER: npm install fehlgeschlagen." -ForegroundColor Red; exit 1
}
Write-Host "  Abhaengigkeiten OK." -ForegroundColor Green

# ── 4. Electron NSIS Build ───────────────────────────────────────────────────
Write-Host "[4/4] Baue Electron NSIS-Installer..." -ForegroundColor Cyan

if ($Arch -eq "both") {
    # Build x64 first (copy x64 JRE to default jre folder)
    if (Test-Path $jreDir) { Remove-Item $jreDir -Recurse -Force }
    Copy-Item (Join-Path $frontend "jre-x64") $jreDir -Recurse
    & npm run "electron:build:win:x64"
    if ($LASTEXITCODE -ne 0) { Write-Host "  FEHLER: x64 Build fehlgeschlagen." -ForegroundColor Red; exit 1 }

    # Build arm64
    if (Test-Path $jreDir) { Remove-Item $jreDir -Recurse -Force }
    Copy-Item (Join-Path $frontend "jre-arm64") $jreDir -Recurse
    & npm run "electron:build:win:arm64"
    if ($LASTEXITCODE -ne 0) { Write-Host "  FEHLER: arm64 Build fehlgeschlagen." -ForegroundColor Red; exit 1 }
} elseif ($Arch -eq "arm64") {
    & npm run "electron:build:win:arm64"
    if ($LASTEXITCODE -ne 0) { Write-Host "  FEHLER: Electron-Build fehlgeschlagen." -ForegroundColor Red; exit 1 }
} else {
    & npm run "electron:build:win:x64"
    if ($LASTEXITCODE -ne 0) { Write-Host "  FEHLER: Electron-Build fehlgeschlagen." -ForegroundColor Red; exit 1 }
}

# ── Fertig ────────────────────────────────────────────────────────────────────
$releaseDir = Join-Path $frontend "release"
$installers = Get-ChildItem $releaseDir -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -notlike "*.blockmap" } |
              Sort-Object LastWriteTime -Descending

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD ABGESCHLOSSEN" -ForegroundColor Green
foreach ($inst in $installers) {
    $sizeMb = [math]::Round($inst.Length / 1MB, 1)
    Write-Host "  Installer : $($inst.Name)" -ForegroundColor Green
    Write-Host "  Groesse   : $sizeMb MB" -ForegroundColor Green
    Write-Host "  Pfad      : $($inst.FullName)" -ForegroundColor Green
    Write-Host ""
}
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Verwendung:" -ForegroundColor Yellow
Write-Host "  .\build-installer.ps1              # Nur x64" -ForegroundColor Gray
Write-Host "  .\build-installer.ps1 -Arch arm64  # Nur ARM64 (Surface Pro X, etc.)" -ForegroundColor Gray
Write-Host "  .\build-installer.ps1 -Arch both   # Beide Versionen" -ForegroundColor Gray
Write-Host ""
