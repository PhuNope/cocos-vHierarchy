const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const project = fs.mkdtempSync(path.join(os.tmpdir(),'vhierarchy-test-'));
const executed=[];
const webContents={id:99,isDestroyed:()=>false,isLoading:()=>false,
  on:()=>{},removeListener:()=>{},
  executeJavaScript:async js=>{executed.push(js);return js.startsWith("document.body?.getAttribute('name')") ? 'main' : {status:'running'};}};
const orig=Module._load;
Module._load=function(id,...rest){if(id==='electron')return{BrowserWindow:{getAllWindows:()=>[{webContents}]}};return orig.call(this,id,...rest);};
const main = require('../dist/main.js');
Module._load=orig;
global.Editor={Project:{path:project}};
test('can load, apply settings and persist without changing scene files',async()=>{
  main.load();
  // injection is asynchronous (no actual Editor renderer needed here)
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.ok(executed.some(js=>js.includes('window.__vHierarchy388?.applyState')));
  assert.ok(executed.some(js=>js.includes('window.__vHierarchy388?.setIcons(')));
  assert.ok(executed.some(js=>js.includes('data:image/svg+xml;base64,')));
  assert.ok(executed.some(js=>js.includes('VHierarchyColors.rowBackground(')));
  assert.equal(await main.methods.setOption('colorGradientsEnabled',false),true);
  assert.equal(await main.methods.setOption('colorSaturation',.6),true);
  assert.equal(await main.methods.setOption('colorBrightness',1.1),true);
  assert.equal(await main.methods.setOption('colorSaturation','0.6'),false);
  assert.equal(await main.methods.setOption('zebraStriping',false),true);
  assert.equal(await main.methods.setOption('nonsense',true),false);
  assert.equal(await main.methods.setAppearance('b204319a-288c-484a-8f60-287573a05ab6',{color:4,icon:'📁'}),true);
  // Real palette workflow: choose icon first, then color, then recursive options.
  // The editor preserves insertion order, whereas the sanitizer returns
  // canonical field order. These states must all be accepted.
  const paletteUuid='b204319a-288c-484a-8f60-287573a05ab6';
  assert.equal(await main.methods.setAppearance(paletteUuid,{icon:'folder'}),true);
  assert.equal(await main.methods.setAppearance(paletteUuid,{icon:'folder',color:5}),true);
  assert.equal(await main.methods.setAppearance(paletteUuid,{icon:'folder',color:5,recursiveColor:true}),true);
  assert.equal(await main.methods.setAppearance(paletteUuid,{recursiveIcon:true,icon:'camera',color:2,recursiveColor:true}),true);
  assert.deepEqual(main.methods.getState().appearances[paletteUuid],
    {color:2,icon:'camera',recursiveColor:true,recursiveIcon:true});
  assert.equal(await main.methods.setAppearance(paletteUuid,{icon:'does-not-exist',color:2}),false);
  assert.deepEqual(main.methods.getState().appearances[paletteUuid],
    {color:2,icon:'camera',recursiveColor:true,recursiveIcon:true});
  assert.equal(await main.methods.setAppearance(paletteUuid,{color:4,icon:'📁'}),true);
  // Cocos Editor exposes compressed 22-char node UUIDs containing '+' and '/'.
  // Patch 12 rejected these identifiers even when {color} was otherwise valid.
  const compressedUuid='abCDefghij+klmn/opqrst';
  assert.equal(compressedUuid.length,22);
  assert.equal(await main.methods.setAppearance(compressedUuid,{color:3}),true);
  assert.equal(await main.methods.setAppearance(compressedUuid,{color:3,icon:'camera'}),true);
  assert.equal(await main.methods.setAppearance(compressedUuid,{icon:'camera',color:0,recursiveColor:true}),true);
  assert.equal(main.methods.getState().appearances[compressedUuid].color,0);
  assert.equal(await main.methods.toggleBookmark(compressedUuid,'Compressed node'),true);


  assert.equal(await main.methods.toggleBookmark('b204319a-288c-484a-8f60-287573a05ab6','Example'),true);
  assert.equal(main.methods.getState().options.zebraStriping,false);
  const filename=path.join(project,'settings','vHierarchy.json');
  const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.equal(saved.appearances['b204319a-288c-484a-8f60-287573a05ab6'].color,4);
  assert.deepEqual(saved.appearances[compressedUuid],{color:0,icon:'camera',recursiveColor:true});
  assert.deepEqual(require('../dist/core/model.js').sanitizeState(saved).appearances[compressedUuid], saved.appearances[compressedUuid]);
  assert.equal(saved.bookmarks.some(x=>x.uuid===compressedUuid),true);

  assert.equal(saved.bookmarks.length,2);
  assert.equal(saved.options.colorGradientsEnabled,false);
  assert.equal(saved.options.colorSaturation,.6);
  assert.equal(saved.options.colorBrightness,1.1);
  await main.unload();
});
test('renderer refuses to run in preview webview',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
  const view={body:{getAttribute:()=> 'preview'}};
  const context={document:view,window:{}};
  vm.runInNewContext(source,context,{timeout:1000});
  assert.equal(context.window.__vHierarchy388,undefined);
});

test('all panel actions live inside one vHierarchy submenu',()=>{
  const manifest=require('../package.json');
  const menus=manifest.contributions.menu;
  assert.equal(menus.length,4);
  for(const item of menus){
    assert.equal(item.path,'i18n:menu.panel/vHierarchy');
    assert.equal(item.label.startsWith('vHierarchy:'),false);
    assert.ok(manifest.contributions.messages[item.message]);
  }
});

test('native scene:change-node broadcasts refresh affected Layer without a TTL wait',async()=>{
  const manifest=require('../package.json');
  assert.deepEqual(manifest.contributions.messages['scene:change-node'].methods,['nodeChanged']);
  assert.deepEqual(manifest.contributions.messages['scene:ready'].methods,['sceneReady']);
  main.load();
  await new Promise(resolve=>setTimeout(resolve,25));
  executed.length=0;
  const uuid='b204319a-288c-484a-8f60-287573a05ab6';
  main.methods.nodeChanged({uuid, property:'layer'});
  main.methods.nodeChanged(uuid);
  await new Promise(resolve=>setTimeout(resolve,60));
  const targeted=executed.filter(js=>js.includes('sceneNodeChanged?.('));
  assert.equal(targeted.length,1,'burst of scene changes must be coalesced');
  assert.ok(targeted[0].includes(uuid));
  executed.length=0;
  main.methods.sceneReady();
  await new Promise(resolve=>setTimeout(resolve,60));
  const refresh=executed.filter(js=>js.includes('sceneNodeChanged?.('));
  assert.equal(refresh.length,1);
  assert.match(refresh[0],/sceneNodeChanged\?\.\(null\)/);
  await main.unload();
});

test('Cocos node changes with compressed UUIDs invalidate the right Layer label',async()=>{
  const compressed='abCDefghij+klmn/opqrst';
  main.load();
  await new Promise(resolve=>setTimeout(resolve,25));
  executed.length=0;
  main.methods.nodeChanged({uuid:compressed,property:'layer'});
  await new Promise(resolve=>setTimeout(resolve,60));
  const refresh=executed.filter(js=>js.includes('sceneNodeChanged?.('));
  assert.equal(refresh.length,1);
  assert.ok(refresh[0].includes(compressed));
  await main.unload();
});
