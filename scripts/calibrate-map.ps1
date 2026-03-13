param(
  [Parameter(Mandatory = $true)]
  [string]$MapId,

  [Parameter(Mandatory = $true)]
  [string]$ZoneName,

  [Parameter(Mandatory = $true)]
  [double]$WorldX1,

  [Parameter(Mandatory = $true)]
  [double]$WorldZ1,

  [Parameter(Mandatory = $true)]
  [double]$MapX1,

  [Parameter(Mandatory = $true)]
  [double]$MapY1,

  [Parameter(Mandatory = $true)]
  [double]$WorldX2,

  [Parameter(Mandatory = $true)]
  [double]$WorldZ2,

  [Parameter(Mandatory = $true)]
  [double]$MapX2,

  [Parameter(Mandatory = $true)]
  [double]$MapY2
)

if ($WorldX1 -eq $WorldX2) {
  throw 'WorldX1 and WorldX2 must be different.'
}

if ($WorldZ1 -eq $WorldZ2) {
  throw 'WorldZ1 and WorldZ2 must be different.'
}

$entry = [ordered]@{
  $MapId = [ordered]@{
    zoneName = $ZoneName
    imagePath = "../maps/$MapId.png"
    worldAxes = [ordered]@{
      horizontal = 'x'
      vertical = 'z'
    }
    calibration = [ordered]@{
      worldMinX = $WorldX1
      worldMaxX = $WorldX2
      worldMinZ = $WorldZ1
      worldMaxZ = $WorldZ2
      mapMinX = $MapX1
      mapMaxX = $MapX2
      mapMinY = $MapY1
      mapMaxY = $MapY2
      pixelMinX = 80
      pixelMaxX = 944
      pixelMinY = 80
      pixelMaxY = 944
    }
  }
}

$entry | ConvertTo-Json -Depth 8
