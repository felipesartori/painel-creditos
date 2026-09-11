const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function runClient(status=200,location={hash:'#test-token',pathname:'/'}){
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
  function XHR(){this.open=function(){};this.setRequestHeader=function(){};this.send=function(){requested++;this.status=status;this.responseText=JSON.stringify({updatedAt:Date.now(),data:{buckets:[{id:'codex',name:'Codex',plan:'pro',windows:[{remaining:52,used:48,minutes:10080,resetsAt:1800000000}],credits:{balance:'0'}}],resets:2},error:null});this.onload();};}
  const window={innerHeight:320,addEventListener(){},scrollTo(){},matchMedia:()=>({matches:true}),setTimeout(){}};
  const context={document,window,navigator:{},location,history:{replaceState(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},XMLHttpRequest:XHR,MutationObserver:function(){this.observe=function(){};},setInterval(){},setTimeout(){},clearTimeout(){},console};
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
