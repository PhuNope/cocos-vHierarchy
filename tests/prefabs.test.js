const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {sanitizeState,isPrefabAppearanceKey} = require('../dist/core/model.js');
const source=fs.readFileSync(path.join(__dirname,'../dist/renderer/prefabs.js'),'utf8');
const prefab=vm.runInNewContext(source+'\nVHierarchyPrefabs;',{});
const asset='42cf8a6d-690f-4eaf-89aa-170b78de3e35';
const nestedAsset='552fee76-a559-4eaa-a8a2-92009a4b017c';
const root=(level,uuid=asset)=>({prefab:{assetUuid:uuid},level,name:'Player'});
const node=(level,uuid=asset)=>({prefab:{assetUuid:uuid},level,name:'Weapon'});

test('Prefab root has the same appearance identity in source stage and any Scene instance',()=>{
  assert.equal(prefab.keyFor(root('0_0'),[{isScene:true,level:'0'}]),`prefab|${asset}|root`);
  assert.equal(prefab.keyFor(root('0_5_2'),[{isScene:true,level:'0'},{level:'0_5'}]),`prefab|${asset}|root`);
  assert.equal(isPrefabAppearanceKey(`prefab|${asset}|root`),true);
});
test('child appearance follows a new Prefab instance even if node UUIDs and scene positions change',()=>{
  const source=prefab.keyFor(node('0_0_3_2'),[root('0_0'),node('0_0_3')]);
  const instance=prefab.keyFor(node('0_9_3_2'),[root('0_9'),node('0_9_3')]);
  assert.equal(source,`prefab|${asset}|3_2`);
  assert.equal(instance,source);
  const saved=sanitizeState({prefabAppearances:{[source]:{color:4,icon:'camera',iconColor:'#44bbdd'}}});
  assert.deepEqual(saved.prefabAppearances[instance],{color:4,icon:'camera',iconColor:'#44bbdd'});
});
test('nested Prefab assets keep separate appearance identities',()=>{
  const parent=root('0_4');
  const nested=node('0_4_1',nestedAsset);
  assert.equal(prefab.keyFor(nested,[parent]),`prefab|${nestedAsset}|root`);
  assert.equal(prefab.keyFor(node('0_4_1_0',nestedAsset),[parent,nested]),`prefab|${nestedAsset}|0`);
  assert.notEqual(prefab.keyFor(nested,[parent]),prefab.keyFor(node('0_4_1',asset),[parent]));
});
test('ordinary children and added prefab children do not accidentally receive an asset template',()=>{
  assert.equal(prefab.keyFor({level:'0_4_0'},[root('0_4')]),`prefab|${asset}|0`);
  assert.equal(prefab.keyFor({level:'0_4_0',prefab:{isAddedChild:true}},[root('0_4')]),null);
  assert.equal(prefab.keyFor({level:'0_4_0'},[{level:'0_4'}]),null);
  assert.equal(prefab.keyFor({level:'0_4',isScene:true,prefab:{assetUuid:asset}},[]),null);
});
test('invalid prefab keys and malicious paths do not survive settings sanitization',()=>{
  const safe=`prefab|${asset}|0_2_3`;
  const bad=['prefab|../../etc/passwd|root',`prefab|${asset}|../root`,`prefab|${asset}|x`,'prefab|short|root',`prefab|${asset}|0_0|x`];
  for(const key of bad)assert.equal(isPrefabAppearanceKey(key),false,key);
  const raw={prefabAppearances:{[safe]:{color:2,icon:'folder'},[bad[0]]:{color:1},[bad[1]]:{icon:'camera'}}};
  const data=sanitizeState(raw);
  assert.deepEqual(data.prefabAppearances[safe],{color:2,icon:'folder'});
  assert.equal(Object.keys(data.prefabAppearances).length,1);
  assert.equal(sanitizeState({}).prefabAppearances[safe],undefined,'old project files migrate safely');
});
test('Prefab visual CSS leaves the native prefab label color untouched',()=>{
  const renderer=fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
  assert.match(renderer,/\.tree-node\[is-prefab-node\]\[data-vh-tint\] > ui-drag-item\.drag-item/);
  assert.match(renderer,/\.tree-node\[is-selected="true"\]\[is-prefab-node\]\[data-vh-tint\]/);
  assert.match(renderer,/attributeFilter: \['is-expand'[\s\S]*?'is-prefab-node', 'is-prefab-root', 'is-prefab-nested'/);
  assert.match(renderer,/n\.matches\('\.tree-node,ui-rename-input,ui-asset-image/);
  assert.match(renderer,/VHierarchyPrefabs\.keyFor\(item\.node, stack\.map\(parent => parent\.node\)\)/);
  assert.match(renderer,/ownAppearance\(item\)/);
  assert.match(renderer,/item\.prefabKey \|\| undefined/);
  assert.doesNotMatch(renderer,/ui-rename-input\.name\s*\{[^}]*\bcolor\s*:/);
  assert.doesNotMatch(renderer,/ui-rename-input\.name\s*\{[^}]*\bopacity\s*:/);
});

test('Prefab icon skin hides only native left glyph, not prefab label or right component',()=>{
  const renderer=fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
  assert.match(renderer,/VHierarchyPrefabIcons\.sync\(item, paletteIcon, enabled\)/);
  assert.match(renderer,/data-vh-prefab-icon-replaced='true'/);
  assert.match(renderer,/> \[data-vh-native-prefab-icon='true'\] \{/);
  assert.match(renderer,/opacity:0 !important/);
  assert.match(renderer,/margin-left:calc\(0px - var\(--vh-prefab-icon-width,16px\)\) !important/);
  assert.match(renderer,/pointer-events:auto !important/);
  assert.match(renderer,/native\.removeAttribute\('data-vh-native-prefab-icon'\)/);
  assert.match(renderer,/h\.removeAttribute\('data-vh-prefab-icon-replaced'\)/);
  assert.doesNotMatch(renderer,/ui-rename-input\.name\s*\{[^}]*\bcolor\s*:/);
  assert.doesNotMatch(renderer,/ui-icon\[default="asset"\]\s*\{[^}]*opacity:0/);
});
