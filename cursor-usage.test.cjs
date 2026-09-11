const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalizeCursor}=require('./cursor-usage.cjs');
test('ciclo mensal e créditos avulsos viram janelas com percentual disponível',()=>{
  const b=normalizeCursor({billingCycleEnd:'2026-09-25T16:59:55.000Z',membershipType:'pro_plus',individualUsage:{plan:{totalPercentUsed:29.514},onDemand:{enabled:true,used:500,limit:2000}}},'a@b.com');
  assert.equal(b.name,'a@b.com');assert.equal(b.plan,'pro_plus');
  assert.equal(b.windows[0].remaining,70.5);assert.equal(b.windows[0].resetsAt,1790355595);
  assert.equal(b.windows[1].used,25);assert.equal(b.windows[1].remaining,75);
});
test('sem créditos avulsos e sem percentual, nada vira zero',()=>{
  const b=normalizeCursor({individualUsage:{plan:{},onDemand:{enabled:false}}});
  assert.equal(b.windows.length,1);assert.equal(b.windows[0].used,null);assert.equal(b.windows[0].remaining,null);assert.equal(b.windows[0].resetsAt,null);
});
