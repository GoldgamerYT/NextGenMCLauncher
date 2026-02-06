Write-Host "============================"
Write-Host "Atlas Craft Installer Builder"
Write-Host "============================"

# 1. Build Backend
Write-Host "`n[1/3] Building Java Backend..."
./gradlew clean assemble
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Backend build failed!"
    exit 1 
}

# 2. Setup Frontend
Write-Host "`n[2/3] Installing Frontend Dependencies..."
Set-Location electron-client
npm install
if ($LASTEXITCODE -ne 0) { 
    Write-Error "npm install failed! Do you have Node.js installed?"
    exit 1 
}

# 3. Build EXE
Write-Host "`n[3/3] Building EXE..."
npm run electron:build
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Electron build failed!"
    exit 1 
}

Write-Host "`nSUCCESS! Installer created at: electron-client/release/"
Pause
