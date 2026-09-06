import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import handler from '../api/aarav-chat.ts';
import { snapshotSceneState } from '../src/engine/aaravToolHandlers.ts';
import { ChatRateLimiter } from '../server/chatSecurity.ts';
import { tutorMiddleware } from '../server/tutorMiddleware.ts';
import { createServer } from 'node:http';

let calls=0;
const originalCreate=Anthropic.Messages.prototype.create;
const originalKey=process.env.ANTHROPIC_API_KEY;
const originalOrigin=process.env.AARAV_APP_ORIGIN;
test.before(()=>{
  process.env.ANTHROPIC_API_KEY='unit-test-placeholder';
  delete process.env.AARAV_APP_ORIGIN;
  Anthropic.Messages.prototype.create=async()=>{calls++;return {content:[{type:'text',text:'mock response'}],stop_reason:'end_turn'};};
});
test.after(()=>{
  Anthropic.Messages.prototype.create=originalCreate;
  if(originalKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=originalKey;
  if(originalOrigin===undefined)delete process.env.AARAV_APP_ORIGIN;else process.env.AARAV_APP_ORIGIN=originalOrigin;
});
const body=()=>({messages:[{role:'user',content:'Explain the flow.'}],sceneState:snapshotSceneState()});
function request(value=body(),origin='http://localhost',headers={}) {
  return new Request('http://localhost/api/aarav-chat',{method:'POST',headers:{'Content-Type':'application/json',...(origin===null?{}:{Origin:origin}),...headers},body:typeof value==='string'?value:JSON.stringify(value)});
}
test('chat enforces a 20-request per-minute caller cap before charging the provider',async()=>{
  const before=calls;const responses=await Promise.all(Array.from({length:25},()=>handler(request(),{clientAddress:'rate-test'})));
  assert.deepEqual(responses.map(r=>r.status),[...Array(20).fill(200),...Array(5).fill(429)]);
  assert.equal(calls-before,20);
  assert.ok(Number(responses[24].headers.get('Retry-After'))>0);
});
test('chat origin policy rejects arbitrary, null, malformed and missing origins',async()=>{
  const before=calls;
  for(const origin of ['https://attacker.example','null','not a url',null,'https://localhost']) {
    assert.equal((await handler(request(body(),origin),{clientAddress:'origin-test'})).status,403,String(origin));
  }
  assert.equal(calls,before);
  assert.equal((await handler(request(),{clientAddress:'allowed-origin'})).status,200);
});
test('request fuzz cases are rejected with 400 before a provider call',async()=>{
  const cases=['','{',null,[],{}, {messages:'bad',sceneState:{}}, {messages:Array(2000).fill({role:'user',content:'x'}),sceneState:{}},
    {...body(),messages:[{role:'user',content:'x'.repeat(2*1024*1024)}]},
    {...body(),messages:[{role:'system',content:'x'}]}, {...body(),messages:[{role:'user',content:[{type:'image',source:'x'}]}]},
    {...body(),sceneState:{constructor:{prototype:{polluted:true}}}}];
  let deep={};let c=deep;for(let i=0;i<200;i++)c=c.child={};cases.push({...body(),sceneState:deep});
  const before=calls;
  const statuses=await Promise.all(cases.map(async(value,i)=>(await handler(request(value),{clientAddress:'fuzz-'+i})).status));
  assert.deepEqual(statuses,cases.map(()=>400));assert.equal(calls,before);
});
test('missing key error is only a plain configuration message',async()=>{
  delete process.env.ANTHROPIC_API_KEY;
  try { const response=await handler(request(),{clientAddress:'missing-key'});
    assert.equal(response.status,503);const data=await response.json();
    assert.deepEqual(data,{error:'Aarav needs a server API key. Add ANTHROPIC_API_KEY to .env and restart the server.'});
    assert.doesNotMatch(JSON.stringify(data),/sk-ant-|unit-test-placeholder|[A-Z]:\\|\/Users\/|\bat .*\(.+:\d+/);
  }finally{process.env.ANTHROPIC_API_KEY='unit-test-placeholder';}
});
test('forged forwarded headers do not bypass the caller cap',async()=>{
  const before=calls, statuses=[];
  for(let i=0;i<25;i++) statuses.push((await handler(request(body(),'http://localhost',{'x-forwarded-for':'spoof-'+i}),{clientAddress:'fixed-socket'})).status);
  assert.deepEqual(statuses,[...Array(20).fill(200),...Array(5).fill(429)]);assert.equal(calls-before,20);
});
test('rate budgets expire and the process-wide cap bounds changing caller identities',()=>{
  let now=1000;const limiter=new ChatRateLimiter(()=>now);
  for(let i=0;i<20;i++)assert.equal(limiter.take('a'),0);assert.ok(limiter.take('a')>0);
  now+=60000;assert.equal(limiter.take('a'),0);
  for(let i=0;i<59;i++)assert.equal(limiter.take('new-'+i),0);
  assert.ok(limiter.take('another-caller')>0);
  for(let i=0;i<2000;i++)assert.ok(limiter.take('overflow-'+i)>0);
  now+=60000;assert.equal(limiter.take('another-caller'),0);
});
test('real HTTP middleware forwards origin and rejects malformed origins without unhandled errors',async()=>{
  const server=createServer((req,res)=>void tutorMiddleware(req,res,()=>res.writeHead(404).end()));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const value of ['not a url','https://attacker.example',origin]){
      const response=await fetch(origin+'/api/aarav-chat',{method:'POST',headers:{Origin:value,'Content-Type':'application/json'},body:JSON.stringify(body())});
      assert.equal(response.status,value===origin?200:403);
    }
    const tooBig=await fetch(origin+'/api/aarav-chat',{method:'POST',headers:{Origin:origin},body:'x'.repeat(1024*1024)});
    assert.equal(tooBig.status,400);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
