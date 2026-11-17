const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname,'../dist/renderer/scenes.js'),'utf8');
const scenes = vm.runInNewContext(`${code}\nVHierarchyScenes;`,{});
const uuid = 'ce750465-15d2-42c5-b176-10f21578f3f0';
const good = {uuid,name:'Main',url:'db://assets/scenes/Main.scene',type:'cc.SceneAsset',imported:true,invalid:false};
test('scene list filters missing/invalid/misclassified assets and duplicates',()=>{
 const entries=scenes.listScenes([good,{...good},{...good,uuid:'not-uuid'},
   {...good,uuid:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',url:'db://internal/builtin.scene'},
   {...good,uuid:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',type:'cc.Prefab'},
   {...good,uuid:'cccccccc-cccc-cccc-cccc-cccccccccccc',invalid:true},
   {...good,uuid:'dddddddd-dddd-dddd-dddd-dddddddddddd',imported:false}]);
 assert.equal(entries.length,1); assert.equal(entries[0].uuid,uuid);
});
test('scene open verifies latest asset metadata before IPC and reports stale UUID',async()=>{
 const entry=scenes.listScenes([good])[0];
 const messages=[];
 const request=async(pkg,message,arg)=>{messages.push([pkg,message,arg]);
   if(message==='query-asset-info')return {...good,uuid:'ffffffff-ffff-ffff-ffff-ffffffffffff'};
   throw new Error('must not call scene');
 };
 await assert.rejects(()=>scenes.openVerified(entry,request),/missing, moved/);
 assert.equal(messages.length,1);
});
test('scene open awaits request and surfaces Editor failures',async()=>{
 const entry=scenes.listScenes([good])[0];
 const messages=[];
 const request=async(pkg,message,arg)=>{messages.push([pkg,message,arg]);
  if(message==='query-asset-info')return good;
  if(message==='open-scene')throw new Error('scene IPC failed');
 };
 await assert.rejects(()=>scenes.openVerified(entry,request),/scene IPC failed/);
 assert.equal(messages[1][0],'scene');
 assert.equal(messages[1][1],'open-scene');
 assert.equal(messages[1][2],uuid);
});
test('valid scene opens once, rejected result is not mistaken for success',async()=>{
 const entry=scenes.listScenes([good])[0];
 const request=async(pkg,msg)=>msg==='query-asset-info'?good:false;
 await assert.rejects(()=>scenes.openVerified(entry,request),/declined/);
 await scenes.openVerified(entry,async(pkg,msg)=>msg==='query-asset-info'?good:true);
});
