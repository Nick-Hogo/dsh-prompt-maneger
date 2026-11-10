/*
 * client.js 的离线回归测试：用 jsdom + React 19 渲染界面，用假的 fetch 模拟 index.js 的 HTTP 接口，
 * 验证规则能读取、编辑表单能回填、按工作区过滤与保存写回都符合预期。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

// 测试依赖未装进插件目录：React 与 jsdom 分别从本机已有的 node_modules 解析
const require = createRequire('/Users/guan/claude-hark/dashboard/package.json');
const { JSDOM } = createRequire('/tmp/dshsv/package.json')('jsdom');
// react-dom 加载时会检测 DOM 能力（如 input 事件），需先准备全局 window 再 require
const bootstrap = new JSDOM('<!doctype html>').window;
global.window = bootstrap;
global.document = bootstrap.document;
Object.defineProperty(global, 'navigator', { value: bootstrap.navigator, configurable: true });
const React = require('react');
const { createRoot } = require('react-dom/client');

/* 在干净的 jsdom 环境里加载 client.js，捕获插槽注册并挂载主面板 */
function setup() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const win = dom.window;
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;
  Object.defineProperty(global, 'navigator', { value: win.navigator, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;

  const slots = [];
  let plugin = null;
  win.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(n => (n === 'react' ? React : require(n))); } };
  const source = readFileSync('/Users/guan/Desktop/RSI/dsh-session-view/client.js', 'utf8');
  // 延迟转发到 win.fetch，保证各用例在 setup 之后安装的 mock 能生效
  new Function('window', 'fetch', source)(win, (...args) => win.fetch(...args));

  const ctx = { slots: { inject: (_key, fn) => fn(), register: (slot, comp) => slots.push({ slot, comp }) } };
  plugin.apply(ctx);
  const view = slots.find(s => s.slot.name === 'main').comp;
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  return { win, container, root: createRoot(container), view };
}

/* 用内存状态模拟服务端接口 */
function mockServer(win, initial) {
  const state = { rules: initial, workspaces: [{ id: 'w1', path: '/proj/rsi', title: 'RSI' }] };
  win.fetch = globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/state')) return { ok: true, status: 200, json: async () => ({ rules: state.rules, workspaces: state.workspaces }) };
    if (String(url).endsWith('/rules') && options.method === 'PUT') {
      state.rules = JSON.parse(options.body).rules;
      return { ok: true, status: 200, json: async () => ({ rules: state.rules }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  };
  return state;
}

test('界面从服务端读取规则并显示工作区导航', async () => {
  const { win, container, root, view } = setup();
  mockServer(win, [{ id: 'r1', label: '服务端规则', content: '来自文件的内容', workspaces: ['*'] }]);
  await React.act(async () => { root.render(React.createElement(view)); });
  assert.match(container.textContent, /服务端规则/, '应渲染服务端返回的规则');
  assert.match(container.textContent, /RSI/, '应渲染工作区列表');
  assert.match(container.textContent, /1 条/, '通用规则计数应为 1');
});

test('点击编辑后表单回填，且不写回服务端', async () => {
  const { win, container, root, view } = setup();
  const state = mockServer(win, [{ id: 'r1', label: '服务端规则', content: '来自文件的内容', workspaces: ['*'] }]);
  await React.act(async () => { root.render(React.createElement(view)); });
  const edit = [...container.querySelectorAll('button')].find(b => b.textContent === '编辑');
  assert.ok(edit, '应渲染编辑按钮');
  await React.act(async () => { edit.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  assert.match(container.textContent, /保存/, '编辑态应出现保存按钮');
  assert.equal(state.rules.length, 1, '仅打开编辑不应写回服务端');
});

test('保存新规则会 PUT 到服务端并显示在列表里', async () => {
  const { win, container, root, view } = setup();
  const state = mockServer(win, []);
  await React.act(async () => { root.render(React.createElement(view)); });
  const add = [...container.querySelectorAll('button')].find(b => b.textContent === '添加规则');
  await React.act(async () => { add.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  const input = container.querySelector('input.dshsv__input');
  const textarea = container.querySelector('textarea.dshsv__textarea');
  // React 受控组件需用原生 setter 触发 change
  const setValue = (el, value) => { const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; setter.call(el, value); el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  await React.act(async () => { setValue(input, '新规则'); setValue(textarea, '新内容'); });
  const save = [...container.querySelectorAll('button')].find(b => b.textContent === '保存');
  assert.equal(save.disabled, false, '填写完整后保存应可用');
  await React.act(async () => { save.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  assert.equal(state.rules.length, 1, '保存后应写回服务端');
  assert.equal(state.rules[0].label, '新规则');
  assert.match(container.textContent, /新规则/, '保存后列表应更新');
});

test('指定工作区但未勾选时保存被禁用', async () => {
  const { win, container, root, view } = setup();
  mockServer(win, []);
  await React.act(async () => { root.render(React.createElement(view)); });
  const add = [...container.querySelectorAll('button')].find(b => b.textContent === '添加规则');
  await React.act(async () => { add.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  const input = container.querySelector('input.dshsv__input');
  const textarea = container.querySelector('textarea.dshsv__textarea');
  const setValue = (el, value) => { const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; setter.call(el, value); el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  await React.act(async () => { setValue(input, 'x'); setValue(textarea, 'y'); });
  const scoped = [...container.querySelectorAll('input[type=radio]')][1];
  await React.act(async () => { scoped.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
  const save = [...container.querySelectorAll('button')].find(b => b.textContent === '保存');
  assert.equal(save.disabled, true, '未选择工作区时不应允许保存');
  assert.match(container.textContent, /请至少选择一个工作区/, '应给出可读提示');
});

test('服务端不可用时显示错误提示且不影响界面其余部分', async () => {
  const { win, container, root, view } = setup();
  win.fetch = globalThis.fetch = async () => { throw new Error('连接被拒绝'); };
  await React.act(async () => { root.render(React.createElement(view)); });
  assert.match(container.textContent, /连接被拒绝/, '应显示读取失败原因');
  assert.match(container.textContent, /所有工作区/, '导航仍应渲染');
});

// 验证旧版 localStorage 规则会合并写入服务端（去重），成功后清除旧键，避免用户升级后规则“消失”。
test('旧版 localStorage 规则在首次加载时迁移到服务端', async () => {
  const { win, container, root, view } = setup();
  const state = mockServer(win, [{ id: 'r1', label: '已有', content: '服务端内容', workspaces: ['*'] }]);
  win.localStorage.setItem('dsh-session-view.prompts.v2', JSON.stringify([{ label: '回答规范', content: '旧内容', workspaces: ['*'] }, { label: '已有', content: '服务端内容', workspaces: ['*'] }]));
  await React.act(async () => { root.render(React.createElement(view)); });
  assert.deepEqual(state.rules.map(r => r.label), ['已有', '回答规范'], '应只追加服务端没有的规则');
  assert.equal(win.localStorage.getItem('dsh-session-view.prompts.v2'), null, '迁移成功后应清除旧键');
  assert.match(container.textContent, /回答规范/);
});
