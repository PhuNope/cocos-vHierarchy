'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../dist/renderer/scene-commands.js'), 'utf8');
const commands = vm.runInNewContext(code + '\nVHierarchySceneCommands;', {});
const uuid = 'b204319a-288c-484a-8f60-287573a05ab6';

function scenePort({ initial = true, dirty = false, rejectSet = false, rejectEnd = false, dirtyOnCommit = true } = {}) {
  let active = initial;
  let saved = initial;
  let unsaved = dirty;
  let recording = false;
  const messages = [];
  const request = async (pkg, msg, arg) => {
    assert.equal(pkg, 'scene');
    messages.push({ msg, arg });
    if (msg === 'query-node') return Object.freeze({ active: Object.freeze({ value: active, type: 'Boolean' }) });
    if (msg === 'begin-recording') { recording = true; return 0; }
    if (msg === 'set-property') {
      if (rejectSet) return false;
      assert.equal(recording, true, 'scene changes must occur inside a recording');
      assert.equal(arg.path, 'active');
      assert.equal(Object.hasOwn(arg, 'record'), false);
      active = arg.dump.value;
      return true;
    }
    if (msg === 'end-recording') {
      if (rejectEnd) return false;
      recording = false;
      if (dirtyOnCommit) unsaved = true;
      return undefined;
    }
    if (msg === 'cancel-recording') { recording = false; return true; }
    if (msg === 'query-dirty') return unsaved;
    if (msg === 'snapshot') return undefined;
    throw Error('Unexpected Scene IPC ' + msg);
  };
  return { request, messages, get active() { return active; }, get dirty() { return unsaved; },
    save() { saved = active; unsaved = false; }, get saved() { return saved; } };
}

test('Active toggle uses a single explicit undo transaction on read-only dumps', async () => {
  const scene = scenePort();
  assert.equal(await commands.toggleActive(uuid, scene.request), true);
  assert.equal(scene.active, false);
  assert.equal(scene.dirty, true);
  assert.deepEqual(scene.messages.map(e => e.msg),
    ['query-node', 'begin-recording', 'set-property', 'end-recording', 'query-dirty']);
  assert.equal(scene.messages[1].arg, uuid);
  assert.equal(scene.messages[3].arg, 0, 'undo ID zero is valid');
  assert.equal(scene.messages[2].arg.dump.value, false);
});

test('Ctrl+S then checkbox off/on leaves the Scene dirty after EACH edit', async () => {
  const scene = scenePort();
  await commands.toggleActive(uuid, scene.request);
  scene.save();
  assert.equal(scene.dirty, false);
  await commands.toggleActive(uuid, scene.request);
  assert.equal(scene.active, true);
  assert.equal(scene.dirty, true, 'toggle immediately following Ctrl+S must mark scene dirty');
  scene.save();
  await commands.toggleActive(uuid, scene.request);
  assert.equal(scene.active, false);
  assert.equal(scene.dirty, true, 'subsequent saved scene edits must also mark dirty');
  const msgs = scene.messages.map(e => e.msg);
  assert.equal(msgs.filter(msg => msg === 'begin-recording').length, 3);
  assert.equal(msgs.filter(msg => msg === 'end-recording').length, 3);
  assert.equal(msgs.filter(msg => msg === 'snapshot').length, 0, 'do not double-record undo');
});

test('rejected set-property cancels recording and never snapshots', async () => {
  const scene = scenePort({ rejectSet: true });
  await assert.rejects(() => commands.toggleActive(uuid, scene.request), /set-property rejected/);
  assert.deepEqual(scene.messages.map(e => e.msg),
    ['query-node', 'begin-recording', 'set-property', 'cancel-recording']);
  assert.equal(scene.active, true);
  assert.equal(commands.isPending(uuid), false);
});

test('failed end-recording cancels the pending transaction and releases lock', async () => {
  const scene = scenePort({ rejectEnd: true });
  await assert.rejects(() => commands.toggleActive(uuid, scene.request), /end-recording rejected/);
  assert.equal(scene.messages.at(-1).msg, 'cancel-recording');
  assert.equal(commands.isPending(uuid), false);
});

test('dirty verification falls back to snapshot; never silently reports success if still clean', async () => {
  const scene = scenePort({ dirtyOnCommit: false });
  await assert.rejects(() => commands.toggleActive(uuid, scene.request), /Scene is still clean/);
  assert.deepEqual(scene.messages.map(e => e.msg),
    ['query-node', 'begin-recording', 'set-property', 'end-recording',
      'query-dirty', 'snapshot', 'query-dirty']);
  assert.equal(scene.active, false, 'do not secretly revert a successful mutation');
  assert.equal(commands.isPending(uuid), false);
});

test('unexpected node dumps are rejected before recording', async () => {
  const events = [];
  await assert.rejects(() => commands.toggleActive(uuid, async (pkg, msg) => {
    events.push(msg); return { active: true };
  }), /editable active dump/);
  assert.deepEqual(events, ['query-node']);
});

test('missing begin-recording ID is an error and never mutates Scene', async () => {
  const events = [];
  await assert.rejects(() => commands.toggleActive(uuid, async (pkg, msg) => {
    events.push(msg); return msg === 'query-node' ? { active: { value: false } } : undefined;
  }), /undo transaction ID/);
  assert.deepEqual(events, ['query-node', 'begin-recording']);
});

test('repeated click while one toggle is pending is ignored', async () => {
  let unblock;
  const scene = scenePort();
  const req = (pkg, msg, arg) => msg === 'query-node'
    ? new Promise(resolve => { unblock = () => resolve({ active: { value: true } }); })
    : scene.request(pkg, msg, arg);
  const pending = commands.toggleActive(uuid, req);
  assert.equal(commands.isPending(uuid), true);
  assert.equal(await commands.toggleActive(uuid, req), false);
  unblock();
  assert.equal(await pending, true);
  assert.equal(commands.isPending(uuid), false);
});

test('legacy snapshot fallback may establish dirty when manual commit did not', async () => {
  const events = [];
  let state = false;
  const request = async (pkg, msg, arg) => {
    events.push(msg);
    if (msg === 'query-node') return { active: { value: true } };
    if (msg === 'begin-recording') return 'tx-id';
    if (msg === 'set-property') return true;
    if (msg === 'snapshot') { state = true; return; }
    if (msg === 'query-dirty') return state;
  };
  assert.equal(await commands.toggleActive(uuid, request), true);
  assert.deepEqual(events, ['query-node', 'begin-recording', 'set-property',
    'end-recording', 'query-dirty', 'snapshot', 'query-dirty']);
});

test('failure to query dirty after committed change is surfaced without canceling a completed undo record', async () => {
  const events = [];
  const request = async (pkg, msg, arg) => {
    events.push(msg);
    if (msg === 'query-node') return { active: { value: true } };
    if (msg === 'begin-recording') return 'tx-id';
    if (msg === 'set-property') return true;
    if (msg === 'query-dirty') throw new Error('Scene is temporarily unavailable');
  };
  await assert.rejects(() => commands.toggleActive(uuid, request), /temporarily unavailable/);
  assert.ok(!events.includes('cancel-recording'), 'a committed mutation must not be canceled afterwards');
});
