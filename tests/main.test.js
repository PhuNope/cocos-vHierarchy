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
  executeJavaScript:async js=>{executed.push(js);return js.includes("document.body?.getAttribute('name')") ? 'main' : {status:'running'};}};
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
  assert.equal(await main.methods.setOption('zebraStriping',false),true);
  assert.equal(await main.methods.setOption('nonsense',true),false);
  assert.equal(await main.methods.setAppearance('b204319a-288c-484a-8f60-287573a05ab6',{color:4,icon:'📁'}),true);
  assert.equal(await main.methods.toggleBookmark('b204319a-288c-484a-8f60-287573a05ab6','Example'),true);
  assert.equal(main.methods.getState().options.zebraStriping,false);
  const filename=path.join(project,'settings','vHierarchy.json');
  const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.equal(saved.appearances['b204319a-288c-484a-8f60-287573a05ab6'].color,4);
  assert.equal(saved.bookmarks.length,1);
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
