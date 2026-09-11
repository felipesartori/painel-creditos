const {test}=require('node:test');const assert=require('node:assert/strict');
const {mergeAccounts}=require('./server.cjs');
const conta=(id,resets)=>({buckets:[{id,name:'Codex',windows:[]}],resets});
test('contas somam resets e recebem ids distintos',()=>{
  const r=mergeAccounts([
    {home:'/h/.codex',label:'um@x.com',value:conta('codex',2)},
    {home:'/h/.codex-conta-1',label:'dois@x.com',value:conta('codex',1)}
  ]);
  assert.deepEqual(r.buckets.map(b=>b.id),['codex','codex@.codex-conta-1']);
  assert.deepEqual(r.buckets.map(b=>b.name),['um@x.com','dois@x.com']);
  assert.equal(r.resets,3);
  assert.deepEqual(r.buckets.map(b=>b.resets),[2,1]);
});
test('conta com falha não derruba as outras',()=>{
  const r=mergeAccounts([
    {home:'/h/.codex',label:'um@x.com',value:conta('codex',2)},
    {home:'/h/.codex-conta-2',label:'.codex-conta-2',error:'sem login'}
  ]);
  assert.equal(r.buckets.length,1);assert.deepEqual(r.errors,['.codex-conta-2: sem login']);
});
test('todas falhando vira erro',()=>{
  assert.throws(()=>mergeAccounts([{home:'/h/.codex',label:'a',error:'x'}]),/a: x/);
});
