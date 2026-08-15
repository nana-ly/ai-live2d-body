# Leo launcher: WSL tmux (brain) + desktop pet (body)
param(
  [string]$Distro = "Ubuntu",
  [string]$Session = "claude"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== Leo Start ===" -ForegroundColor Cyan
Write-Host ""

# 1. Start WSL tmux session
Write-Host "[1/3] WSL tmux..." -ForegroundColor Yellow
$drive = (Get-Location).Path.Substring(0, 1).ToLower()
$rest = ((Get-Location).Path.Substring(2) -replace '\\', '/')
$wslPath = "/mnt/$drive$rest"

$check = wsl -d $Distro -- tmux has-session -t $Session 2>$null
if ($LASTEXITCODE -ne 0) {
  # New session: set working directory at creation time, no send-keys needed
  wsl -d $Distro -- tmux new-session -d -s $Session -c "$wslPath" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  tmux session created: $Session (cwd: $wslPath)" -ForegroundColor Green
  } else {
    Write-Host "  tmux failed — start it manually:" -ForegroundColor Red
    Write-Host "    wsl -d $Distro tmux new-session -d -s $Session -c $wslPath" -ForegroundColor Gray
  }
} else {
  Write-Host "  tmux session exists: $Session (skip send-keys to avoid injecting into Claude Code)" -ForegroundColor Green
}

# 2. Start DeepLX fallback translator
Write-Host "[2/3] DeepLX..." -ForegroundColor Yellow
$deeplxPath = Join-Path $root "deeplx_windows_amd64.exe"
if (Test-Path $deeplxPath) {
  $deeplxJob = Start-Job -Name "LeoDeepLX" -ScriptBlock {
    & $using:deeplxPath 2>&1
  }
  Write-Host "  DeepLX started (PID $($deeplxJob.Id))" -ForegroundColor Green
} else {
  Write-Host "  deeplx_windows_amd64.exe not found — skip" -ForegroundColor Red
}

# 3. Start desktop pet body
Write-Host "[3/3] pet starting..." -ForegroundColor Yellow
Write-Host ""

Write-Host "=== Ready ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Manual steps (separate terminals):" -ForegroundColor White
Write-Host "  VOICEVOX GUI (D:\Voicevox\VOICEVOX.exe)" -ForegroundColor Gray
Write-Host "  npm run tts" -ForegroundColor Gray
Write-Host "  wsl -d $Distro ; tmux attach -t $Session ; claude" -ForegroundColor Gray
Write-Host ""
Write-Host "TTS: VOICEVOX Kurosawa Kohaku + DeepL API + DeepLX fallback" -ForegroundColor Magenta
Write-Host ""

# Start Electron
npm start
