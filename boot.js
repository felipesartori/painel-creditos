(function () {
  function fail(message) {
    var status = document.getElementById('status'), notice = document.getElementById('notice');
    if (status) status.textContent = 'Falha ao iniciar · v4';
    if (notice) { notice.hidden = false; notice.textContent = message; }
    if (document.body) document.body.className += ' has-notice';
  }
  window.addEventListener('error', function (event) {
    if (!window.reservaStarted) fail('O navegador não iniciou o painel. Detalhe: ' + (event.message || 'arquivo não carregado') + '. Atualize esta página pelo Safari.');
  });
  window.setTimeout(function () {
    if (!window.reservaStarted) fail('O código do painel v4 não carregou. Reabra o link atualizado da conversa.');
  }, 12000);
}());
