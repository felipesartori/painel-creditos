const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
function normalizeClaude(raw,plan){
  const definitions=[['five_hour',300,'Janela de 5 horas'],['seven_day',10080,'Limite semanal'],['seven_day_sonnet',10080,'Semanal · Sonnet'],['seven_day_opus',10080,'Semanal · Opus']];
  const windows=definitions.filter(([key])=>raw[key]!=null).map(([key,minutes,label])=>{
    const w=raw[key],used=Number.isFinite(w.utilization)?Math.max(0,Math.min(100,w.utilization)):null;
    const date=w.resets_at?Date.parse(w.resets_at):NaN;
    return {key,label,used,remaining:used===null?null:Math.round((100-used)*10)/10,minutes,resetsAt:Number.isFinite(date)?Math.floor(date/1000):null};
  });
  return {id:'claude',name:'Claude',plan:plan||null,windows};
}
async function readClaude(){
  let credentials;
  try{credentials=JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE||os.homedir(),'.claude','.credentials.json'),'utf8')).claudeAiOauth;}catch{throw new Error('Abra o Claude Code e conecte sua conta neste computador.');}
  if(!credentials?.accessToken)throw new Error('Faça login no Claude Code deste computador.');
  const response=await fetch('https://api.anthropic.com/api/oauth/usage',{
    headers:{Authorization:'Bearer '+credentials.accessToken,'anthropic-beta':'oauth-2025-04-20',Accept:'application/json'},
    signal:AbortSignal.timeout(15000),redirect:'error'
  });
  if(response.status===401||response.status===403)throw new Error('Sessão Claude indisponível. Abra o Claude Code para renovar o login.');
  if(response.status===429){const error=new Error('Claude pediu uma pausa nas consultas. Nova tentativa em alguns minutos.');error.retryAfterSeconds=Math.max(300,Math.min(3600,Number(response.headers.get('retry-after'))||300));throw error;}
  if(!response.ok)throw new Error('Não foi possível consultar os limites Claude (HTTP '+response.status+').');
  const raw=await response.json();
  if(!raw||(!('five_hour' in raw)&&!('seven_day' in raw)))throw new Error('Claude não retornou os limites esperados.');
  return normalizeClaude(raw,credentials.subscriptionType);
}
module.exports={normalizeClaude,readClaude};
if(require.main===module)readClaude().then(data=>console.log(JSON.stringify(data))).catch(error=>{console.log(error.message);process.exitCode=1;});
