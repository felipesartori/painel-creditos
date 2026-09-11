param(
  [string]$TaskName = "PainelCreditos"
)

$ErrorActionPreference = 'Stop'

$taskScript = Join-Path $PSScriptRoot 'iniciar.ps1'
$psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

$argumentList = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$taskScript`""
$action = "`"$psExe`" $argumentList"

schtasks /Create /TN $TaskName /TR $action /SC ONLOGON /RL LIMITED /F /RU $env:USERNAME | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'O Windows não permitiu criar a tarefa de inicialização automática.' }

Write-Host "Agendamento criado com sucesso: $TaskName"
Write-Host "Ele vai iniciar o painel automaticamente ao fazer logon."
