/*
 * 系统提示词管理器的服务端部分：规则持久化 + 按工作区注入系统提示词 + 前端读写接口。
 *
 * 关联文件：
 * dsh-session-view
 * ├─ index.js         ← 当前：存储、HTTP 接口、注入
 * ├─ client.js         前端：规则管理界面（经 HTTP 读写本文件持久化的数据）
 * └─ cordis.patch.yml  默认规则配置（首次启动的种子数据）
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const inject = ['systemPrompt', 'sessions', 'workspaceRegistry'];

/* 数据目录：~/.dsh/dsh-session-view，与其它本地插件保持一致 */
function dataDir(config) {
  const custom = typeof config?.dataDir === 'string' && config.dataDir.trim();
  return custom ? config.dataDir : join(homedir(), '.dsh', 'dsh-session-view');
}

/* 规则文件路径 */
function rulesFile(config) {
  return join(dataDir(config), 'prompts.json');
}

/* 过滤并规范化一份规则列表，丢弃结构不合法的项 */
function normalize(list) {
  const items = Array.isArray(list) ? list : [];
  return items
    .filter(item => item && typeof item.label === 'string' && item.label.trim() && typeof item.content === 'string' && item.content.trim())
    .map(item => ({
      id: typeof item.id === 'string' && item.id ? item.id : `r_${Math.random().toString(36).slice(2, 10)}`,
      label: item.label.trim(),
      content: item.content.trim(),
      workspaces: Array.isArray(item.workspaces) && item.workspaces.length ? item.workspaces.filter(w => typeof w === 'string') : ['*'],
    }));
}

/* 读取规则文件；文件不存在或损坏时回落到配置里的种子规则 */
function loadRules(config) {
  const file = rulesFile(config);
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (normalize(parsed?.rules).length) return normalize(parsed?.rules);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('dsh-session-view: 读取规则文件失败', error);
  }
  const seed = normalize(config?.prompts);
  // 首次启动把种子规则落盘，此后文件就是唯一数据源
  try {
    saveRules(config, seed);
  } catch (error) {
    console.error('dsh-session-view: 写入初始规则文件失败', error);
  }
  return seed;
}

/* 原子写入规则文件，避免写一半留下损坏的 JSON */
function saveRules(config, rules) {
  const file = rulesFile(config);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1, rules }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

/* 把命中工作区的规则拼成最终注入文本 */
function promptText(items) {
  if (!items.length) return '';
  return items.map(item => `【${item.label}】\n${item.content}`).join('\n\n');
}

/* 判断规则是否适用于给定工作区；workspaces 含 '*' 表示通用规则 */
function appliesTo(rule, workspace) {
  if (!Array.isArray(rule.workspaces) || rule.workspaces.includes('*')) return true;
  if (!workspace) return false;
  return rule.workspaces.includes(workspace.id) || rule.workspaces.includes(workspace.path) || rule.workspaces.includes(workspace.title);
}

/* 读取工作区列表，形状统一成 { id, path, title } */
function listWorkspaces(ctx) {
  try {
    const registry = ctx.get('workspaceRegistry');
    if (!registry || typeof registry.list !== 'function') return [];
    const raw = registry.list();
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.workspaces) ? raw.workspaces : [];
    return items.filter(Boolean).map(item => ({ id: String(item.id ?? ''), path: String(item.path ?? ''), title: String(item.title ?? '') }));
  } catch (error) {
    console.error('dsh-session-view: 读取工作区列表失败', error);
    return [];
  }
}

/* 读取请求体，限制大小避免异常请求撑爆内存 */
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* 统一写 JSON 响应 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

export function apply(ctx, config) {
  /* 内存中的当前规则，随文件同步更新 */
  let rules = loadRules(config);

  /* 按最新规则为指定 agent 注入系统提示词 */
  const injectFor = (agentId, cwd) => {
    try {
      const systemPrompt = ctx.get('systemPrompt');
      if (!systemPrompt) return;
      const workspaces = listWorkspaces(ctx);
      const workspace = cwd ? workspaces.find(item => item.path === cwd) : undefined;
      const selected = rules.filter(rule => appliesTo(rule, workspace));
      const text = promptText(selected);
      if (!text) return;
      systemPrompt.section({
        name: `dsh-session-view.prompt.${agentId}`,
        order: 850,
        // 规则正文是用户自由输入，可能包含 {{...}}；关闭插值避免装配阶段报错
        interpolate: false,
        text,
      });
    } catch (error) {
      console.error('dsh-session-view: 注入系统提示词失败', error);
    }
  };

  /* 会话创建时按 cwd 匹配工作区并注入 */
  ctx.on('agent/created', function ({ agent }) {
    try {
      const sessions = ctx.get('sessions');
      const session = sessions?.get?.(agent.id);
      injectFor(agent.id, session?.header?.cwd);
    } catch (error) {
      console.error('dsh-session-view: 读取会话信息失败', error);
    }
  });

  /* 暴露前端读写接口；没有 webServer 或 workspaceRegistry 时插件保持静默 */
  ctx.inject(['webServer', 'workspaceRegistry'], host => {
    const base = '/dsh-session-view';

    /* GET /dsh-session-view/state → 规则列表 + 工作区列表 */
    host.effect(() => host.webServer.register({
      kind: 'exact',
      path: `${base}/state`,
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
        sendJson(res, 200, { rules, workspaces: listWorkspaces(ctx) });
      },
    }), 'dsh-session-view: state');

    /* PUT /dsh-session-view/rules → 整体替换规则列表并落盘 */
    host.effect(() => host.webServer.register({
      kind: 'exact',
      path: `${base}/rules`,
      handler: async (req, res) => {
        if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method not allowed' });
        try {
          const payload = JSON.parse(await readBody(req));
          const next = normalize(payload?.rules);
          saveRules(config, next);
          rules = next;
          sendJson(res, 200, { rules });
        } catch (error) {
          console.error('dsh-session-view: 保存规则失败', error);
          sendJson(res, 400, { error: String(error?.message ?? error) });
        }
      },
    }), 'dsh-session-view: rules');
  });
}
