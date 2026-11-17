'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../dist/renderer/scene-commands.js'),'utf8');
const commands=vm.runInNewContext(code+'\nVHierarchySceneCommands;',{});
const uuid='b204319a-288c-484a-8f60-287573a05ab6';
test('active toggle does not assign to readonly Vue/Scene snapshots',async()=>{
  const dump=Object.freeze({active:Object.freeze({value:true,type:'Boolean',readonly:false})});
  const events=[];
  const req=async(pkg,msg,arg)=>{
    events.push({pkg,msg,arg});
    if(msg==='query-node')return dump;
    if(msg==='set-property')return true;
  };
  assert.equal(await commands.toggleActive(uuid,req),true);
  assert.equal(dump.active.value,true);
  assert.deepEqual(events.map(e=>e.msg),['query-node','set-property']);
  assert.equal(events[1].arg.dump.value,false);
  assert.equal(events[1].arg.record,true);
  assert.equal(events[1].arg.path,'active');
});
test('active toggle rejects unexpected dumps without writes',async()=>{
  let calls=0;
  await assert.rejects(()=>commands.toggleActive(uuid,async()=>{calls++;return {active:false};}),/editable active dump/);
  assert.equal(calls,1);assert.equal(commands.isPending(uuid),false);
});
test('active toggle prevents concurrent writes to same node',async()=>{
  let unblock;
  const request=(pkg,msg,arg)=>{
    if(msg==='query-node')return new Promise(resolve=>{unblock=()=>resolve({active:{value:false}});});
    return Promise.resolve(true);
  };
  const first=commands.toggleActive(uuid,request);
  assert.equal(commands.isPending(uuid),true);
  assert.equal(await commands.toggleActive(uuid,request),false);
  unblock(); assert.equal(await first,true);assert.equal(commands.isPending(uuid),false);
});
test('failed Scene commits release lock so user can retry',async()=>{
  await assert.rejects(()=>commands.toggleActive(uuid,async(pkg,msg)=> msg==='query-node'?{active:{value:true}}:false),/rejected/);
  assert.equal(commands.isPending(uuid),false);
});
