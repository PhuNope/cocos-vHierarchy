const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const {isCustomIcon, cleanIconName, isValidPng, sanitizeCustomIcons, MAX_CUSTOM_ICONS} = require('../dist/core/custom-icons.js');
const {sanitizeState, isValidAppearance, ICONS} = require('../dist/core/model.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR42mNkSPnwgYECwMRAIRg1YNSAUQMGiwEAcn8CZDcHi0MAAAAASUVORK5CYII=', 'base64');
const dataUrl = 'data:image/png;base64,' + png.toString('base64');
const nodeUuid = 'abCDefghij+klmn/opqrst';

test('bundled original SVG library is available offline and custom identifiers are strict',()=>{
  assert.equal(ICONS.length,36);
  assert.equal(ICONS.includes('ui_panel'),true);
  assert.equal(isCustomIcon('custom:' + 'f'.repeat(20)),true);
  assert.equal(isCustomIcon('custom:../../evil'),false);
  assert.equal(isCustomIcon('custom:' + 'F'.repeat(20)),false);
  assert.equal(cleanIconName(' folder <script>/ hi '),'folder script hi');
});

test('PNG validation checks signature, dimensions, IHDR and bounds',()=>{
  assert.equal(isValidPng(png),true);
  const badSignature = Buffer.from(png); badSignature[0]=0;
  assert.equal(isValidPng(badSignature),false);
  const oversized = Buffer.from(png);oversized[16]=0;oversized[17]=0;oversized[18]=2;oversized[19]=0;
  assert.equal(isValidPng(oversized),false);
  assert.equal(isValidPng(Buffer.alloc(1024)),false);
});

test('custom icon manifest filters invalid keys and retains node appearances across sanitization',()=>{
  const id = 'custom:'+'a'.repeat(20);
  const st = sanitizeState({customIcons:[{id,name:'  Enemy Fire  '},{id,name:'dup'},
    {id:'custom:../../secret',name:'danger'}], appearances:{[nodeUuid]:{icon:id,iconColor:'#99cc00'}}});
  assert.deepEqual(st.customIcons,[{id,name:'Enemy Fire'}]);
  assert.equal(st.appearances[nodeUuid].icon,id);
  assert.equal(isValidAppearance({icon:id,recursiveIcon:true}),true);
  assert.equal(isValidAppearance({icon:'custom:foo'}),false);
  assert.ok(sanitizeCustomIcons(Array.from({length:100},(_,i)=>({id:'custom:'+i.toString(16).padStart(20,'0'),name:'Icon'+i}))).length<=MAX_CUSTOM_ICONS);
});

const script = fs.readFileSync(path.join(__dirname, '../dist/renderer/icon-files.js'),'utf8');
const files = vm.runInNewContext(script + '\nVHierarchyIconFiles;',{});
test('SVG imports reject scripts, external references, inline CSS, foreignObject and entity payloads',()=>{
  const good='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2 L20 20"/></svg>';
  assert.equal(files.safeSvg(good),true);
  const unsafe = [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg><image href="https://evil.site/icon.png"/></svg>',
    '<svg><foreignObject><div></div></foreignObject></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg><path d="M0"/></svg>',
    '<svg><path style="fill:url(https://site.com/evil)" d="M0"/></svg>',
  ];
  for(const xml of unsafe)assert.equal(files.safeSvg(xml),false,xml);
});

test('renderer rasterization refuses unsupported extensions and oversized files before decoding',async()=>{
  await assert.rejects(()=>files.rasterize({name:'bad.gif',size:16}),/Choose a PNG/);
  await assert.rejects(()=>files.rasterize({name:'large.png',size:1000*1000}),/1–512 KB/);
  await assert.rejects(()=>files.rasterize({name:'evil.svg',size:100,text:async()=>'<svg><script>1</script></svg>'}),/unsafe/);
});

test('project icon import is deterministic, persisted, reloaded, tintable and removable',async()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'vh-custom-icons-'));
  const mock={id:101,isDestroyed:()=>false,isLoading:()=>false,on:()=>{},removeListener:()=>{},
    executeJavaScript:async source=>source.startsWith("document.body?.getAttribute('name')")?'main':{status:'running'}};
  const original=Module._load;
  Module._load=function(id,...args){ if(id==='electron')return{BrowserWindow:{getAllWindows:()=>[{webContents:mock}]}};return original.call(this,id,...args); };
  const main=require('../dist/main.js');
  Module._load=original;
  global.Editor={Project:{path:project}};
  try{
    main.load();
    assert.equal(await main.methods.importIcon('broken','data:image/png;base64,AAECAw=='),null);
    const first=await main.methods.importIcon('Enemy',dataUrl);
    assert.match(first.id,/^custom:[0-9a-f]{20}$/);
    assert.equal(first.name,'Enemy');
    assert.deepEqual(await main.methods.importIcon('Reimport',dataUrl),first,'same bytes are idempotent');
    assert.equal(main.methods.getState().customIcons.length,1);
    assert.equal(await main.methods.setAppearance(nodeUuid,{icon:first.id,iconColor:'#1234AB',recursiveIcon:true}),true);
    assert.equal(await main.methods.setAppearance(nodeUuid,{icon:'custom:'+'f'.repeat(20)}),false);
    const directory=path.join(project,'settings','vHierarchy-icons');
    assert.deepEqual(fs.readdirSync(directory),[first.id.slice(7)+'.png']);
    assert.equal(isValidPng(fs.readFileSync(path.join(directory,first.id.slice(7)+'.png'))),true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(project,'settings','vHierarchy.json'))).customIcons[0].id,first.id);
    await main.unload();
    main.load();
    assert.equal(main.methods.getState().customIcons[0].id,first.id);
    assert.equal(main.methods.getState().appearances[nodeUuid].iconColor,'#1234AB');
    assert.equal(await main.methods.removeIcon('custom:../../evil'),false);
    assert.equal(await main.methods.removeIcon(first.id),true);
    assert.equal(main.methods.getState().customIcons.length,0);
    assert.equal(main.methods.getState().appearances[nodeUuid],undefined);
    assert.deepEqual(fs.readdirSync(directory),[]);
  }finally{
    await main.unload();
    fs.rmSync(project,{recursive:true,force:true});
  }
});

test('Palette imports from file input and searches custom icons by user-friendly name, not hash',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
  assert.match(source,/importFile\.type = 'file'/);
  assert.match(source,/\.png,\.webp,\.svg,image\/png/);
  assert.match(source,/VHierarchyIconFiles\.rasterize\(file\)/);
  assert.match(source,/req\('cocos-vhierarchy', 'import-icon', prepared\.name, prepared\.dataUrl\)/);
  assert.match(source,/customName\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(source,/req\('cocos-vhierarchy', 'remove-icon', id\)/);
  assert.match(source,/state\.customIcons/);
  assert.match(source,/current\.icon = imported\.id/);
});

test('rasterizer converts a local image into a small offline PNG and revokes its object URL',async()=>{
  const calls=[];
  const context={
    Blob,
    URL:{createObjectURL:blob=>{calls.push('open');return 'blob:vh-test';},revokeObjectURL:url=>calls.push('revoke:'+url)},
    Image:class {
      naturalWidth=160; naturalHeight=80;
      set src(url){calls.push('image:'+url);Promise.resolve().then(()=>this.onload());}
    },
    document:{createElement:tag=>{
      assert.equal(tag,'canvas');
      return {width:0,height:0,getContext:()=>({clearRect:()=>{},drawImage:(...args)=>calls.push(['draw',...args])}),
        toDataURL:()=>dataUrl};
    }},
  };
  const local=vm.runInNewContext(script+'\nVHierarchyIconFiles;',context);
  const result=await local.rasterize({name:'My sprite.webp',size:24});
  assert.equal(result.name,'My sprite');
  assert.equal(result.dataUrl,dataUrl);
  assert.ok(calls.some(v=>Array.isArray(v)&&v[0]==='draw'));
  assert.ok(calls.includes('revoke:blob:vh-test'));
});
