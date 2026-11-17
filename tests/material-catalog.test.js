const test=require('node:test');
const assert=require('node:assert/strict');
const {MATERIAL_SYMBOL_NAMES,isMaterialIcon,filterIconNames,parseMaterialCodepoints,parseMaterialCache,setMaterialCatalog}=require('../dist/core/material-catalog.js');
const {sanitizeAppearance,isValidAppearance,sanitizeState,resolveAppearance}=require('../dist/core/model.js');
const node='abCDefghij+klmn/opqrst';
const parent='12345678-1234-1234-1234-123456789012';
test('catalog is curated, nonempty, deduplicated, and names are valid ligatures',()=>{
  assert.ok(MATERIAL_SYMBOL_NAMES.length>=160);
  assert.equal(new Set(MATERIAL_SYMBOL_NAMES).size,MATERIAL_SYMBOL_NAMES.length);
  for(const n of MATERIAL_SYMBOL_NAMES)assert.match(n,/^[a-z0-9_]{2,48}$/);
  assert.ok(isMaterialIcon('material:home'));
  assert.ok(isMaterialIcon('material:account_tree'));
  assert.ok(!isMaterialIcon('material:https://evil.site/img.svg'));
});
test('local icon search matches substrings without needing Google or changing node names',()=>{
  assert.deepEqual(filterIconNames(['home','folder_open','open_in_new','folder'], '  FoLdER '),['folder_open','folder']);
  assert.deepEqual(filterIconNames(['home','house','home_work'], 'home',1),['home']);
  assert.deepEqual(filterIconNames(['home','house'], 'zzz'),[]);
});
test('valid Material icon and RGB tint survive validation and project persistence',()=>{
  const a={icon:'material:folder_open',iconColor:'#3eA8FF',recursiveIcon:true,color:0};
  assert.equal(isValidAppearance(a),true);
  assert.deepEqual(sanitizeAppearance(a),a);
  const state=sanitizeState({appearances:{[node]:a}});
  assert.deepEqual(state.appearances[node],a);
});
test('unknown icons, invalid tints and malicious strings are rejected',()=>{
  for(const icon of ['material:whatever_random','material:<script>','material:../../../evil','https://google.com/icon.svg']){
    assert.equal(isValidAppearance({icon}),false);
    assert.deepEqual(sanitizeAppearance({icon}),{});
  }
  for(const iconColor of ['red','#fff','var(--evil)','transparent','#12345678',null]){
    assert.equal(isValidAppearance({icon:'material:home',iconColor}),false);
  }
  assert.equal(isValidAppearance({icon:'material:home',iconColor:'#abcdef'}),true);
});
test('recursive Material icon inherits its tint and can be overridden by child',()=>{
  const appearances={[parent]:{icon:'material:home',iconColor:'#ff9933',recursiveIcon:true}};
  assert.deepEqual(resolveAppearance(node,[parent],appearances),{
    color:undefined,icon:'material:home',iconColor:'#ff9933'
  });
  appearances[node]={iconColor:'#11bb22'};
  assert.equal(resolveAppearance(node,[parent],appearances).iconColor,'#11bb22');
  appearances[node]={icon:'material:star'};
  assert.equal(resolveAppearance(node,[parent],appearances).iconColor,undefined);
});


test('official codepoints parser accepts full names and rejects invalid or partial input',()=>{
  const entries=Array.from({length:1350},(_,i)=>`icon_test_${i} ${(0xe000+i).toString(16)}`);
  entries.push('account_tree f1c8');
  const result=parseMaterialCodepoints(entries.join('\n'));
  assert.equal(result.length,1351);
  assert.ok(result.includes('account_tree'));
  assert.deepEqual(parseMaterialCodepoints('home e88a'),[]);
  assert.deepEqual(parseMaterialCodepoints('a'.repeat(260000)),[]);
  assert.deepEqual(parseMaterialCache(['home','folder']),[]);
  assert.deepEqual(parseMaterialCache([...result,'<script>']),[]);
  assert.deepEqual(parseMaterialCache(result),result);
});
test('official catalog whitelist accepts verified new icons but not arbitrary names',()=>{
  assert.equal(isMaterialIcon('material:new_official_icon_2026'),false);
  const full=[...Array.from({length:1200},(_,i)=>`official_${i}`),'new_official_icon_2026'];
  setMaterialCatalog(parseMaterialCache(full));
  assert.equal(isMaterialIcon('material:new_official_icon_2026'),true);
  assert.equal(isValidAppearance({icon:'material:new_official_icon_2026',iconColor:'#123456'}),true);
  assert.equal(isMaterialIcon('material:https://evil.test'),false);
  setMaterialCatalog([]);
  assert.equal(isMaterialIcon('material:new_official_icon_2026'),false);
});
