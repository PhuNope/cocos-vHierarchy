const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/renderer/colors.js'),'utf8');
const colors=vm.runInNewContext(source+'\nVHierarchyColors;',{});
const base={colorSaturation:1,colorBrightness:1,colorGradientsEnabled:true};
const hex='#5d94b5';

test('theme recognizer uses luminance and explicit Editor theme hints',()=>{
  assert.equal(colors.detectTheme(['#24282f']), 'dark');
  assert.equal(colors.detectTheme(['rgb(249, 250, 252)']), 'light');
  assert.equal(colors.detectTheme(['rgba(250,250,250,1)']), 'light');
  assert.equal(colors.detectTheme([], 'theme-light'),'light');
  assert.equal(colors.detectTheme(['#000000'],'theme-dark'),'dark');
  assert.equal(colors.detectTheme(['transparent']),'dark');
});
test('saturation setting changes output color, 0 gives grayscale',()=>{
  const vivid=colors.rgb(hex,'dark',base);
  const dull=colors.rgb(hex,'dark',{...base,colorSaturation:0});
  assert.notDeepEqual(Array.from(vivid),Array.from(dull));
  assert.equal(dull[0],dull[1]);assert.equal(dull[1],dull[2]);
  assert.notEqual(colors.swatch(hex,'dark',base),colors.swatch(hex,'dark',{...base,colorSaturation:0}));
});
test('brightness changes output while defaults remain useful',()=>{
  const normal=colors.rgb(hex,'dark',base);
  const darker=colors.rgb(hex,'dark',{...base,colorBrightness:.5});
  assert.ok(darker.reduce((a,b)=>a+b,0) < normal.reduce((a,b)=>a+b,0));
  const lighter=colors.rgb(hex,'light',base);
  assert.ok(lighter.reduce((a,b)=>a+b,0) > normal.reduce((a,b)=>a+b,0));
});
test('gradient fades right edge and flat option removes gradient falloff',()=>{
  const gradient=colors.rowBackground(hex,'dark',base);
  assert.match(gradient,/linear-gradient\(90deg,/);
  assert.match(gradient,/ 9%/);
  assert.match(gradient,/ 97%/);
  const flat=colors.rowBackground(hex,'dark',{...base,colorGradientsEnabled:false});
  assert.match(flat,/^linear-gradient\(rgba\(/);
  assert.doesNotMatch(flat,/90deg/);
  assert.notEqual(gradient,flat);
});
test('grey slot is flat regardless of gradient option',()=>{
  const grey=colors.rowBackground('#777d89','dark',base,false,true);
  assert.doesNotMatch(grey,/90deg/);
});
test('inherited color is visibly softer than explicit assignment',()=>{
  const direct=colors.rowBackground(hex,'dark',base,false);
  const inherited=colors.rowBackground(hex,'dark',base,true);
  assert.notEqual(inherited,direct);
  assert.ok(colors.rgb(hex,'dark',base,true).every(n=>n>=0&&n<=255));
});
test('bad/unknown input never creates invalid color channels',()=>{
  assert.equal(colors.parseRgb('invalid'),null);
  assert.equal(colors.parseRgb('#aabbcc').length,3);
  const v=colors.rgb(hex,'dark',{...base,colorSaturation:NaN,colorBrightness:Infinity});
  assert.ok(v.every(n=>Number.isInteger(n)&&n>=0&&n<=255));
});
