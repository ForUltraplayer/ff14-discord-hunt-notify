param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [int]$Width,

  [Parameter(Mandatory = $true)]
  [int]$Height,

  [Parameter(Mandatory = $true)]
  [double]$MapX,

  [Parameter(Mandatory = $true)]
  [double]$MapY,

  [Parameter(Mandatory = $true)]
  [double]$MapWidth,

  [Parameter(Mandatory = $true)]
  [double]$MapHeight,

  [Parameter(Mandatory = $true)]
  [double]$PinX,

  [Parameter(Mandatory = $true)]
  [double]$PinY,

  [string]$Rank = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-Color {
  param(
    [int]$R,
    [int]$G,
    [int]$B,
    [int]$A = 255
  )

  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Get-Palette {
  param([string]$Rank)

  switch ($Rank) {
    'S' {
      return @{
        Primary = (New-Color 237 192 83)
        Soft = (New-Color 255 241 202)
        Frame = (New-Color 237 192 83)
      }
    }
    'A' {
      return @{
        Primary = (New-Color 255 90 95)
        Soft = (New-Color 255 216 217)
        Frame = (New-Color 67 99 143)
      }
    }
    default {
      return @{
        Primary = (New-Color 77 200 193)
        Soft = (New-Color 201 255 247)
        Frame = (New-Color 73 162 168)
      }
    }
  }
}

function Draw-Pin {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$PinX,
    [double]$PinY,
    [hashtable]$Palette
  )

  $shadowBrush = [System.Drawing.SolidBrush]::new((New-Color 0 0 0 56))
  $triangleBrush = [System.Drawing.SolidBrush]::new($Palette.Primary)
  $circleBrush = [System.Drawing.SolidBrush]::new($Palette.Primary)
  $softBrush = [System.Drawing.SolidBrush]::new($Palette.Soft)
  $whitePen = [System.Drawing.Pen]::new((New-Color 255 255 255 255), 3)
  $crossPen = [System.Drawing.Pen]::new((New-Color 255 255 255 96), 2)

  try {
    $circleRadius = 18.0
    $headCenterY = $PinY - 40.0
    $triangleTopY = $PinY - 18.0
    $triangleHalfWidth = 14.0
    $crossRadius = 12.0
    $highlightRadius = 7.0

    $Graphics.FillEllipse($shadowBrush, [float]($PinX - 18), [float]($PinY - 8), 36, 20)

    $triangle = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new([float]$PinX, [float]$PinY),
      [System.Drawing.PointF]::new([float]($PinX - $triangleHalfWidth), [float]$triangleTopY),
      [System.Drawing.PointF]::new([float]($PinX + $triangleHalfWidth), [float]$triangleTopY)
    )
    $Graphics.FillPolygon($triangleBrush, $triangle)
    $Graphics.FillEllipse(
      $circleBrush,
      [float]($PinX - $circleRadius),
      [float]($headCenterY - $circleRadius),
      [float]($circleRadius * 2),
      [float]($circleRadius * 2)
    )
    $Graphics.DrawEllipse(
      $whitePen,
      [float]($PinX - $circleRadius),
      [float]($headCenterY - $circleRadius),
      [float]($circleRadius * 2),
      [float]($circleRadius * 2)
    )
    $Graphics.FillEllipse(
      $softBrush,
      [float]($PinX - $highlightRadius),
      [float]($headCenterY - $highlightRadius - 12),
      [float]($highlightRadius * 2),
      [float]($highlightRadius * 2)
    )
    $Graphics.DrawLine(
      $crossPen,
      [float]($PinX - $crossRadius),
      [float]$headCenterY,
      [float]($PinX + $crossRadius),
      [float]$headCenterY
    )
    $Graphics.DrawLine(
      $crossPen,
      [float]$PinX,
      [float]($headCenterY - $crossRadius),
      [float]$PinX,
      [float]($headCenterY + $crossRadius)
    )
  }
  finally {
    $shadowBrush.Dispose()
    $triangleBrush.Dispose()
    $circleBrush.Dispose()
    $softBrush.Dispose()
    $whitePen.Dispose()
    $crossPen.Dispose()
  }
}

$palette = Get-Palette -Rank $Rank
$bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$sourceImage = [System.Drawing.Image]::FromFile($ImagePath)
$backgroundBrush = [System.Drawing.SolidBrush]::new((New-Color 12 20 32 255))
$framePen = [System.Drawing.Pen]::new($palette.Frame, 4)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear((New-Color 7 13 24 255))

  $destRect = [System.Drawing.RectangleF]::new(
    [float]$MapX,
    [float]$MapY,
    [float]$MapWidth,
    [float]$MapHeight
  )

  $graphics.FillRectangle($backgroundBrush, $destRect)
  $graphics.DrawImage($sourceImage, $destRect)
  $graphics.DrawRectangle(
    $framePen,
    [float]$MapX,
    [float]$MapY,
    [float]$MapWidth,
    [float]$MapHeight
  )

  Draw-Pin -Graphics $graphics -PinX $PinX -PinY $PinY -Palette $palette

  $parent = Split-Path -Parent $OutputPath
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $backgroundBrush.Dispose()
  $framePen.Dispose()
  $sourceImage.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
