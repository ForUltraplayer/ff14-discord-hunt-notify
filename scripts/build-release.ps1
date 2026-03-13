param(
  [string]$Version = '0.1.0'
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$appName = 'ff14-discord-hunt-notify'
$releaseName = "$appName-win-x64-v$Version"
$buildDir = Join-Path $root 'build'
$launcherBuildDir = Join-Path $buildDir 'launcher'
$stageDir = Join-Path $root "release\$releaseName"
$zipPath = Join-Path $root "release\$releaseName.zip"
$exePath = Join-Path $stageDir "$appName.exe"
$runtimeDir = Join-Path $stageDir 'runtime'
$launcherSource = Join-Path $root 'src\launcher\Program.cs'
$nodePath = (Get-Command node | Select-Object -ExpandProperty Source)

New-Item -ItemType Directory -Path $launcherBuildDir -Force | Out-Null

if (Test-Path $stageDir) {
  Remove-Item $stageDir -Recurse -Force
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'config') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'maps\official') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'overlay') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'samples') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'scripts') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'src\lib') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'data\images') -Force | Out-Null

Write-Host "Compiling launcher executable..."
Add-Type `
  -OutputAssembly $exePath `
  -OutputType ConsoleApplication `
  -Path $launcherSource

Write-Host "Copying bundled node runtime..."
Copy-Item $nodePath (Join-Path $runtimeDir 'node.exe')

Write-Host "Smoke test launcher help..."
& $exePath --help | Out-Host

if ($LASTEXITCODE -ne 0) {
  throw "Launcher smoke test failed."
}

Write-Host "Copying runtime files..."
Copy-Item (Join-Path $root 'README.md') $stageDir
Copy-Item (Join-Path $root 'start-live.bat') $stageDir
Copy-Item (Join-Path $root 'start-test.bat') $stageDir

Copy-Item (Join-Path $root 'config\example.config.json') (Join-Path $stageDir 'config')
Copy-Item (Join-Path $root 'config\hunts.as-whitelist.json') (Join-Path $stageDir 'config')
Copy-Item (Join-Path $root 'config\hunts.sample.json') (Join-Path $stageDir 'config')
Copy-Item (Join-Path $root 'config\local.config.example.json') (Join-Path $stageDir 'config')
Copy-Item (Join-Path $root 'config\tracked-targets.outrunner.json') (Join-Path $stageDir 'config')

Copy-Item (Join-Path $root 'maps\sample-grid.svg') (Join-Path $stageDir 'maps')
Copy-Item (Join-Path $root 'maps\living-memory-official.png') (Join-Path $stageDir 'maps')
Copy-Item (Join-Path $root 'maps\official\*') (Join-Path $stageDir 'maps\official') -Recurse

Copy-Item (Join-Path $root 'overlay\*') (Join-Path $stageDir 'overlay') -Recurse
Copy-Item (Join-Path $root 'samples\*') (Join-Path $stageDir 'samples') -Recurse

Copy-Item (Join-Path $root 'scripts\calibrate-map.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\debug-local-state.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\debug-player.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\download-official-dawntrail-maps.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\render-map-png.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\restart-live-server.ps1') (Join-Path $stageDir 'scripts')
Copy-Item (Join-Path $root 'scripts\restart-local-server.ps1') (Join-Path $stageDir 'scripts')

Copy-Item (Join-Path $root 'src\server.mjs') (Join-Path $stageDir 'src')
Copy-Item (Join-Path $root 'src\lib\*') (Join-Path $stageDir 'src\lib') -Recurse

Write-Host "Creating zip archive..."
Compress-Archive -Path $stageDir -DestinationPath $zipPath -Force

Write-Host "Release folder: $stageDir"
Write-Host "Release zip: $zipPath"
