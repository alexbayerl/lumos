<#
.SYNOPSIS
  Creates Start Menu (and optionally Desktop) shortcuts that launch the
  locally-built Cursor Usage Overlay executable.

.DESCRIPTION
  Use this when you've built the app yourself with `npm run tauri build` and
  want fast access via Start menu / Win+S without going through the NSIS
  installer. The shortcuts point straight at the release exe in
  `src-tauri\target\release\cursor_usage_overlay.exe` and use the app's
  generated `.ico` so it looks identical to an installed copy.

  Per-user only -- no admin rights needed.

.PARAMETER Desktop
  Also drop a shortcut on the Desktop.

.PARAMETER Pin
  Print the (manual) command to pin the shortcut to taskbar/Start. Windows
  has intentionally no scriptable pinning API, so we surface the manual step.

.PARAMETER Uninstall
  Remove the shortcuts created by this script.

.EXAMPLE
  pwsh ./scripts/install-start-menu.ps1
  # Creates Start menu entry "Cursor Usage Overlay"

.EXAMPLE
  pwsh ./scripts/install-start-menu.ps1 -Desktop
  # Start menu + Desktop shortcut

.EXAMPLE
  pwsh ./scripts/install-start-menu.ps1 -Uninstall
  # Removes the shortcuts (does not touch your build artefacts)
#>

[CmdletBinding()]
param(
    [switch]$Desktop,
    [switch]$Pin,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$AppName    = 'Cursor Usage Overlay'
$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExeName    = 'cursor_usage_overlay.exe'
$ExePath    = Join-Path $RepoRoot ('src-tauri\target\release\' + $ExeName)
$IconPath   = Join-Path $RepoRoot 'src-tauri\icons\icon.ico'
$StartMenu  = [Environment]::GetFolderPath('Programs')              # per-user Start menu
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$LinkName   = "$AppName.lnk"
$StartLink  = Join-Path $StartMenu  $LinkName
$DeskLink   = Join-Path $DesktopDir $LinkName

function New-Shortcut {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Target,
        [string]$Icon,
        [string]$WorkingDirectory,
        [string]$Description
    )
    # WScript.Shell is the most compatible way to author .lnk files from PS.
    $shell    = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath       = $Target
    if ($WorkingDirectory) { $shortcut.WorkingDirectory = $WorkingDirectory }
    if ($Description)      { $shortcut.Description      = $Description }
    if ($Icon)             { $shortcut.IconLocation     = "$Icon,0" }
    $shortcut.Save()
}

if ($Uninstall) {
    foreach ($p in @($StartLink, $DeskLink)) {
        if (Test-Path -LiteralPath $p) {
            Remove-Item -LiteralPath $p -Force
            Write-Host "Removed $p" -ForegroundColor Yellow
        }
    }
    Write-Host "Done." -ForegroundColor Green
    return
}

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Error @"
Could not find the built executable:
  $ExePath

Build the release bundle first:
  npm install
  npm run tauri build

Then re-run this script.
"@
}

if (-not (Test-Path -LiteralPath $IconPath)) {
    Write-Warning "Icon not found at $IconPath -- shortcut will use the exe's embedded icon."
    $IconArg = $null
} else {
    $IconArg = $IconPath
}

# Make sure the per-user Start menu programs folder exists (it always should).
if (-not (Test-Path -LiteralPath $StartMenu)) {
    New-Item -ItemType Directory -Path $StartMenu -Force | Out-Null
}

New-Shortcut `
    -Path $StartLink `
    -Target $ExePath `
    -Icon $IconArg `
    -WorkingDirectory (Split-Path $ExePath -Parent) `
    -Description 'Live overlay for Cursor plan usage with predictive forecasts.'
Write-Host "Created Start menu shortcut: $StartLink" -ForegroundColor Green

if ($Desktop) {
    New-Shortcut `
        -Path $DeskLink `
        -Target $ExePath `
        -Icon $IconArg `
        -WorkingDirectory (Split-Path $ExePath -Parent) `
        -Description 'Live overlay for Cursor plan usage with predictive forecasts.'
    Write-Host "Created Desktop shortcut:    $DeskLink" -ForegroundColor Green
}

Write-Host ""
Write-Host "Launch it from Start menu / Win+S -> ""$AppName""." -ForegroundColor Cyan

if ($Pin) {
    Write-Host ""
    Write-Host "To pin: open Start, find ""$AppName"", right-click -> Pin to Start / Pin to taskbar." -ForegroundColor DarkGray
    Write-Host "(Windows intentionally exposes no scriptable pin API for end-user safety.)" -ForegroundColor DarkGray
}
