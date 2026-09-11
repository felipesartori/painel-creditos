param(
  [string]$TaskName = 'PainelCreditos',
  [switch]$NoAutoStart,
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Get-DefaultBrowser {
  $browserMap = @{
    'ChromeHTML' = 'Google Chrome';
    'MSEdgeHTM' = 'Microsoft Edge';
    'FirefoxURL' = 'Mozilla Firefox';
    'IE.HTTP' = 'Internet Explorer (legacy)';
    'SafariHTML' = 'Safari';
    'SafariURL' = 'Safari';
    'Opera.Protocol' = 'Opera';
    'BraveBrowser' = 'Brave';
  }
  try {
    $choicePath = 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice'
    $progId = (Get-ItemProperty -Path $choicePath -Name ProgId -ErrorAction Stop).ProgId
    if ($browserMap.ContainsKey($progId)) { return $browserMap[$progId] }
    if ($progId) {
      return ($progId -replace '.*\\', '')
    }
  } catch {}

  try {
    $httpsChoice = 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice'
    $httpsId = (Get-ItemProperty -Path $httpsChoice -Name ProgId -ErrorAction Stop).ProgId
    if ($browserMap.ContainsKey($httpsId)) { return $browserMap[$httpsId] }
  } catch {}

  return 'Navegador padrão não identificado'
}

function Write-BrowserProfile {
  param([string]$Browser)

  $profile = [pscustomobject]@{
    user = $env:USERNAME
    detectedBrowser = $Browser
    preparedAt = (Get-Date -Format s)
    osVersion = [Environment]::OSVersion.VersionString
  }

  $path = Join-Path $PSScriptRoot '.local'
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  ($profile | ConvertTo-Json -Compress) | Set-Content -Path (Join-Path $path 'browser-profile.json')
}

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$browser = Get-DefaultBrowser
Write-Host "Instalação detectou navegador padrão: $browser"
Write-Host 'Esse projeto adapta o painel no carregamento conforme o navegador detectado no celular/desktop.'

$diagnostics = @"
Pré-instalação concluída para usuário: $env:USERNAME
Navegador padrão detectado: $browser
URL do painel será gerada em seguida com a conta local do usuário.
"@
Write-Host $diagnostics

Write-BrowserProfile -Browser $browser

if ($browser -like '*Safari*') {
  Write-Host 'Ajuste aplicado: no Safari móvel o painel prioriza modo de compatibilidade e uso via Atalho na tela inicial.'
}

& (Join-Path $PSScriptRoot 'iniciar.ps1')

if (-not $NoAutoStart) {
  try {
    & (Join-Path $PSScriptRoot 'instalar-auto.ps1') -TaskName $TaskName
    Write-Host "Auto-start automático habilitado para $TaskName."
  } catch {
    Write-Host 'Não foi possível habilitar auto-start automático. Você pode rodar .\instalar-auto.ps1 depois.'
  }
}

if ($OpenBrowser) {
  $taskLinks = Get-Content -Path (Join-Path $PSScriptRoot '.local\links.json') -Raw | ConvertFrom-Json
  Start-Process $taskLinks.local
}
