'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual compiled adapter with a simple DOM representing the
// Cocos 3.8.8 tree-node template, not just a regex against its source.
const code = fs.readFileSync(path.join(__dirname,'../dist/renderer/prefab-icon.js'),'utf8');
const adapter = vm.runInNewContext(code+'\nVHierarchyPrefabIcons;',{});
class Element {
  constructor(tag, classes='',width=16) {
    this.tagName=tag.toUpperCase(); this.classes=new Set(classes.split(' ').filter(Boolean));
    this.classList={contains:name=>this.classes.has(name)};
    this.width=width;this.attributes=new Map();this.children=[];this.parentElement=null;
    const properties=new Map();
    this.style={ setProperty:(key,val)=>properties.set(key,val),
      removeProperty:key=>properties.delete(key), getPropertyValue:key=>properties.get(key)||'' };
  }
  get nextElementSibling() {
    if(!this.parentElement)return null;
    return this.parentElement.children[this.parentElement.children.indexOf(this)+1]||null;
  }
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
  insertBefore(node,before){
    if(node.parentElement){node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);}
    const idx=this.children.indexOf(before);
    if(idx<0) throw new Error('target not in row');
    this.children.splice(idx,0,node);node.parentElement=this;
  }
  getBoundingClientRect(){return {width:this.width,height:16};}
  setAttribute(key,val){this.attributes.set(key,val);}
  getAttribute(key){return this.attributes.get(key)??null;}
  removeAttribute(key){this.attributes.delete(key);}
  hasAttribute(key){return this.attributes.has(key);}
}
function makeRow({prefab=true, asset=true, typeScript=true, isPrefabRoot=true}={}){
  const row=new Element('div','tree-node');
  if(prefab)row.setAttribute('is-prefab-node','2');
  const drag=new Element('ui-drag-item','drag-item');
  const arrow=new Element('ui-icon','arrow');
  const native=asset?new Element('ui-asset-image','root'):new Element('ui-icon','');
  const name=new Element('ui-rename-input','name');
  const lock=new Element('ui-icon','lock');
  const component=new Element('ui-icon',typeScript?'typescript':'');
  const marker=new Element('img','vh-icon');
  drag.append(arrow,native,name,lock,component,marker);
  return {item:{row,drag,nameEl:name,node:prefab?{isPrefabRoot,prefab:{state:2,assetUuid:'abcdef'}}:{},prefabKey:prefab?'prefab|abcdef|root':null},
    arrow,native,name,lock,component,marker};
}

test('opening a Prefab replaces its native left glyph slot without adding a second column',()=>{
  const {item,native,marker,name,component}=makeRow();
  assert.equal(adapter.nativeGlyph(item.drag,name),native);
  adapter.sync(item,marker,true);
  assert.equal(marker.nextElementSibling,native,'custom icon inserted BEFORE native glyph');
  assert.equal(native.nextElementSibling,name,'native Cocos DOM remains intact');
  assert.equal(item.row.getAttribute('data-vh-prefab-icon-replaced'),'true');
  assert.equal(native.getAttribute('data-vh-native-prefab-icon'),'true');
  assert.equal(item.row.style.getPropertyValue('--vh-prefab-icon-width'),'16px');
  assert.equal(item.drag.children.at(-1),component,'trailing Cocos TypeScript/component icon retained');
});

test('Prefab row remains decorated after native ui-asset-image is recreated by Vue',()=>{
  const {item,native,marker,name}=makeRow();
  adapter.sync(item,marker,true);
  const replacement=new Element('ui-asset-image','root');
  const idx=item.drag.children.indexOf(native);
  item.drag.children[idx]=replacement;replacement.parentElement=item.drag;
  native.parentElement=null;
  adapter.sync(item,marker,true);
  assert.equal(marker.nextElementSibling,replacement);
  assert.equal(replacement.getAttribute('data-vh-native-prefab-icon'),'true');
  assert.equal(item.row.getAttribute('data-vh-prefab-icon-replaced'),'true');
});

test('clearing appearance or disabling plugin fully restores Prefab native glyph',()=>{
  const {item,native,marker}=makeRow();
  adapter.sync(item,marker,true);
  adapter.sync(item,null,true);
  assert.equal(item.row.hasAttribute('data-vh-prefab-icon-replaced'),false);
  assert.equal(native.hasAttribute('data-vh-native-prefab-icon'),false);
  assert.equal(item.row.style.getPropertyValue('--vh-prefab-icon-width'),'');
  adapter.sync(item,marker,true);
  adapter.sync(item,marker,false);
  assert.equal(native.hasAttribute('data-vh-native-prefab-icon'),false);
  assert.equal(marker.nextElementSibling,item.nameEl);
});

test('normal nodes retain the old position and do not hide native component icon',()=>{
  const {item,native,marker,name,component}=makeRow({prefab:false});
  adapter.sync(item,marker,true);
  assert.equal(marker.nextElementSibling,name);
  assert.equal(native.hasAttribute('data-vh-native-prefab-icon'),false);
  assert.equal(item.row.hasAttribute('data-vh-prefab-icon-replaced'),false);
  assert.equal(item.drag.children.at(-1),component);
});

test('does not replace the trailing TypeScript icon when native left-hand icon is absent',()=>{
  const {item,native,marker,name,component}=makeRow();
  item.drag.children.splice(item.drag.children.indexOf(native),1);
  adapter.sync(item,marker,true);
  assert.equal(marker.nextElementSibling,name);
  assert.equal(component.hasAttribute('data-vh-native-prefab-icon'),false);
  assert.equal(item.row.hasAttribute('data-vh-prefab-icon-replaced'),false);
});

test('supports Prefab nodes whose native glyph is a Cocos ui-icon instead of asset-image',()=>{
  const {item,native,marker}=makeRow({asset:false});
  adapter.sync(item,marker,true);
  assert.equal(marker.nextElementSibling,native);
  assert.equal(native.getAttribute('data-vh-native-prefab-icon'),'true');
});

test('uses native width with bounds for stable flex slot',()=>{
  const {item,native,marker}=makeRow();
  native.width=22.7;
  adapter.sync(item,marker,true);
  assert.equal(item.row.style.getPropertyValue('--vh-prefab-icon-width'),'23px');
  native.width=200;
  adapter.sync(item,marker,true);
  assert.equal(item.row.style.getPropertyValue('--vh-prefab-icon-width'),'24px');
});
