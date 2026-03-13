Invoke-RestMethod 'http://127.0.0.1:5059/health' | ConvertTo-Json -Depth 5
Invoke-RestMethod 'http://127.0.0.1:5059/debug/state' | ConvertTo-Json -Depth 5
try {
  Invoke-RestMethod 'http://127.0.0.1:5059/debug/player' | ConvertTo-Json -Depth 6
} catch {
  Write-Output 'debug/player request failed'
  Write-Output $_.Exception.Message
}
