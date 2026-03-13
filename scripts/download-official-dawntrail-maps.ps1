$ErrorActionPreference = 'Stop'

$targets = @(
  @{ Name = 'urqopacha'; AssetId = 'y6f1/00' },
  @{ Name = 'kozamauka'; AssetId = 'y6f2/00' },
  @{ Name = 'yak-tel'; AssetId = 'y6f3/00' },
  @{ Name = 'shaaloani'; AssetId = 'x6f1/00' },
  @{ Name = 'heritage-found'; AssetId = 'x6f2/00' },
  @{ Name = 'living-memory'; AssetId = 'x6f3/00' }
)

$outputDir = Join-Path $PSScriptRoot '..\maps\official'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

foreach ($target in $targets) {
  $url = "https://v2.xivapi.com/api/asset/map/$($target.AssetId)"
  $destination = Join-Path $outputDir "$($target.Name).png"
  Write-Host "Downloading $($target.Name) from $url"
  Invoke-WebRequest $url -OutFile $destination
}

Write-Host "Downloaded official Dawntrail map assets to $outputDir"
