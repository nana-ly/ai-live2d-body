param(
  [string]$Port = $env:PET_CONTROL_PORT,
  [string]$ToolName = $env:CLAUDE_TOOL_NAME
)

if (-not $Port) { $Port = "3470" }

$stdin = ""
try {
  if ([Console]::In.Peek() -ge 0 -or $input) {
    $stdin = [Console]::In.ReadToEnd()
  }
} catch {}

if ($stdin.Trim()) {
  try {
    $hook = $stdin | ConvertFrom-Json
    if ($hook.tool_name) { $ToolName = [string]$hook.tool_name }
  } catch {}
}

function Invoke-PetPost {
  param(
    [string]$Path,
    [hashtable]$Body
  )

  $json = $Body | ConvertTo-Json -Compress -Depth 6
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -Method POST -Body $json -ContentType "application/json" -UseBasicParsing
    if ($response.StatusCode -ne 200) {
      Write-Error "pet hook failed: HTTP $($response.StatusCode)"
      exit 1
    }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Error "pet hook failed: HTTP $status — $($_.Exception.Message)"
    exit 1
  }
}

$tool = if ($ToolName) { $ToolName } else { "default" }

Invoke-PetPost -Path "/work" -Body @{
  active = $true
  tool   = $tool
  status = "working"
}

exit 0
