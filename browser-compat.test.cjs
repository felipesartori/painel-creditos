const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function runClient(status=200,location={hash:'#test-token',pathname:'/'},extra={},ocultas=null){
  function Element(){this.children=[];this.style={setProperty(){}};this.dataset={};this.className='';this.textContent='';this.hidden=false;this.classList={toggle(){},contains(){return false;},add(){},remove(){}};}
  Element.prototype.appendChild=function(e){this.children.push(e);return e;};
  Element.prototype.removeChild=function(e){this.children.splice(this.children.indexOf(e),1);};
  Object.defineProperty(Element.prototype,'firstChild',{get(){return this.children[0]||null;}});
  Element.prototype.setAttribute=function(k,v){this[k]=v;};
  Element.prototype.addEventListener=function(){};
  const nodes={};const get=id=>nodes[id]||(nodes[id]=new Element());
  get('status').textContent='Conectando ao computador…';
  const document={getElementById:get,createElement:()=>new Element(),querySelector:()=>get('header'),querySelectorAll:()=>[],body:new Element(),documentElement:new Element(),addEventListener(){},hidden:false};
  let requested=0;
  function XHR(){this.open=function(){};this.setRequestHeader=function(){};this.send=function(){requested++;this.status=status;this.responseText=JSON.stringify({updatedAt:Date.now(),data:{buckets:[{id:'codex',name:'Codex',plan:'pro',windows:[{remaining:52,used:48,minutes:10080,resetsAt:1800000000}],credits:{balance:'0'}}],resets:2},error:null,...extra});this.onload();};}
  const window={innerHeight:320,addEventListener(){},scrollTo(){},matchMedia:()=>({matches:true}),setTimeout(){}};
  const context={document,window,navigator:{},location,history:{replaceState(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},localStorage:{getItem(){return ocultas?JSON.stringify(ocultas):null;},setItem(){},removeItem(){}},XMLHttpRequest:XHR,MutationObserver:function(){this.observe=function(){};},setInterval(){},setTimeout(){},clearTimeout(){},console};
  window.document=document;window.location=context.location;
  vm.runInNewContext(fs.readFileSync(__dirname+'/app-v4.js','utf8'),context);
  return {nodes,requested};
}
test('browser without Element.append leaves connecting state and displays real values',()=>{
  const r=runClient();assert.equal(r.requested,1);assert.match(r.nodes.status.textContent,/Conectado/);assert.equal(String(r.nodes.resets.textContent),'2');assert.ok(r.nodes.buckets.children.length);
});
test('invalid access is visible rather than stuck connecting',()=>{
  const r=runClient(401);assert.notEqual(r.nodes.status.textContent,'Conectando ao computador…');assert.equal(r.nodes.notice.hidden,false);assert.match(r.nodes.notice.textContent,/link/i);
});
test('Home Screen shortcut with no fragment or saved session recovers access from path',()=>{
  const r=runClient(200,{hash:'',pathname:'/painel/'+'a'.repeat(48)+'/'});
  assert.equal(r.requested,1);assert.match(r.nodes.status.textContent,/Conectado/);assert.equal(r.nodes.notice.hidden,true);
});

test('cartoes de Claude e Cursor aparecem junto com as contas Codex',()=>{
  const agora=Date.now();
  const r=runClient(200,{hash:'#test-token',pathname:'/'},{
    claude:{updatedAt:agora,error:null,data:{id:'claude',name:'Claude',plan:'team',windows:[{label:'Janela de 5 horas',used:16,remaining:84,minutes:300,resetsAt:1800000000}]}},
    cursor:{updatedAt:agora,error:null,data:{id:'cursor',name:'conta@x.com',plan:'pro_plus',windows:[{label:'Ciclo mensal',used:30,remaining:70,minutes:null,resetsAt:1800000000}]}}
  });
  assert.equal(r.nodes.buckets.children.length,3);
});

test('provedor opcional ausente no payload nao gera cartao',()=>{
  const r=runClient(200,{hash:'#test-token',pathname:'/'},{
    claude:{updatedAt:Date.now(),error:null,data:{id:'claude',name:'Claude',plan:'team',windows:[{label:'Janela de 5 horas',used:16,remaining:84,minutes:300,resetsAt:1800000000}]}}
  });
  assert.equal(r.nodes.buckets.children.length,2);
});

test('conta oculta some até o horário de renovação e volta depois dele',()=>{
  const futuro=Math.floor(Date.now()/1000)+3600, passado=Math.floor(Date.now()/1000)-10;
  const cartoes=r=>r.nodes.buckets.children.filter(c=>String(c.className).indexOf('meter')>=0).length;
  const avisos=r=>r.nodes.buckets.children.filter(c=>String(c.className).indexOf('hidden-note')>=0).length;
  const oculta=runClient(200,{hash:'#test-token',pathname:'/'},{},{codex:futuro});
  assert.equal(cartoes(oculta),1);// só o cartão do Claude
  assert.equal(avisos(oculta),1);
  const devolta=runClient(200,{hash:'#test-token',pathname:'/'},{},{codex:passado});
  assert.equal(cartoes(devolta),2);// Codex voltou sozinho
  assert.equal(avisos(devolta),0);
});
