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

test('selected row highlights only its path back to the real visible parent',()=>{
  // Scene, A, A1, A2, B, C: select A2. Vertical highlighted through A1,
  // selected elbows on A and A2. B/C and A1 horizontal elbows stay neutral.
  const nodes=guides.calculate([row(0),row(1),row(2),row(2),row(1),row(1)]).nodes;
  const h=guides.selectedGuides(nodes,[3]);
  assert.equal(h[0].elbow,false);
  assert.equal(h[1].elbow,true);
  assert.equal(h[2].elbow,false);
  assert.equal(h[2].throughElbow,true);
  assert.ok(h[2].rails.includes(2));
  assert.equal(h[3].elbow,true);
  assert.equal(h[3].throughElbow,false);
  assert.equal(h[4].elbow,false);
  assert.equal(h[5].rails.length,0);
});
test('selected branches include all earlier siblings but not unrelated later siblings',()=>{
  const nodes=guides.calculate([row(0),row(1),row(1),row(1),row(0),row(1)]).nodes;
  const h=guides.selectedGuides(nodes,[3]);
  assert.equal(h[1].throughElbow,true);
  assert.equal(h[2].throughElbow,true);
  assert.equal(h[3].elbow,true);
  assert.equal(h[4].rails.length,0);
  assert.equal(h[5].elbow,false);
});
test('multi-selection unions guide segments and invalid/filtered gaps cannot create phantom highlight',()=>{
  const nodes=guides.calculate([row(0),row(1),row(2),row(2),row(1),row(0)]).nodes;
  const h=guides.selectedGuides(nodes,[2,4,4,-1,100]);
  assert.equal(h[1].elbow,true);
  assert.equal(h[2].elbow,true);
  assert.equal(h[4].elbow,true);
  assert.equal(h[5].elbow,false);
  const filtered=guides.calculate([row(0),row(1,80,{searching:true}),row(2)]).nodes;
  assert.deepEqual(Array.from(guides.selectedGuides(filtered,[2])[2].rails),[]);
  assert.equal(guides.selectedGuides(filtered,[2])[2].elbow,false);
});
test('native dashed drop rail snaps to measured elbow, not guessed 20px offset',()=>{
  // Screenshot: native dashed x34; matching hierarchy guide x54, step20.
  assert.equal(guides.dropGuideCorrection(34,54,20),20);
  assert.equal(guides.dropGuideCorrection(54,54,20),0);
  assert.equal(guides.dropGuideCorrection(34,56.3,20),22.5);
  assert.equal(guides.dropGuideCorrection(34,85,20),0); // unrelated depth
  assert.equal(guides.dropGuideCorrection(NaN,54,20),0);
  assert.equal(guides.dropGuideCorrection(34,54,0),0);
});
test('large hierarchy selection uses bounded per-depth traversal',()=>{
  const rows=[row(0),...Array.from({length:2500},()=>row(1))];
  const nodes=guides.calculate(rows).nodes;
  const t=performance.now();
  const highlighted=guides.selectedGuides(nodes,[2500]);
  assert.equal(highlighted[2500].elbow,true);
  assert.equal(highlighted[2499].throughElbow,true);
  assert.equal(highlighted[0].elbow,false);
  assert.ok(performance.now()-t<2000,'2500 rows should not be quadratic');
});


test('drop trunk targets actual parent rail, not the dotted line beside the icon',()=>{
  const {nodes}=guides.calculate([row(0),row(1),row(2),row(3),row(2),row(1)]);
  assert.equal(guides.dropTrunkLevel(nodes,1),1); // scene child uses own guide
  assert.equal(guides.dropTrunkLevel(nodes,2),1); // child of Node => Node trunk
  assert.equal(guides.dropTrunkLevel(nodes,3),2); // nested prefab => grandparent trunk
  assert.equal(guides.dropTrunkLevel(nodes,4),1);
  assert.equal(guides.dropTrunkLevel(nodes,0),null);
  assert.equal(guides.dropTrunkLevel(nodes,999),null);
});
test('drop rail x76 snaps to painted parent guide x56 and does not accumulate on redraw',()=>{
  const first=guides.dropTrunkShift(76,0,56,20);
  assert.equal(first,-20);
  assert.equal(guides.dropTrunkShift(76+first,first,56,20),-20);
  assert.equal(guides.dropTrunkShift(76,0,56,20),-20);
  // Native offset changes while dragging into another parent.
  assert.equal(guides.dropTrunkShift(96,-20,76,20),-40);
  assert.equal(guides.dropTrunkShift(55.7,0,56,20),.5);
  assert.equal(guides.dropTrunkShift(76,0,156,20),80); // > one-indent allowed
  assert.equal(guides.dropTrunkShift(76,0,400,20),null); // suspicious geometry
});
