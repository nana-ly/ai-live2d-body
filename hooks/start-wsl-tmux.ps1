param(
  [string]$Distro = "Ubuntu",
  [string]$Session = "claude",
  [string]$ProjectRoot = "D:\QQdown\ai-live2d-body"
)

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$drive = $ProjectRoot.Substring(0, 1).ToLower()
$rest = ($ProjectRoot.Substring(2) -replace '\\', '/')
$wslPath = "/mnt/$drive$rest"

$check = wsl -d $Distro -- tmux has-session -t $Session 2>$null
if ($LASTEXITCODE -ne 0) {
  wsl -d $Distro -- tmux new-session -d -s $Session
  Write-Host "Created tmux session: $Session"
} else {
  Write-Host "tmux session exists: $Session"
}

wsl -d $Distro -- tmux send-keys -t "${Session}:0" "cd $wslPath" Enter

Write-Host ""
Write-Host "Attach and start Claude Code:"
Write-Host "  wsl -d $Distro"
Write-Host "  tmux attach -t $Session"
Write-Host "  claude"
