$port = 5059
$configPath = 'config/local.config.json'
$exampleConfigPath = 'config/local.config.example.json'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$exePath = Join-Path $root 'ff14-discord-hunt-notify.exe'
$listener = netstat -ano |
  Select-String "127.0.0.1:$port.*LISTENING" |
  Select-Object -First 1

if ($listener) {
  $parts = ($listener.ToString() -split '\s+') | Where-Object { $_ }
  $pid = $parts[-1]

  if ($pid -and $pid -match '^\d+$') {
    Write-Host "Stopping existing process on port $port (PID $pid)..."
    Stop-Process -Id ([int]$pid) -Force
    Start-Sleep -Milliseconds 500
  }
}

if (-not (Test-Path $configPath)) {
  Write-Host "Missing $configPath"
  Write-Host "Copy $exampleConfigPath to $configPath and fill in your Discord webhook + detectedBy values first."
  exit 1
}

Write-Host "Starting live hunt notifier on port $port..."
Push-Location $root
try {
  if (Test-Path $exePath) {
    & $exePath --config $configPath --hunts config/hunts.as-whitelist.json
  } else {
    node src/server.mjs --config $configPath --hunts config/hunts.as-whitelist.json
  }
} finally {
  Pop-Location
}
