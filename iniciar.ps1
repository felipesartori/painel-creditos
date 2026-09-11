$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot

function Find-CommandOrNull($name) {
  try { return (Get-Command $name -ErrorAction Stop).Source } catch { return $null }
}

function Find-CodexPath($codexPaths) {
  foreach ($candidate in $codexPaths) {
    if (Test-Path -Path $candidate) { return $candidate }
  }
  return $null
}

function Find-CodexInFolder($base) {
  if (-not (Test-Path -Path $base)) { return $null }
  try {
    $items = Get-ChildItem -Path $base -Filter codex.exe -Recurse -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      if ($item.FullName -match '\\bin\\' -or $item.FullName -match '\\code\\') {
        return $item.FullName
      }
    }
  } catch { }
  return $null
}

$taskNode = Find-CommandOrNull node
if ([string]::IsNullOrWhiteSpace($taskNode)) {
  throw 'Node.js não encontrado no sistema. Instale Node.js ou adicione node.exe no PATH.'
}

$explicitCodex = @(
  (Join-Path $env:USERPROFILE 'AppData\Local\Programs\OpenAI\Codex\bin\codex.exe'),
  (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe'),
  (Join-Path $env:AppData 'Local\Programs\OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\codex\codex.exe'),
  (Join-Path $env:ProgramFiles 'OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'OpenAI\Codex\bin\7ac07f4ce733f89a\codex.exe')
)

$taskCodex = Find-CommandOrNull codex
if (-not $taskCodex) {
  $taskCodex = Find-CodexPath $explicitCodex
}
if (-not $taskCodex) {
  $scanned = @($env:LOCALAPPDATA, $env:PROGRAMFILES, ${env:ProgramFiles(x86)}, $env:USERPROFILE)
  foreach ($root in $scanned) {
    $found = Find-CodexInFolder $root
    if ($found) { $taskCodex = $found; break }
  }
}
if (-not $taskCodex) {
  throw 'codex não encontrado. Instale/atualize o Codex ou ajuste o caminho manualmente no iniciar.ps1.'
}
$env:CODEX_BINARY = $taskCodex
$env:CODEX_CLIENT_NAME = "codex_usage_monitor_$($env:USERNAME -replace '[^a-zA-Z0-9_-]', '_')"

$taskLocal = Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Path $taskLocal -Force | Out-Null

$existingPidPath = Join-Path $taskLocal 'server.pid'
if (Test-Path -Path $existingPidPath) {
  try {
    $existingPid = Get-Content -Path $existingPidPath -ErrorAction Stop
    $existingPid = [int]$existingPid
    $running = Get-Process -Id $existingPid -ErrorAction Stop
    if ($running) {
      Write-Host "Painel já está em execução (PID $existingPid)."
      Write-Host "Abra no celular: $((Get-Content (Join-Path $taskLocal 'links.json') -Raw | ConvertFrom-Json).celular[0])"
      return
    }
  } catch {
    Remove-Item -Path $existingPidPath -Force -ErrorAction SilentlyContinue
  }
}

$taskProcess = Start-Process -FilePath $taskNode -ArgumentList 'server.cjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLocal 'server.log') -RedirectStandardError (Join-Path $taskLocal 'server-error.log') -PassThru
$taskProcess.Id | Set-Content $existingPidPath
Start-Sleep -Seconds 2
if ($taskProcess.HasExited) { throw 'O painel não iniciou. Confira .local/server-error.log (talvez já esteja aberto.)' }

$taskLinks = Get-Content (Join-Path $taskLocal 'links.json') -Raw | ConvertFrom-Json
Write-Host 'No celular, conectado ao mesmo Wi-Fi, abra um destes links:'
$taskLinks.celular | ForEach-Object { Write-Host $_ }
Start-Process $taskLinks.local | Out-Null
