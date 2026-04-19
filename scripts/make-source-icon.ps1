Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Transparent background
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded square background gradient
$pad = 56
$rect = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))
$radius = 200
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF($rect.X, $rect.Y)),
    (New-Object System.Drawing.PointF($rect.Right, $rect.Bottom)),
    [System.Drawing.Color]::FromArgb(255, 14, 22, 41),
    [System.Drawing.Color]::FromArgb(255, 30, 58, 110)
)
$g.FillPath($brush, $path)

# Outer subtle border
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 125, 211, 252), 4)
$g.DrawPath($pen, $path)

# Outer accent ring (gauge)
$ringRect = New-Object System.Drawing.Rectangle(220, 220, 584, 584)
$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 96, 165, 250), 36)
$ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawArc($ringPen, $ringRect, 0, 360)

# Active gradient arc (~70% sweep)
$arcBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF($ringRect.X, $ringRect.Y)),
    (New-Object System.Drawing.PointF($ringRect.Right, $ringRect.Bottom)),
    [System.Drawing.Color]::FromArgb(255, 96, 165, 250),
    [System.Drawing.Color]::FromArgb(255, 125, 211, 252)
)
$arcPen = New-Object System.Drawing.Pen($arcBrush, 36)
$arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawArc($arcPen, $ringRect, -90, 252)

# Inner glow disc
$innerRect = New-Object System.Drawing.Rectangle(310, 310, 404, 404)
$innerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF($innerRect.X, $innerRect.Y)),
    (New-Object System.Drawing.PointF($innerRect.Right, $innerRect.Bottom)),
    [System.Drawing.Color]::FromArgb(40, 96, 165, 250),
    [System.Drawing.Color]::FromArgb(80, 14, 22, 41)
)
$g.FillEllipse($innerBrush, $innerRect)

# Center "C" mark
$font = New-Object System.Drawing.Font("Segoe UI", 280, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 232, 238, 252))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF(0, -20, $size, $size)
$g.DrawString("C", $font, $textBrush, $textRect, $format)

$out = Join-Path $PSScriptRoot "..\src-tauri\icons\source.png"
$outDir = Split-Path $out
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Wrote $out"
