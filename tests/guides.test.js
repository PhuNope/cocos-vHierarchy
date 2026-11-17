'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../dist/renderer/guides.js'),'utf8');
const guides = vm.runInNewContext(`${code}\nVHierarchyGuides;`,{});
const row = (depth, anchor=80, extra={}) => ({padding:12+depth*20,margin:0,anchor,reportedDepth:depth,...extra});
test('hook parity: native padding indentation, direct anchor and final child elbows',()=>{
  // root, child, grandchild, grandchild, child, root
  const {layout,nodes}=guides.calculate([row(0),row(1,60),row(2,80),row(2,80),row(1,60),row(0)]);
  assert.equal(layout.mode,'padding');assert.equal(layout.step,20);assert.equal(layout.base,12);
  assert.equal(nodes[1].hasNextSibling,true);
  assert.equal(nodes[2].hasNextSibling,true);
  assert.equal(nodes[3].hasNextSibling,false);
  assert.equal(nodes[4].hasNextSibling,false);
  assert.ok(nodes[2].rails.some(x => x.level===1 && x.shape==='full'));
  assert.ok(nodes[2].rails.some(x => x.level===2 && x.shape==='lower'));
  assert.equal(nodes[1].elbowX,22);
  assert.equal(nodes[1].elbowWidth,38);
});
test('hook parity: margin-indented trees and invalid virtualization gaps',()=>{
  const rows=[{padding:0,margin:9,anchor:50,reportedDepth:0},
    {padding:0,margin:29,anchor:60,reportedDepth:1},
    {padding:0,margin:69,anchor:80,reportedDepth:3},
    {padding:0,margin:49,anchor:75,reportedDepth:2},
    {padding:0,margin:9,anchor:50,reportedDepth:0}];
  const {layout,nodes}=guides.calculate(rows);
  assert.equal(layout.mode,'margin');assert.equal(layout.step,20);assert.equal(layout.base,9);
  assert.equal(nodes[1].offset,-29);
  assert.equal(nodes[2].valid,false);
  assert.equal(nodes[3].valid,false);
  assert.equal(nodes[4].valid,true);
});
test('searching rows suspend guides rather than linking unrelated parents',()=>{
  const nodes=guides.calculate([row(0),row(1,60,{searching:true}),row(2),row(0)]).nodes;
  assert.equal(nodes[1].valid,false);assert.equal(nodes[2].valid,false);
  assert.equal(nodes[3].valid,true);
});


test('clicking a child elbow resolves to its direct expanded parent',()=>{
  const {layout,nodes}=guides.calculate([row(0),row(1,60),row(2,80),row(2,80),row(1,60)]);
  const child=nodes[2],height=20;
  const x=child.offset+child.elbowX+child.elbowWidth/2;
  assert.equal(guides.hitTest(child,layout,x,10,height,'tree'),2);
  assert.equal(guides.foldParentIndex(nodes,2,2),1);
  assert.equal(guides.hitTest(child,layout,x,19,height,'tree'),null);
});
test('clicking an ancestor rail resolves to the correct ancestor parent, not current node',()=>{
  const {layout,nodes}=guides.calculate([row(0),row(1,60),row(2,80),row(2,80),row(1,60)]);
  const item=nodes[2];
  const railX=item.offset+layout.base+(1-.5)*layout.step;
  assert.equal(guides.hitTest(item,layout,railX,8,20,'tree'),1);
  assert.equal(guides.foldParentIndex(nodes,2,1),0);
  assert.equal(guides.hitTest(item,layout,railX+9,8,20,'tree'),null);
});
test('lower rails only capture their lower half; minimal mode supports last branch',()=>{
  const {layout,nodes}=guides.calculate([row(0),row(1,60),row(2,80),row(2,80),row(1,60)]);
  const item=nodes[2];
  const railX=item.offset+layout.base+(2-.5)*layout.step;
  assert.equal(guides.hitTest(item,layout,railX,1,20,'tree'),null);
  assert.equal(guides.hitTest(item,layout,railX,16,20,'tree'),2);
  assert.equal(guides.hitTest(nodes[3],layout,railX,5,20,'minimal'),2);
  assert.equal(guides.foldParentIndex(nodes,3,2),1);
});
test('invalid/filtered rows cannot fold guessed parents, and margin offset is accounted for',()=>{
  const {layout,nodes}=guides.calculate([
    {padding:0,margin:9,anchor:50,reportedDepth:0},
    {padding:0,margin:29,anchor:60,reportedDepth:1},
    {padding:0,margin:69,anchor:80,reportedDepth:3},
  ]);
  assert.equal(layout.mode,'margin');
  assert.equal(guides.hitTest(nodes[2],layout,0,10,20,'tree'),null);
  assert.equal(guides.foldParentIndex(nodes,2,2),null);
  const item=nodes[1];
  const x=item.offset+item.elbowX+item.elbowWidth/2;
  assert.equal(guides.hitTest(item,layout,x,10,20,'tree'),1);
  assert.equal(guides.foldParentIndex(nodes,1,1),0);
});

test('guide target uses 8px tolerance but does not capture unrelated row area',()=>{
  const {layout,nodes}=guides.calculate([row(0),row(1,60),row(2,80)]);
  const child=nodes[2],x=child.offset+child.elbowX+child.elbowWidth/2;
  assert.equal(guides.hitTest(child,layout,x,17,20,'tree'),2);
  assert.equal(guides.hitTest(child,layout,x,19,20,'tree'),null);
  assert.equal(guides.hitTest(child,layout,200,10,20,'tree'),null);
});
