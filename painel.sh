#!/bin/bash
# Equivalente macOS/Linux dos scripts .ps1: sobe, para e instala o painel no login.
set -euo pipefail
cd "$(dirname "$0")"
LOCAL=".local"
PID_FILE="$LOCAL/server.pid"
PLIST="$HOME/Library/LaunchAgents/com.painelcreditos.plist"
mkdir -p "$LOCAL"

rodando() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }

start() {
  command -v node >/dev/null || { echo 'Node.js nao encontrado no PATH.'; exit 1; }
  command -v codex >/dev/null || echo 'Aviso: codex nao encontrado no PATH; o bloco Codex vai falhar.'
  if rodando; then echo "Painel ja esta em execucao (PID $(cat "$PID_FILE"))."; links; return; fi
  CODEX_CLIENT_NAME="${CODEX_CLIENT_NAME:-codex_usage_monitor_$USER}" \
    nohup node server.cjs >"$LOCAL/server.log" 2>"$LOCAL/server-error.log" &
  echo $! > "$PID_FILE"
  sleep 2
  rodando || { echo 'O painel nao iniciou. Confira .local/server-error.log'; exit 1; }
  links
}

stop() {
  rodando || { echo 'Painel nao esta em execucao.'; rm -f "$PID_FILE"; return; }
  kill "$(cat "$PID_FILE")" && rm -f "$PID_FILE"
  echo 'Painel encerrado.'
}

links() {
  [ -f "$LOCAL/links.json" ] || { echo 'Links ainda nao gerados.'; return; }
  echo 'Links de acesso:'
  node -e 'const l=require("./.local/links.json");console.log(l.local);l.celular.forEach(x=>console.log(x))'
}

status() {
  if rodando; then echo "Em execucao (PID $(cat "$PID_FILE"))."; links; else echo 'Parado.'; fi
}

instalar_auto() {
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.painelcreditos</string>
  <key>ProgramArguments</key><array><string>$(command -v node)</string><string>$PWD/server.cjs</string></array>
  <key>WorkingDirectory</key><string>$PWD</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$(command -v node)"):$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>CODEX_CLIENT_NAME</key><string>codex_usage_monitor_$USER</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PWD/$LOCAL/server.log</string>
  <key>StandardErrorPath</key><string>$PWD/$LOCAL/server-error.log</string>
</dict></plist>
PL
  launchctl bootout "gui/$UID/com.painelcreditos" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$PLIST"
  echo "Auto-start habilitado ($PLIST). Para desativar: ./painel.sh desativar-auto"
}

desativar_auto() {
  launchctl bootout "gui/$UID/com.painelcreditos" 2>/dev/null || true
  rm -f "$PLIST"
  echo 'Auto-start desativado.'
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop || true; start ;;
  status) status ;;
  links) links ;;
  instalar-auto) instalar_auto ;;
  desativar-auto) desativar_auto ;;
  *) echo 'Uso: ./painel.sh [start|stop|restart|status|links|instalar-auto|desativar-auto]'; exit 1 ;;
esac
