const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const layersJs = fs.readFileSync(path.join(__dirname, '../dist/renderer/layers.js'), 'utf8');
const context = vm.createContext({ Map, Set, Promise, Date });
vm.runInContext(layersJs, context);
const {layerName, Lookup} = context.VHierarchyLayers;
const tick = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };

test('built-in node layers use exact engine masks', () => {
  assert.equal(layerName({layer:{value:1 << 30}}), 'DEFAULT');
  assert.equal(layerName({layer:{value:1 << 25}}), 'UI_2D');
  assert.equal(layerName({layer:{value:0}}), 'NONE');
  assert.equal(layerName({layer:{value:-1}}), 'ALL');
});

test('custom project layers use property enum names, never guessed built-ins', () => {
  const custom = {layer: {value:4, enumList:[{name:'Gameplay',value:4},{name:'DEFAULT',value:1 << 30}]}};
  assert.equal(layerName(custom), 'Gameplay');
  assert.equal(layerName({layer:{value:4}}), '0x00000004');
  assert.equal(layerName({layer:{value:'UI_GROUP'}}), 'UI_GROUP');
  assert.equal(layerName({layer:{value:1 << 25,enumList:[{name:'UI_Layer', value:1 << 25}]}}), 'UI_Layer');
});

test('invalid or absent Layer is hidden, never mistaken for DEFAULT',()=>{
  for(const x of [null, {}, {layer:undefined}, {layer:{value:'  '}}, {layer:{value:1.5}}, {layer:{value:NaN}}])
    assert.equal(layerName(x),null);
});

test('async cache deduplicates requests and limits parallel Scene IPC', async () => {
  const resolves = [];
  let concurrent = 0; let maxConcurrent = 0; let updates = 0;
  const lookup = new Lookup((_uuid) => new Promise(resolve => {
    concurrent++;
    maxConcurrent=Math.max(concurrent,maxConcurrent);
    resolves.push(data => {concurrent--;resolve(data);});
  }),()=>updates++,()=>100,12000,2);
  for(let i=0;i<5;i++) assert.equal(lookup.get('uuid'+i),null);
  assert.equal(lookup.get('uuid0'), null);
  await tick();
  assert.equal(resolves.length,2);
  resolves.shift()({layer:{value:1<<30}});
  await tick();
  assert.equal(resolves.length,2);
  resolves.shift()({layer:{value:1<<25}});
  await tick();
  while(resolves.length){resolves.shift()({layer:{value:1<<30}});await tick();}
  assert.equal(lookup.get('uuid0'),'DEFAULT');
  assert.equal(lookup.get('uuid1'),'UI_2D');
  assert.equal(maxConcurrent,2);
  assert.equal(updates,5);
  lookup.dispose();
});

test('disposal avoids late redraw and cache updates', async () => {
  let resolve;
  let updates=0;
  const lookup = new Lookup(() => new Promise(r => resolve=r),()=>updates++);
  lookup.get('uuid');
  await tick();
  lookup.dispose();
  resolve({layer:{value:1<<30}});
  await tick();
  assert.equal(updates,0);
  assert.equal(lookup.get('uuid'),null);
});

test('layer rendering is strictly metadata outside rename input and native search',()=>{
  const renderer = fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
  assert.match(renderer,/badge\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(renderer,/item\.nameEl\.insertAdjacentElement\('afterend', badge\)/);
  assert.match(renderer,/item\.searching \|\| item\.node\?\.isScene/);
  assert.match(renderer,/!item\.name\.toLowerCase\(\)\.includes\(searchText\)/);
  assert.doesNotMatch(renderer,/node\.name\s*=/);
  assert.match(renderer,/pointer-events:none;/);
  assert.match(renderer,/layerLookup\.dispose\(\)/);
  assert.match(renderer,/query-node/);
});
