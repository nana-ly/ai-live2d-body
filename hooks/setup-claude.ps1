param(
  [string]$ProjectRoot = "D:\QQdown\ai-live2d-body"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$encoded = ($ProjectRoot -replace ':', '-') -replace '\\', '-'
$transcriptDir = Join-Path $env:USERPROFILE ".claude\projects\$encoded"

Write-Host "Project:        $ProjectRoot"
Write-Host "Transcript dir: $transcriptDir"

if (-not (Test-Path $transcriptDir)) {
  Write-Warning "Transcript dir not found yet. Run Claude Code once in this project first."
}

$port = "3470"
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
  $match = Select-String -Path $envFile -Pattern '^PET_CONTROL_PORT=(\d+)' | Select-Object -First 1
  if ($match) { $port = $match.Matches[0].Groups[1].Value }
}

$localSettings = @{
  env = @{
    PET_CONTROL_PORT      = $port
    CLAUDE_TRANSCRIPT_DIR = $transcriptDir
    PET_TMUX_VIA_WSL      = "1"
    WSL_DISTRO            = "Ubuntu"
    TMUX_SESSION          = "claude"
    TMUX_TARGET           = "0"
  }
}

$localPath = Join-Path $ProjectRoot ".claude\settings.local.json"
$localSettings | ConvertTo-Json -Depth 4 | Set-Content -Path $localPath -Encoding UTF8
Write-Host "Wrote $localPath"

$envLines = @(
  "CLAUDE_TRANSCRIPT_DIR=$transcriptDir",
  "PET_TMUX_VIA_WSL=1",
  "WSL_DISTRO=Ubuntu",
  "TMUX_SESSION=claude",
  "TMUX_TARGET=0"
)
foreach ($line in $envLines) {
  if (Test-Path $envFile) {
    $key = ($line -split '=')[0]
    if (Select-String -Path $envFile -Pattern "^$key=" -Quiet) {
      (Get-Content $envFile) -replace "^$key=.*", $line | Set-Content $envFile
    } else {
      Add-Content -Path $envFile -Value $line
    }
  }
}
Write-Host "Updated .env with CLAUDE_TRANSCRIPT_DIR"

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. npm start"
Write-Host "  2. cd $ProjectRoot ; claude"
Write-Host "  3. Optional: set TMUX_SESSION in .claude/settings.local.json"
Write-Host "  4. Restart Claude Code after editing settings"
