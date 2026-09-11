const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {readClaude}=require('./claude-usage.cjs');
const {readCursor}=require('./cursor-usage.cjs');
const ROOT = __dirname;
const defaultClientName = process.env.CODEX_CLIENT_NAME || `codex_usage_monitor_${(process.env.USERNAME || process.env.USER || 'user').replace(/[^a-zA-Z0-9_-]/g, '_')}`;

function normalize(raw) {
  const map = raw.rateLimitsByLimitId;
  const buckets = map && Object.keys(map).length ? Object.values(map) : [raw.rateLimits];
  return {
    buckets: buckets.filter(Boolean).map(b => ({
      id: b.limitId || 'codex', name: b.limitName || 'Codex', plan: b.planType || null,
      blocked: Boolean(b.rateLimitReachedType || b.spendControlReached),
      windows: [b.primary,b.secondary].filter(Boolean).map(w => ({
        used: Number.isFinite(w.usedPercent) ? Math.max(0,Math.min(100,w.usedPercent)) : null,
        remaining: Number.isFinite(w.usedPercent) ? Math.max(0,Math.min(100,100-w.usedPercent)) : null,
        minutes: w.windowDurationMins ?? null, resetsAt: w.resetsAt ?? null
      })),
      credits: b.credits ? {balance:b.credits.balance ?? null,unlimited:b.credits.unlimited} : null
    })).sort((a,b) => (a.id==='codex'?-1:0)-(b.id==='codex'?-1:0)),
    resets: raw.rateLimitResetCredits?.availableCount ?? null
  };
}

// Cada conta Codex é um CODEX_HOME separado. Sem CODEX_HOMES definido, descobre ~/.codex* com auth.json.
function listCodexHomes() {
  const userHome = process.env.USERPROFILE || os.homedir();
  const configured = (process.env.CODEX_HOMES || process.env.CODEX_HOME || '').split(/[,:]/).map(x=>x.trim()).filter(Boolean);
  if (configured.length) return configured;
  const main = path.join(userHome,'.codex');
  let entries=[];
  try{entries=fs.readdirSync(userHome);}catch{}
  const found = entries.filter(name=>/^\.codex/.test(name))
    .map(name=>path.join(userHome,name))
    .filter(dir=>fs.existsSync(path.join(dir,'auth.json')))
    .sort((a,b)=>(a===main?-1:0)-(b===main?-1:0)||a.localeCompare(b));
  return found.length ? found : [main];
}

// Nome amigável da conta: e-mail do id_token quando existir, senão o nome do diretório.
function accountLabel(home) {
  try {
    const token = JSON.parse(fs.readFileSync(path.join(home,'auth.json'),'utf8')).tokens?.id_token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
    if (payload.email) return payload.email;
  } catch {}
  return path.basename(home);
}

function readLimits(codexHome) {
  return new Promise((resolve,reject) => {
    const userHome = process.env.USERPROFILE || os.homedir();
    const child = spawn(process.env.CODEX_BINARY || 'codex', ['app-server','--stdio'], {
      windowsHide:true, cwd:ROOT,
      env:{...process.env,HOME:userHome,CODEX_HOME:codexHome || process.env.CODEX_HOME || path.join(userHome,'.codex')}
    });
    let buffer='',finished=false;
    const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('Consulta demorou mais que o esperado.')),25000);
    const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
    child.on('error',()=>finish(new Error('Codex não encontrado. Abra o Codex neste computador.')));
    child.on('exit',()=>finish(new Error('A consulta do Codex foi encerrada.')));
    child.stdin.on('error',()=>finish(new Error('Não foi possível consultar o Codex.')));
    // Drain stderr, without storing credentials or internal diagnostic output.
    child.stderr.resume();
    child.stdout.on('data',d=>{
      buffer+=d;let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let message;
        try{message=JSON.parse(line);}catch{continue;}
        if(message.id===1){
          if(message.error){finish(new Error('Não foi possível iniciar a consulta.'));return;}
          send({method:'initialized'});
          send({id:2,method:'account/rateLimits/read',params:null});
        }
        if(message.id===2){
          if(message.error)finish(new Error('Não foi possível ler os limites. Confira o login no Codex do computador.'));
          else if(!message.result?.rateLimits)finish(new Error('O Codex retornou uma resposta indisponível.'));
          else finish(null,normalize(message.result));
        }
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:defaultClientName,version:'1.0.0'},capabilities:{experimentalApi:true}}});
  });
}

// Junta as contas em uma lista só de buckets, prefixando ids para não colidir entre contas.
function mergeAccounts(results) {
  const buckets=[], errors=[];
  let resets=null;
  results.forEach(({home,label,value,error},index)=>{
    if(error){errors.push(label+': '+error);return;}
    if(Number.isFinite(value.resets))resets=(resets||0)+value.resets;
    for(const bucket of value.buckets){
      const primary=index===0&&bucket.id==='codex';
      buckets.push({...bucket,
        id:primary?bucket.id:bucket.id+'@'+path.basename(home),
        account:label,
        // Os resets são da conta, não do limite: só o bucket principal dela os carrega.
        resets:bucket.id==='codex'?value.resets??null:null,
        name:results.length>1?label:bucket.name});
    }
  });
  if(!buckets.length&&errors.length)throw new Error(errors.join(' · '));
  return {buckets,resets,errors};
}

async function readAllAccounts() {
  const homes=listCodexHomes();
  const results=await Promise.all(homes.map(async home=>{
    const label=accountLabel(home);
    try{return {home,label,value:await readLimits(home)};}
    catch(error){return {home,label,error:error.message};}
  }));
  return mergeAccounts(results);
}

function start() {
  const local=path.join(ROOT,'.local');fs.mkdirSync(local,{recursive:true});
  const tokenFile=path.join(local,'access-token');
  const token=fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():crypto.randomBytes(24).toString('hex');
  if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,token,{mode:0o600});
  const pairingFile=path.join(local,'pairing-code');
  const pairingCode=fs.existsSync(pairingFile)?fs.readFileSync(pairingFile,'utf8').trim():String(crypto.randomInt(10000000,100000000));
  if(!fs.existsSync(pairingFile))fs.writeFileSync(pairingFile,pairingCode,{mode:0o600});
  const attempts=new Map();
  let state={updatedAt:null,data:null,error:null},busy=false;
  // Provedores consultados por HTTP, cada um com sua própria janela de espera após erro.
  const providers=[
    {key:'claude',read:readClaude,offline:'Sem conexão com o Claude. Tentando novamente em alguns minutos.'},
    {key:'cursor',read:readCursor,offline:'Sem conexão com o Cursor. Tentando novamente em alguns minutos.',optional:true}
  ].map(p=>({...p,state:{updatedAt:null,data:null,error:null},busy:false,nextAttempt:0}));
  async function pollProvider(provider){
    if(provider.busy||Date.now()<provider.nextAttempt)return;provider.busy=true;
    try{const data=await provider.read();provider.state={updatedAt:Date.now(),data,error:null};provider.nextAttempt=Date.now()+120000;}
    catch(error){provider.missing=Boolean(error.missingCredentials);provider.state={...provider.state,error:error.message==='fetch failed'?provider.offline:error.message};provider.nextAttempt=Date.now()+(error.retryAfterSeconds||120)*1000;}
    finally{provider.busy=false;}
  }
  function pollClaude(){return Promise.all(providers.map(pollProvider));}
  async function poll(){if(busy)return;busy=true;try{state={updatedAt:Date.now(),data:await readAllAccounts(),error:null};}catch(e){state={...state,error:e.message};}finally{busy=false;}}
  const files={'/':['index.html','text/html; charset=utf-8'],'/boot.js':['boot.js','text/javascript; charset=utf-8'],'/app-v4.js':['app-v4.js','text/javascript; charset=utf-8'],'/app.js':['app-v4.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/landscape.css':['landscape.css','text/css; charset=utf-8']};
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const url=new URL(req.url,'http://localhost');
    function accessPage(status=200){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(ROOT,'acesso.html')));}
    if(req.method==='POST'&&url.pathname==='/entrar'){
      const now=Date.now(), ip=req.socket.remoteAddress;
      for(const [key,value] of attempts)if(now-value.since>60000)attempts.delete(key);
      const attempt=attempts.get(ip)||{since:now,count:0};attempt.count++;attempts.set(ip,attempt);
      if(attempt.count>5){res.writeHead(429,{'Content-Type':'text/html; charset=utf-8','Retry-After':'60'});res.end('<!doctype html><meta charset="utf-8"><p>Aguarde um minuto e tente novamente.</p><a href="/painel">Voltar ao acesso</a>');req.resume();return;}
      let body='';req.on('data',chunk=>{body+=chunk;if(body.length>1024)req.destroy();});
      req.on('end',()=>{
        const supplied=Buffer.from(new URLSearchParams(body).get('codigo')||''), expected=Buffer.from(pairingCode);
        if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><p>Código incorreto. Confira os oito números.</p><a href="/painel">Tentar novamente</a>');return;}
        res.writeHead(303,{Location:'/painel/'+token+'/','Content-Type':'text/html; charset=utf-8'});res.end();
      });return;
    }
    if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'text/plain; charset=utf-8'});res.end('Método não permitido');return;}
    if(url.pathname==='/painel'||url.pathname==='/painel/'){accessPage();return;}
    if(url.pathname==='/api/usage'){
      const supplied=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+token);
      if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){res.writeHead(401);res.end();return;}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});const extra={};
      // Provedor opcional sem credencial no computador fica fora do painel, em vez de virar um cartão em erro.
      for(const provider of providers)if(!(provider.optional&&provider.missing&&!provider.state.data))extra[provider.key]={...provider.state,pollEverySeconds:120};
      res.end(JSON.stringify({...state,pollEverySeconds:60,...extra}));return;
    }
    const accessPath=/^\/painel\/([a-f0-9]{48})\/?$/.exec(url.pathname);
    if(accessPath && !crypto.timingSafeEqual(Buffer.from(accessPath[1]),Buffer.from(token))){accessPage(401);return;}
    const file=accessPath?files['/']:files[url.pathname];
    if(!file){accessPage(404);return;}
    res.writeHead(200,{'Content-Type':file[1]});res.end(fs.readFileSync(path.join(ROOT,file[0])));
  });
  const port=Number(process.env.PORT||8788);
  server.listen(port,process.env.HOST||'0.0.0.0',()=>{
    const ips=Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address);
    const links={local:`http://localhost:${port}/painel/${token}/`,celular:ips.map(ip=>`http://${ip}:${port}/painel/${token}/`)};
    fs.writeFileSync(path.join(local,'links.json'),JSON.stringify(links,null,2));
    console.log('Painel iniciado. Links de acesso em .local/links.json');
  });
  server.on('error',e=>{console.error('Não foi possível abrir a porta do painel: '+e.code);process.exit(1);});
  poll();pollClaude();const interval=setInterval(poll,60000),claudeInterval=setInterval(pollClaude,15000);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(interval);clearInterval(claudeInterval);server.close();process.exit();});
  return server;
}
module.exports={normalize,readLimits,readAllAccounts,listCodexHomes,accountLabel,mergeAccounts};
if(require.main===module)start();
