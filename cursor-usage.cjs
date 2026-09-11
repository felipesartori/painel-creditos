const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');

function normalizeCursor(raw,account){
  const percent=v=>Number.isFinite(v)?Math.max(0,Math.min(100,Math.round(v*10)/10)):null;
  const resetsAt=raw.billingCycleEnd?Math.floor(Date.parse(raw.billingCycleEnd)/1000):null;
  const usage=raw.individualUsage||{};
  const windows=[];
  if(usage.plan){
    const used=raw.isUnlimited?0:percent(usage.plan.totalPercentUsed);
    windows.push({key:'plan',label:'Ciclo mensal',used,remaining:used===null?null:Math.round((100-used)*10)/10,minutes:null,resetsAt:Number.isFinite(resetsAt)?resetsAt:null});
  }
  if(usage.onDemand?.enabled&&Number.isFinite(usage.onDemand.limit)&&usage.onDemand.limit>0){
    const used=percent(usage.onDemand.used/usage.onDemand.limit*100);
    windows.push({key:'ondemand',label:'Créditos avulsos',used,remaining:used===null?null:Math.round((100-used)*10)/10,minutes:null,resetsAt:Number.isFinite(resetsAt)?resetsAt:null});
  }
  return {id:'cursor',name:account||'Cursor',plan:raw.membershipType||null,windows};
}

// Token da sessão Cursor: variável de ambiente, Keychain do macOS ou arquivo indicado em CURSOR_TOKEN_FILE.
function readCursorAuth(){
  let authId=process.env.CURSOR_AUTH_ID||null,account=null;
  try{
    const info=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.cursor','cli-config.json'),'utf8')).authInfo;
    authId=authId||info?.authId;account=info?.email||info?.displayName||null;
  }catch{}
  let token=process.env.CURSOR_ACCESS_TOKEN||null;
  if(!token&&process.env.CURSOR_TOKEN_FILE&&fs.existsSync(process.env.CURSOR_TOKEN_FILE))token=fs.readFileSync(process.env.CURSOR_TOKEN_FILE,'utf8').trim();
  if(!token&&process.platform==='darwin'){try{token=execFileSync('security',['find-generic-password','-s','cursor-access-token','-w'],{encoding:'utf8'}).trim();}catch{}}
  if(!token||!authId){const error=new Error('Conecte a conta Cursor neste computador (cursor-agent login).');error.missingCredentials=true;throw error;}
  return {token,authId,account};
}

async function readCursor(){
  const {token,authId,account}=readCursorAuth();
  const response=await fetch('https://cursor.com/api/usage-summary',{
    headers:{Cookie:'WorkosCursorSessionToken='+encodeURIComponent(authId)+'%3A%3A'+token,Accept:'application/json'},
    signal:AbortSignal.timeout(15000),redirect:'error'
  });
  if(response.status===401||response.status===403)throw new Error('Sessão Cursor expirada. Faça login novamente com cursor-agent.');
  if(response.status===429){const error=new Error('Cursor pediu uma pausa nas consultas. Nova tentativa em alguns minutos.');error.retryAfterSeconds=Math.max(300,Math.min(3600,Number(response.headers.get('retry-after'))||300));throw error;}
  if(!response.ok)throw new Error('Não foi possível consultar os limites Cursor (HTTP '+response.status+').');
  const raw=await response.json();
  if(!raw||!raw.individualUsage)throw new Error('Cursor não retornou os limites esperados.');
  return normalizeCursor(raw,account);
}
module.exports={normalizeCursor,readCursor,readCursorAuth};
if(require.main===module)readCursor().then(data=>console.log(JSON.stringify(data))).catch(error=>{console.log(error.message);process.exitCode=1;});
