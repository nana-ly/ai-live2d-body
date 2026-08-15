param(
  [string]$Port = $env:PET_CONTROL_PORT
)

if (-not $Port) { $Port = "3470" }

# Phase 2: hook demotion — face control belongs to pet_speak/pet_act MCP tools.
# stop.ps1 now only signals idle state. No more keyword emotion detection.
# Emoji reactions are Leo's responsibility.

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

Invoke-PetPost -Path "/work" -Body @{
  active = $false
  status = "idle"
}

exit 0
