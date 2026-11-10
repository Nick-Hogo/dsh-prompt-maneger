/*
 * index.js 的隔离测试：验证规则持久化、工作区匹配注入，以及前端读写接口的行为。
 * 所有文件读写都指向临时目录，HTTP 交互通过直接调用注册的 handler 完成，不启动真实服务。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { apply } from '/Users/guan/Desktop/RSI/dsh-session-view/index.js';

/* 构造最小宿主上下文：记录 section 注册、路由注册与监听器 */
function fakeHost(dataDir, options = {}) {
  const sections = [];
  const routes = new Map();
  const listeners = [];
  const workspaces = options.workspaces ?? [{ id: 'w1', path: '/proj/rsi', title: 'RSI' }];
  const services = {
    sessions: { get: () => ({ header: { cwd: '/proj/rsi' } }) },
    workspaceRegistry: { list: () => workspaces },
    systemPrompt: { section: s => sections.push(s) },
    webServer: { register: route => { routes.set(route.path + ':' + route.method, route); routes.set(route.path, route); return () => {}; } },
  };
  const injectables = { webServer: services.webServer, workspaceRegistry: services.workspaceRegistry };
  const ctx = {
    get: name => services[name],
    on: (event, fn) => listeners.push({ event, fn }),
    inject: (names, cb) => { if (names.every(n => injectables[n])) cb({ ...ctx, webServer: injectables.webServer, effect: (fn, _l) => { fn(); } }); },
  };
  return { ctx, sections, routes, listeners };
}

/* 造一个够用的 HTTP 请求：方法、可读的请求体 */
function makeReq(method, body) {
  const listeners = {};
  const req = {
    method,
    on: (name, fn) => { (listeners[name] ||= []).push(fn); },
    destroy: () => {},
  };
  setImmediate(() => {
    if (body !== undefined) (listeners.data || []).forEach(fn => fn(Buffer.from(body)));
    (listeners.end || []).forEach(fn => fn());
  });
  return req;
}

/* 造一个收集响应的对象 */
function makeRes() {
  const res = { status: 0, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.status = status; Object.assign(res.headers, headers); };
  res.end = chunk => { if (chunk) res.body += chunk; };
  return res;
}

/* 每个用例独立的数据目录，测试结束后清理 */
function withTempDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshsv-'));
    try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
}

test('首次启动时把配置里的种子规则写入本地文件', withTempDir(async dir => {
  const { ctx } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [{ label: '默认', content: '种子内容', workspaces: ['*'] }] });
  const saved = JSON.parse(readFileSync(join(dir, 'prompts.json'), 'utf8'));
  assert.equal(saved.rules.length, 1, 'GET 之前就应完成首次落盘之外的读取');
}));

test('规则正文含 {{变量}} 时关闭插值，避免装配阶段报未知变量', withTempDir(async dir => {
  const { ctx, sections, listeners } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [{ label: '模板', content: '输出 {{name}}', workspaces: ['*'] }] });
  listeners.find(l => l.event === 'agent/created').fn({ agent: { id: 'a1' } });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].interpolate, false, '必须显式关闭插值');
  assert.match(sections[0].text, /\{\{name\}\}/, '正文应原样保留');
}));

test('工作区专属规则只注入到匹配的 cwd', withTempDir(async dir => {
  const { ctx, sections, listeners } = fakeHost(dir, { workspaces: [{ id: 'w1', path: '/proj/rsi', title: 'RSI' }, { id: 'w2', path: '/proj/other', title: 'Other' }] });
  apply(ctx, { dataDir: dir, prompts: [{ label: '专属', content: '只对 RSI 生效', workspaces: ['w1'] }] });
  listeners.find(l => l.event === 'agent/created').fn({ agent: { id: 'a2' } });
  assert.equal(sections.length, 1);
  assert.match(sections[0].text, /只对 RSI 生效/);
}));

test('没有任何命中规则时不注册空 section', withTempDir(async dir => {
  const { ctx, sections, listeners } = fakeHost(dir, { workspaces: [{ id: 'w1', path: '/proj/rsi', title: 'RSI' }] });
  apply(ctx, { dataDir: dir, prompts: [{ label: '其他', content: '无关内容', workspaces: ['w9'] }] });
  listeners.find(l => l.event === 'agent/created').fn({ agent: { id: 'a3' } });
  assert.equal(sections.length, 0, '空注入会白占一个 section，应当跳过');
}));

test('宿主服务抛错时不向调用方抛出，避免会话不可用', withTempDir(async dir => {
  const { ctx, listeners } = fakeHost(dir);
  ctx.get = name => (name === 'sessions' ? { get: () => { throw new Error('storage fault'); } } : { list: () => [], section: () => {} });
  apply(ctx, { dataDir: dir, prompts: [{ label: 'x', content: 'y', workspaces: ['*'] }] });
  assert.doesNotThrow(() => listeners.find(l => l.event === 'agent/created').fn({ agent: { id: 'a4' } }));
}));

test('GET /state 返回规则与工作区列表', withTempDir(async dir => {
  const { ctx, routes } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [{ label: '默认', content: '内容', workspaces: ['*'] }] });
  const res = makeRes();
  await routes.get('/dsh-session-view/state').handler(makeReq('GET'), res);
  const data = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(data.rules.length, 1);
  assert.deepEqual(data.workspaces, [{ id: 'w1', path: '/proj/rsi', title: 'RSI' }]);
}));

test('PUT /rules 接收的规则会落盘，并立即影响后续注入', withTempDir(async dir => {
  const { ctx, routes, sections, listeners } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [{ label: '旧', content: '旧内容', workspaces: ['*'] }] });
  const res = makeRes();
  await routes.get('/dsh-session-view/rules').handler(makeReq('PUT', JSON.stringify({ rules: [{ label: '新', content: '新内容', workspaces: ['*'] }] })), res);
  assert.equal(res.status, 200);
  const saved = JSON.parse(readFileSync(join(dir, 'prompts.json'), 'utf8'));
  assert.equal(saved.rules[0].label, '新', '写入应立即持久化');
  listeners.find(l => l.event === 'agent/created').fn({ agent: { id: 'a5' } });
  assert.match(sections[0].text, /新内容/, '下一次注入应使用新规则');
}));

test('PUT /rules 收到非法 JSON 时返回 400 且不改动已有规则', withTempDir(async dir => {
  const { ctx, routes } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [{ label: '默认', content: '内容', workspaces: ['*'] }] });
  const res = makeRes();
  await routes.get('/dsh-session-view/rules').handler(makeReq('PUT', '{ 非法'), res);
  assert.equal(res.status, 400);
  const saved = JSON.parse(readFileSync(join(dir, 'prompts.json'), 'utf8'));
  assert.equal(saved.rules.length, 1, '解析失败不应破坏已保存的数据');
}));

test('非预期方法返回 405', withTempDir(async dir => {
  const { ctx, routes } = fakeHost(dir);
  apply(ctx, { dataDir: dir, prompts: [] });
  const res = makeRes();
  await routes.get('/dsh-session-view/state').handler(makeReq('POST'), res);
  assert.equal(res.status, 405);
}));
