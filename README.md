# Reserva — monitor de uso do Codex e Claude

Painel para celular ou computador. Consulta os limites reais da conta conectada no Codex instalado, através de `codex app-server` / `account/rateLimits/read`, e os limites da assinatura Claude através da sessão local do Claude Code. Não inicia conversas nem resgata resets. Codex e Claude aparecem lado a lado; Spark fica na faixa inferior.

Claude: consulta de leitura a cada dois minutos a `https://api.anthropic.com/api/oauth/usage`, endpoint usado pelo Claude Code instalado. As credenciais de `.claude/.credentials.json` são lidas apenas no servidor e nunca enviadas ao celular. A consulta não usa a API de geração nem consome tokens de modelo. Respostas 429 adiam novas tentativas por pelo menos cinco minutos. Os dados e o horário da última leitura são independentes do Codex; falhas mantêm a última leitura marcada como desatualizada. Para renovar uma sessão expirada, execute `claude auth login --claudeai` no computador. No macOS o Claude Code guarda as credenciais no Keychain (`Claude Code-credentials`), e é de lá que o painel as lê; nas demais plataformas, de `~/.claude/.credentials.json`. O painel relê as credenciais a cada consulta, sem editar o arquivo nem executar renovação por conta própria. O endpoint é interno e pode mudar. O painel mostra as janelas gerais de cinco horas e semanal; eventuais limites específicos de modelos permanecem nos dados da consulta.

## Abrir

No iPhone também é possível abrir `http://<IP-do-computador>:8788/painel` e digitar o código de oito números salvo em `.local/pairing-code`. O formulário redireciona para o endereço autenticado; crie o atalho da Tela de Início somente depois dessa etapa. Há um limite de cinco tentativas por minuto por endereço de rede. Endereços incompletos recebem uma página HTML de acesso, evitando que Safari antigo trate uma resposta sem tipo como download.

No macOS ou Linux, execute `./painel.sh start` nesta pasta. Os comandos são `start`, `stop`, `restart`, `status`, `links`, `instalar-auto` e `desativar-auto`. O `instalar-auto` cria um LaunchAgent em `~/Library/LaunchAgents/com.painelcreditos.plist`, que sobe o painel ao entrar no Mac; `desativar-auto` remove. Para encerrar sem o script, pare o processo do PID em `.local/server.pid`.

No Windows, execute `./setup.ps1` nesta pasta no PowerShell. O script detecta seu navegador padrão, aplica configuração para esse ambiente e usa a conta local do usuário logado no computador.
Requer Node.js e Codex instalados para o usuário atual. O painel roda em segundo plano; os links ficam em `.local/links.json`. Abra o link de celular na mesma rede Wi-Fi. Mantenha o computador ligado. Se o firewall bloquear, libere a porta TCP 8788 somente na rede privada e na sub-rede local.

## Usar em GitHub (instalação pública)

```powershell
# 1) Clonar
git clone https://github.com/andreuscalodiano-png/painel-creditos.git
cd painel-creditos

# 2) Setup pessoal (rodar uma vez)
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Se você não quiser auto-start automático:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -NoAutoStart
```

`setup.ps1` também grava `browser-profile.json` em `.local/`, com o diagnóstico do navegador padrão do usuário para facilitar suporte.

O servidor consulta a conta a cada 60 segundos; a página verifica novas leituras a cada 15 segundos. O botão Atualizar busca a última leitura do servidor, sem aumentar a frequência de consultas ao Codex. Falhas preservam a última leitura, marcada como desatualizada. Horários de renovação são apresentados no fuso do dispositivo; chegar ao horário não redefine artificialmente o saldo.

O acesso aos dados usa uma chave aleatória no caminho `/painel/<chave>/`, preservado ao criar um atalho na Tela de Início. O painel recupera o acesso desse endereço mesmo sem fragmento ou armazenamento de sessão; links antigos com fragmento continuam funcionando no Safari. O servidor valida a chave e não registra URLs de acesso. A política no-referrer impede seu envio como referência a outros sites. Os arquivos `.local/` e links de acesso não devem ser publicados ou encaminhados a terceiros. Este servidor foi feito para rede local, sem abertura de portas do roteador. A autenticação OpenAI permanece no computador e não é enviada ao celular.

Para usuários dessa versão pública, o identificador do cliente enviado ao Codex vem de `CODEX_CLIENT_NAME` (ou `codex_usage_monitor_<USUARIO>` por padrão), então cada pessoa usa sua própria conta local sem ajustar scripts.

O modo de mesa amplia os números e tenta ativar tela cheia e Wake Lock. Em HTTP pelo Wi-Fi, o navegador pode não oferecer Wake Lock: nesse caso, o painel orienta desativar o bloqueio automático nas configurações do celular.

No Safari do iPhone, use Compartilhar → Adicionar à Tela de Início e abra o ícone criado para usar sem barras do navegador. A v4 usa JavaScript ES5, XMLHttpRequest e appendChild; o carregamento de dados independe das funções opcionais de tela cheia. O teste de compatibilidade reproduz a ausência de Element.append, mas não substitui uma verificação no aparelho real. O arquivo boot.js informa falhas de inicialização na tela.

No Windows, para encerrar, confira o PID de `.local/server.pid` e pare esse processo Node no Gerenciador de Tarefas. O setup tenta configurar a inicialização ao entrar no Windows; confira a mensagem de sucesso. Para desativá-la, desabilite a tarefa `PainelCreditos` no Agendador de Tarefas. Para uso via terminal: `npm start`. Validação: `npm test`.

Contas Codex: o servidor consulta todas as pastas `~/.codex*` que tenham `auth.json`, uma por conta, e mostra um cartão por conta identificado pelo e-mail do login. Para fixar a lista, defina `CODEX_HOMES` com os caminhos separados por vírgula. Uma conta sem login não impede a leitura das demais. O total de resets disponíveis no rodapé é a soma das contas, com a divisão por conta logo abaixo quando há mais de uma.

Cursor: consulta de leitura a `https://cursor.com/api/usage-summary` a cada dois minutos, com o token de sessão do `cursor-agent` (variável `CURSOR_ACCESS_TOKEN`, arquivo em `CURSOR_TOKEN_FILE` ou, no macOS, o item `cursor-access-token` do Keychain) e o `authId` de `~/.cursor/cli-config.json`. Mostra o consumo do ciclo mensal e dos créditos avulsos. Para renovar uma sessão expirada, faça login novamente com o `cursor-agent` no computador.

Cada cartão tem um `×` que o oculta até o horário de renovação daquela conta, e depois disso ele volta sozinho. A escolha fica salva no próprio aparelho, então cada celular ou computador vê o que quiser; o botão "Mostrar todas" traz de volta antes da renovação.

No Codex e no Cursor o número grande é o saldo que resta, caindo até 0. No Claude é o consumo, subindo até 100%, para bater com o que o `claude` mostra no terminal; nos dois casos a outra leitura aparece na linha de baixo. Nas barras, a cor indica a faixa do que resta (verde, âmbar abaixo de 25% e vermelho abaixo de 10%) e o traço vertical marca o andamento do período: barra à frente do traço significa folga em relação ao reset, atrás dele significa gasto adiantado.

Limites da assinatura, créditos extras e resets são informações distintas. Valores não informados aparecem como indisponíveis, nunca como zero. O protocolo do app-server é experimental e pode requerer ajustes após atualizações do Codex.
