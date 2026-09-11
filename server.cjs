const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {readClaude}=require('./claude-usage.cjs');
const ROOT = __dirname;
const defaultClientName = process.env.CODEX_CLIENT_NAME || `codex_usage_monitor_${(process.env.USERNAME || 'user').replace(/[^a-zA-Z0-9_-]/g, '_')}`;

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

function readLimits() {
  return new Promise((resolve,reject) => {
    const userHome = process.env.USERPROFILE || os.homedir();
    const child = spawn(process.env.CODEX_BINARY || 'codex', ['app-server','--stdio'], {
      windowsHide:true, cwd:ROOT,
      env:{...process.env,HOME:userHome,CODEX_HOME:process.env.CODEX_HOME || path.join(userHome,'.codex')}
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
  let claudeState={updatedAt:null,data:null,error:null},claudeBusy=false,claudeNextAttempt=0;
  async function pollClaude(){
    if(claudeBusy||Date.now()<claudeNextAttempt)return;claudeBusy=true;
    try{const data=await readClaude();claudeState={updatedAt:Date.now(),data,error:null};claudeNextAttempt=Date.now()+120000;}
    catch(error){claudeState={...claudeState,error:error.message==='fetch failed'?'Sem conexão com o Claude. Tentando novamente em alguns minutos.':error.message};claudeNextAttempt=Date.now()+(error.retryAfterSeconds||120)*1000;}
    finally{claudeBusy=false;}
  }
  async function poll(){if(busy)return;busy=true;try{state={updatedAt:Date.now(),data:await readLimits(),error:null};state.updatedAt=Date.now();}catch(e){state={...state,error:e.message};}finally{busy=false;}}
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
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({...state,pollEverySeconds:60,claude:{...claudeState,pollEverySeconds:120}}));return;
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
module.exports={normalize,readLimits};
if(require.main===module)start();
