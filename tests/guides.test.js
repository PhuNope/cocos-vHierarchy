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
