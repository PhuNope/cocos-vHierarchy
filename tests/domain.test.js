const test = require('node:test');
const assert = require('node:assert/strict');
const {PALETTE,ICONS,sanitizeState,sanitizeAppearance,resolveAppearance} = require('../dist/core/model.js');
const id = 'd18cf1fe-3d67-4b3b-9b2a-fd0487a71421';
const child = 'c81231fe-3d67-4b3b-9b2a-fd0487a71422';
test('sensible defaults and data table from Unity',()=>{
  const s=sanitizeState({});
  assert.equal(s.options.enabled,true);assert.equal(s.options.sceneSelector,false);
  assert.equal(PALETTE.length,9);assert.equal(ICONS.length,12);
  assert.ok(ICONS.includes('folder'));
});
test('only known settings survive untrusted user configuration',()=>{
  const s=sanitizeState({options:{enabled:false,guideMode:'bogus',hierarchyLines:'false',colorBrightness:99},appearances:{[id]:{color:7,icon:'⭐',unknown:'no'},'../../bad':{color:1}},bookmarks:[{uuid:id,name:'Root'},{uuid:'not-uuid',name:'Bad'}]});
  assert.equal(s.options.enabled,false);assert.equal(s.options.guideMode,'tree');
  assert.equal(s.options.hierarchyLines,true);assert.equal(s.options.colorBrightness,2);
  assert.deepEqual(s.appearances[id],{color:7,icon:'⭐'});
  assert.equal(Object.keys(s.appearances).length,1);assert.equal(s.bookmarks.length,1);
});
test('recursive appearance inherits from parent, explicit child overrides',()=>{
  const data={[id]:{color:2,icon:'📷',recursiveColor:true,recursiveIcon:true},[child]:{color:5}};
  assert.deepEqual(resolveAppearance(child,[id],data),{color:5,icon:'📷'});
  assert.deepEqual(resolveAppearance('missing',[id],data),{color:2,icon:'📷'});
});
test('reject icon/colour out of range',()=>{
  assert.deepEqual(sanitizeAppearance({color:-1,icon:'<img onerror=x>',recursiveColor:'true'}),{});
});

test('new SVG icon keys and old emoji settings remain supported',()=>{
  assert.equal(sanitizeAppearance({icon:'folder'}).icon,'folder');
  assert.equal(sanitizeAppearance({icon:'📁'}).icon,'📁');
});

test('guide click folding is on by default and is persisted as a boolean',()=>{
  assert.equal(sanitizeState({}).options.foldOnGuideClick,true);
  assert.equal(sanitizeState({options:{foldOnGuideClick:false}}).options.foldOnGuideClick,false);
  assert.equal(sanitizeState({options:{foldOnGuideClick:'false'}}).options.foldOnGuideClick,true);
});

test('component minimap is intentionally absent, including migrated settings',()=>{
  const state=sanitizeState({options:{componentMinimap:true}});
  assert.equal(Object.hasOwn(state.options,'componentMinimap'),false);
});

test('gradient option defaults true and migrates old project settings safely',()=>{
  assert.equal(sanitizeState({}).options.colorGradientsEnabled,true);
  assert.equal(sanitizeState({options:{colorGradientsEnabled:false}}).options.colorGradientsEnabled,false);
  assert.equal(sanitizeState({options:{colorGradientsEnabled:'false'}}).options.colorGradientsEnabled,true);
});
