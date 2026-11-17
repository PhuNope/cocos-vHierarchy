const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual compiled showPalette function against a minimal DOM test
// double, rather than only checking that attributes appear in source text.
const renderer = fs.readFileSync(path.join(__dirname, '../dist/renderer/renderer.js'), 'utf8');
const colors = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/renderer/colors.js'), 'utf8') + '\nVHierarchyColors;', {});
const begin = renderer.indexOf('function showPalette(item, x, y) {');
const end = renderer.indexOf('function showSettings()', begin);
assert.ok(begin >= 0 && end > begin, 'compiled showPalette should be extractable');
const showPaletteSource = renderer.slice(begin, end).trim();

class FakeElement {
  constructor(tag, className = '', textContent = '') {
    this.tagName = tag;
    this.className = className;
    this.textContent = textContent;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { background: '', backgroundColor: '' };
    this.value = '';
    this.checked = false;
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(event, callback) { this.listeners.set(event, callback); }
  click() { this.listeners.get('click')?.(); }
  focus() { }
  querySelectorAll(selector) { return selector === 'button' ? this.children.filter(child => child.tagName === 'button') : []; }
}

function openPalette(appearance = {}, parents = {}, ancestorIds = []) {
  const state = { appearances: { ...parents, node_123: appearance }, options: {colorSaturation: 1, colorBrightness: 1, colorGradientsEnabled: true} };
  const changes = [];
  const wrap = new FakeElement('div', 'vh-pop');
  const sandbox = {
    state,
    views: ancestorIds.map(uuid=>({uuid, prefabKey:null})),
    ownAppearance: item => state.appearances[item.uuid] || {},
    VHierarchyColors: colors,
    PALETTE: ['#777d89','#b35e68','#b48e4f','#a9a857','#61a886','#5d94b5','#737cc2','#a36bb4','#b56e9d'],
    ICONS: [], materialSymbols: [], materialCatalogFull: false, materialPaletteRefresh: null, MATERIAL_PREFIX: 'material:', iconAssets: {},
    document: { createTextNode: text => text },
    el: (tag, cssClass = '', text = '') => new FakeElement(tag, cssClass, text),
    btn: (caption, title, callback, cssClass = '') => {
      const button = new FakeElement('button', cssClass, caption);
      button.title = title;
      button.addEventListener('click', callback);
      return button;
    },
    popup: () => wrap,
    editorTheme: () => 'dark',
    persistAppearance: async (_item, next) => {changes.push({...next}); state.appearances.node_123 = next;},
  };
  const fn = vm.runInNewContext('(' + showPaletteSource + ')', sandbox);
  fn({uuid:'node_123', name:'Node', ancestorIds}, 30, 40);
  const find = className => wrap.children.find(child => child.className === className);
  const colorsArea = find('vh-colors');
  const selection = () => colorsArea.children.map(el => el.getAttribute('aria-pressed'));
  const active = () => selection().map((value, index) => value === 'true' ? index : null).filter(x => x !== null);
  const clear = wrap.children.find(child => child.textContent === 'Clear color');
  return {state,changes,wrap,swatches:colorsArea.children,selection,active,clear,colorStatus:find('vh-selected-color')};
}

test('existing saved color is marked when palette opens', () => {
  const ui = openPalette({color: 4});
  assert.deepEqual(ui.active(), [4]);
  assert.equal(ui.colorStatus.textContent, 'Selected: Color 5');
  assert.equal(ui.swatches[4].getAttribute('data-vh-inherited'), 'false');
});

test('clicking a different swatch moves the checkmark immediately (not after IPC)', () => {
  const ui = openPalette({color: 1});
  ui.swatches[6].click();
  assert.deepEqual(ui.active(), [6]);
  assert.equal(ui.swatches[1].getAttribute('aria-pressed'), 'false');
  assert.equal(ui.swatches[6].getAttribute('aria-pressed'), 'true');
  assert.equal(ui.colorStatus.textContent, 'Selected: Color 7');
  assert.equal(ui.changes[0].color, 6);
});

test('clear color removes pressed selection without affecting icons', () => {
  const ui = openPalette({color: 2, icon: 'folder', recursiveColor: true});
  ui.clear.click();
  assert.deepEqual(ui.active(), []);
  assert.equal(ui.colorStatus.textContent, 'No color selected');
  assert.equal(ui.changes[0].icon, 'folder');
  assert.equal(ui.changes[0].recursiveColor, false);
  assert.equal('color' in ui.changes[0], false);
});

test('inherited parent color is highlighted as inherited, explicit override becomes selected', () => {
  const ui = openPalette({}, { parent_123: {color: 3, recursiveColor: true} }, ['parent_123']);
  assert.deepEqual(ui.active(), [3]);
  assert.equal(ui.swatches[3].getAttribute('data-vh-inherited'), 'true');
  assert.match(ui.colorStatus.textContent, /inherited from parent/);
  ui.swatches[8].click();
  assert.deepEqual(ui.active(), [8]);
  assert.equal(ui.swatches[8].getAttribute('data-vh-inherited'), 'false');
  ui.clear.click();
  assert.deepEqual(ui.active(), [3]);
  assert.equal(ui.swatches[3].getAttribute('data-vh-inherited'), 'true');
});
