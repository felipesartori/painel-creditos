/* ES5: support older iPhone Safari without append, promises or async syntax. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var accessPath = /^\/painel\/([a-f0-9]{48})\/?$/.exec(location.pathname);
  var token = accessPath ? accessPath[1] : location.hash.slice(1), snapshot = null, networkError = false;
  var inFlight = false, lastRender = '', desk = false, wakeLock = null;
  var browserProfile = null;
  try { token = token || sessionStorage.getItem('reserva-token') || ''; if (token) sessionStorage.setItem('reserva-token', token); } catch (ignore) {}
  // Home Screen shortcuts use the access path; old fragment links still work.
  function detectBrowser() {
    var ua = navigator.userAgent || '';
    var nav = navigator;
    var isIOS = /iP(hone|od|ad)/i.test(ua) || /iPad|iPod|iPhone/i.test((nav.platform || ''));
    var isSafari = isIOS && /Safari\//.test(ua) && /AppleWebKit\//.test(ua) && !/(Chrome|CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
    var safariVersion = parseInt((/Version\/(\d+)/.exec(ua) || ['0', '0'])[1], 10);
    var legacySafari = isSafari && safariVersion > 0 && safariVersion <= 10;
    var isChrome = /Chrome\/|CriOS\//i.test(ua) || /Edg\//i.test(ua);
    var isFirefox = /Firefox\/|FxiOS\//i.test(ua);
    var isAndroid = /Android/i.test(ua);
    var canFullscreen = false;
    var root = document.documentElement;
    if (root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen) { canFullscreen = true; }
    return {
      isIOS: isIOS,
      isSafari: isSafari,
      isLegacySafari: legacySafari,
      safariVersion: isNaN(safariVersion) ? null : safariVersion,
      isChrome: isChrome,
      isFirefox: isFirefox,
      isAndroid: isAndroid,
      canFullscreen: canFullscreen && !legacySafari,
      canWakeLock: !!(nav.wakeLock && typeof nav.wakeLock.request === 'function'),
      ua: ua
    };
  }
  function applyBrowserProfile(profile) {
    browserProfile = profile;
    var classes = [];
    if (profile.isIOS) classes.push('browser-ios');
    if (profile.isAndroid) classes.push('browser-android');
    if (profile.isSafari) classes.push('browser-safari');
    if (profile.isLegacySafari) classes.push('browser-legacy-safari');
    if (profile.isChrome) classes.push('browser-chrome');
    if (profile.isFirefox) classes.push('browser-firefox');
    if (classes.length) document.body.className += ' ' + classes.join(' ');
    if (profile.isLegacySafari && !navigator.standalone) {
      var message = 'Safari antigo detectado: para melhor visual, use "Adicionar à Tela de Início".';
      var notice = $('notice');
      if (notice && !notice.textContent) { notice.textContent = message; notice.hidden = false; }
      document.body.className += ' safari-legacy-mode';
    }
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) parent.appendChild(arguments[i]); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function toggle(e, cls, on) { if (on) e.classList.add(cls); else e.classList.remove(cls); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function time(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function dateTime(seconds) { var d = new Date(seconds * 1000); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function countdown(n) {
    if (!n) return 'Horário indisponível';
    var s = Math.max(0, Math.floor(n - Date.now() / 1000));
    if (!s) return 'Aguardando renovação';
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return (d ? d + 'd ' : '') + h + 'h ' + m + 'min';
  }
  function windowName(w) { return w.label || (w.minutes === 10080 ? 'Limite semanal' : w.minutes === 300 ? 'Janela de 5 horas' : w.minutes ? 'Janela de ' + w.minutes + ' minutos' : 'Limite da conta'); }
  // Provedores HTTP extras (Claude, Cursor): mesmo formato de bucket, cada um com seu estado de leitura.
  var PROVIDERS = [
    {key:'claude', mark:'✳', fallback:{id:'claude',name:'Claude',windows:[{minutes:300,remaining:null,used:null},{minutes:10080,remaining:null,used:null}]}, loading:'Consultando limites Claude…', maxWindows:2},
    {key:'cursor', mark:'▸', optional:true, fallback:{id:'cursor',name:'Cursor',windows:[{label:'Ciclo mensal',remaining:null,used:null}]}, loading:'Consultando limites Cursor…', maxWindows:2}
  ];
  function render(data, states) {
    var host = $('buckets'), credits = null;
    var displayBuckets = [], spark = null;
    for (var d = 0; d < data.buckets.length; d++) {
      if (data.buckets[d].id === 'codex_bengalfox') spark = data.buckets[d];
      else displayBuckets.push(data.buckets[d]);
    }
    var extras = {};
    for (var p = 0; p < PROVIDERS.length; p++) {
      var provider = PROVIDERS[p], pState = states && states[provider.key];
      if (provider.optional && !pState) continue;
      var stale = !pState || !pState.updatedAt || !!pState.error || Date.now() - pState.updatedAt > 300000;
      var bucket = (pState && pState.data) || provider.fallback;
      extras[bucket.id] = {provider:provider, state:pState, stale:stale};
      displayBuckets.push(bucket);
    }
    var sparkText = [];
    if(spark) for(var s=0;s<spark.windows.length;s++) sparkText.push((spark.windows[s].minutes===300?'5h: ':'Semana: ')+(spark.windows[s].remaining==null?'—':spark.windows[s].remaining+'%'));
    if($('spark-summary')) $('spark-summary').textContent = sparkText.length?sparkText.join(' · '):'Limites indisponíveis';
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!data.buckets.length) add(host, el('p', 'notice', 'Limites Codex indisponíveis nesta leitura.'));
    for (var b = 0; b < displayBuckets.length; b++) {
      var bucket = displayBuckets[b], extra = extras[bucket.id] || null, isExtra = Boolean(extra);
      var extraStale = isExtra && extra.stale;
      var card = el('article', 'meter' + (bucket.id === 'codex' ? '' : ' compact') + (isExtra?' claude-meter':'') + (extraStale?' provider-stale':''));
      if (bucket.id === 'codex') credits = bucket.credits;
      var head = el('div', 'provider');
      var tag = isExtra ? (extraStale ? 'Aguardando' : time(extra.state.updatedAt)) : bucket.plan ? 'Plano ' + bucket.plan : 'Codex';
      add(head, el('span', 'provider-mark', isExtra?extra.provider.mark:'⌘'), el('h2', '', bucket.name), el('span', 'tag', tag)); add(card, head);
      if(extraStale){var note=el('p','provider-note',(extra.state&&extra.state.error)||extra.provider.loading);add(card,note);}
      if (bucket.blocked) add(card, el('p', 'notice', 'Limite atingido. Confira a conta no Codex.'));
      var windows = el('div', 'windows');
      if (!bucket.windows.length) add(windows, el('p', 'muted', 'Limites indisponíveis.'));
      for (var j = 0; j < bucket.windows.length && (!isExtra || j < extra.provider.maxWindows); j++) {
        var w = bucket.windows[j], section = el('div', 'window'), reading = el('div', 'reading');
        add(section, el('span', 'window-title', windowName(w)));
        var big = el('div', 'big', w.remaining == null ? '—' : String(w.remaining));
        add(big, el('span', '', '%')); add(reading, big, el('span', 'available', 'disponível')); add(section, reading);
        var bar = el('div', 'segments'); bar.setAttribute('role', 'meter'); bar.setAttribute('aria-label', windowName(w) + ' disponível'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
        if (w.remaining != null) bar.setAttribute('aria-valuenow', w.remaining);
        for (var k = 0; k < 25; k++) {
          var segment = el('span', 'segment'), fill = el('i');
          fill.style.width = Math.max(0, Math.min(100, ((w.remaining || 0) - k * 4) * 25)) + '%';
          if (w.remaining != null && w.remaining <= 10) fill.style.background = '#ff9a9d'; else if (w.remaining != null && w.remaining <= 25) fill.style.background = '#f8cd7e';
          add(segment, fill); add(bar, segment);
        }
        add(section, bar);
        var meta = el('div', 'meter-meta'); add(meta, el('span', '', w.used == null ? 'Uso indisponível' : w.used + '% utilizado'), el('span', '', w.resetsAt ? 'Renova ' + dateTime(w.resetsAt) : 'Renovação indisponível')); add(section, meta);
        var reset = el('div', 'reset-line'), count = el('strong', '', countdown(w.resetsAt));
        if (w.resetsAt) count.setAttribute('data-reset', w.resetsAt);
        add(reset, el('span', '', 'Tempo até renovar'), count); add(section, reset); add(windows, section);
      }
      add(card, windows); add(host, card);
    }
    $('resets').textContent = data.resets == null ? '—' : data.resets;
    $('credits').textContent = credits && credits.unlimited ? 'Ilimitado' : credits && credits.balance != null ? credits.balance : '—';
    resizePanel();
  }
  function updateStatus() {
    var age = snapshot && snapshot.updatedAt ? Date.now() - snapshot.updatedAt : Infinity;
    var stale = networkError || Boolean(snapshot && snapshot.error) || age > 150000;
    toggle(document.body, 'stale', stale); toggle($('status'), 'live', !stale);
    $('status').textContent = snapshot && snapshot.updatedAt ? (stale ? 'Leitura desatualizada' : 'Conectado') + ' · ' + time(snapshot.updatedAt) : 'Aguardando leitura · v4';
    var notice = !token ? 'Acesso ausente. Abra novamente o link completo do painel enviado na conversa.' : networkError ? 'Não foi possível atualizar. Confira o Wi-Fi e o computador.' : (snapshot && snapshot.error) || (age > 150000 && snapshot && snapshot.updatedAt ? 'Leitura desatualizada. Tentando reconectar…' : '');
    $('notice').textContent = notice; $('notice').hidden = !notice; toggle(document.body, 'has-notice', Boolean(notice));
    var claude = snapshot && snapshot.claude;
    if(claude&&$('wake-status')) $('wake-status').textContent = claude.error || (claude.updatedAt?'Claude atualizado às '+time(claude.updatedAt):'Consultando Claude…');
  }
  function refresh() {
    if (inFlight) return;
    if (!token) { updateStatus(); return; }
    inFlight = true; $('refresh').disabled = true;
    function finish() { inFlight = false; $('refresh').disabled = false; updateStatus(); }
    try {
      var request = new XMLHttpRequest(); request.open('GET', '/api/usage', true); request.timeout = 10000; request.setRequestHeader('Authorization', 'Bearer ' + token);
      request.onload = function () {
        try {
          if (request.status === 401) { token = ''; try { sessionStorage.removeItem('reserva-token'); } catch (ignore) {} throw new Error('access'); }
          if (request.status !== 200) throw new Error('network');
          snapshot = JSON.parse(request.responseText); networkError = false;
          var signature = JSON.stringify([snapshot.data,snapshot.claude,snapshot.cursor]);
          if (signature !== lastRender) { render(snapshot.data || {buckets:[],resets:null},snapshot); lastRender = signature; }
        } catch (error) { networkError = true; }
        finish();
      };
      request.onerror = request.ontimeout = request.onabort = function () { networkError = true; finish(); };
      request.send();
    } catch (error) { networkError = true; finish(); }
  }
  function resizePanel() {
    var height = window.innerHeight;
    document.documentElement.style.setProperty('--screen-height', height + 'px');
    document.documentElement.style.setProperty('--desk-number-size', Math.max(30, Math.min(88, (height - 184) * 0.85)) + 'px');
    document.documentElement.style.setProperty('--desk-small-number-size', Math.max(25, Math.min(56, (height - 184) * 0.6)) + 'px');
    var windows = document.querySelectorAll('.window');
    for (var i = 0; i < windows.length; i++) {
      var reading = windows[i].querySelector('.reading'), number = windows[i].querySelector('.big');
      if (window.innerWidth > height && height <= 500 && window.innerWidth <= 1000) {
        var compact = windows[i].parentNode.parentNode.className.indexOf('compact') !== -1;
        var available = reading.getBoundingClientRect().height;
        number.style.fontSize = Math.max(16, Math.min(compact ? 56 : 88, available - (compact ? 12 : 4))) + 'px';
      } else { number.style.fontSize = ''; }
    }
  }
  function tick() {
    var now = new Date(); $('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    $('date').textContent = pad(now.getDate()) + '/' + pad(now.getMonth() + 1);
    var counts = document.querySelectorAll('[data-reset]');
    for (var i = 0; i < counts.length; i++) counts[i].textContent = countdown(Number(counts[i].getAttribute('data-reset')));
    updateStatus();
  }
  applyBrowserProfile(detectBrowser());
  // Start data loading before optional fullscreen controls.
  tick(); refresh(); resizePanel(); window.reservaStarted = true;
  setInterval(tick, 1000); setInterval(refresh, 15000);
  $('refresh').addEventListener('click', refresh);
  window.addEventListener('resize', resizePanel); window.addEventListener('orientationchange', resizePanel);
  function help() { if ($('fullscreen-help')) $('fullscreen-help').hidden = false; }
  function keepAwake() {
    if (!desk || !browserProfile || !browserProfile.canWakeLock || !window.isSecureContext) return;
    try { navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }, function () {}); } catch (ignore) {}
  }
  $('desk').addEventListener('click', function () {
    desk = !desk; toggle(document.body, 'desk', desk); $('desk').textContent = desk ? 'Sair do modo mesa' : 'Modo mesa';
    if (desk) {
      var root = document.documentElement, enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (enter && browserProfile && browserProfile.canFullscreen) { try { var result = enter.call(root); if (result && result.then) result.then(resizePanel, help); } catch (ignore) { help(); } }
      else if (!navigator.standalone) help();
      keepAwake();
    } else {
      if (wakeLock) { wakeLock.release(); wakeLock = null; }
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      if ($('fullscreen-help')) $('fullscreen-help').hidden = true;
    }
    resizePanel();
  });
  if ($('close-help')) $('close-help').addEventListener('click', function () { $('fullscreen-help').hidden = true; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { refresh(); keepAwake(); } });
}());
