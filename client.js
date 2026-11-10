/*
 * 系统提示词管理器前端界面：按“项目（工作区）→ 规划（规则）→ 执行（最终注入文本）”组织。
 * 左侧选择工作区，右侧只显示该工作区生效的规则，底部可预览最终注入内容。
 * 数据经 HTTP 与 index.js 交换，规则由服务端持久化到本地文件，界面不再使用 localStorage。
 *
 * 关联文件：
 * dsh-session-view
 * ├─ client.js         ← 当前：规则管理界面
 * ├─ index.js          服务端：规则持久化、HTTP 接口、按工作区注入
 * └─ cordis.patch.yml  默认规则配置（首次启动的种子数据）
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-session-view',
  factory(require) {
    const React = require('react'); const h = React.createElement;
    const VERSION = '2026-11-10.5';
    const API = '/dsh-session-view';
    const NL = String.fromCharCode(10);
    // 所有颜色变量都带兜底值：宿主缺少某个 token 时仍保持可读，不会退化成透明或同色
    const T = { base: 'var(--dsw-alias-bg-base,#fff)', layer1: 'var(--dsw-alias-bg-layer-1,#f7f8fa)', layer2: 'var(--dsw-alias-bg-layer-2,#eef0f4)', text: 'var(--dsw-alias-label-primary,#0f1115)', muted: 'var(--dsw-alias-label-secondary,#6b7280)', line: 'var(--dsw-alias-border-l1,rgba(0,0,0,.08))', lineStrong: 'var(--dsw-alias-border-l2,rgba(0,0,0,.16))', hover: 'var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))', accent: 'var(--dsw-alias-brand-primary,#0f1115)', fill: 'var(--dsw-alias-label-primary,#0f1115)', fillHover: 'var(--dsw-alias-label-primary,#2b2f36)', onFill: 'var(--dsw-alias-label-primary-inverted,#fff)' };
    const css = `.dshsv{box-sizing:border-box;height:100%;overflow:auto;background:${T.base};color:${T.text};font-size:13px}.dshsv *{box-sizing:border-box}.dshsv__inner{max-width:980px;margin:auto;padding:28px 32px 48px}.dshsv__title{margin:0;font-size:20px}.dshsv__ver{margin-left:8px;color:${T.muted};font-size:11px;font-weight:400}.dshsv__intro{margin:6px 0 22px;color:${T.muted};line-height:1.6}.dshsv__layout{display:grid;grid-template-columns:216px minmax(0,1fr);gap:24px;align-items:start}@media(max-width:760px){.dshsv__inner{padding:18px 14px}.dshsv__layout{grid-template-columns:1fr}}.dshsv__nav{display:flex;flex-direction:column;gap:2px}.dshsv__nav-title{margin:12px 8px 4px;color:${T.muted};font-size:11px;font-weight:700}.dshsv__nav-title:first-child{margin-top:0}.dshsv__nav-item{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:7px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}.dshsv__nav-item:hover{background:${T.hover}}.dshsv__nav-item.is-active{background:${T.layer2};font-weight:700}.dshsv__nav-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshsv__count{flex:none;color:${T.muted};font-size:11px;font-weight:400}.dshsv__main{min-width:0}.dshsv__head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.dshsv__head h2{margin:0;font-size:16px}.dshsv__head p{margin:4px 0 0;color:${T.muted};font-size:12px}.dshsv__card{margin-bottom:12px;padding:16px;border:1px solid ${T.line};border-radius:10px;background:${T.layer1}}.dshsv__card.is-editing{border-color:${T.lineStrong}}.dshsv__field{display:block;margin-bottom:14px}.dshsv__field>span,.dshsv__legend{display:block;margin-bottom:6px;color:${T.muted};font-size:12px;font-weight:700}.dshsv__input,.dshsv__textarea{width:100%;border:1px solid ${T.lineStrong};border-radius:7px;padding:8px 10px;background:${T.base};color:${T.text};font:inherit}.dshsv__textarea{min-height:110px;resize:vertical;line-height:1.6}.dshsv__radios{display:flex;gap:16px;margin-bottom:8px}.dshsv__radios label,.dshsv__chip{display:flex;align-items:center;gap:6px;cursor:pointer}.dshsv__chips{display:flex;flex-wrap:wrap;gap:6px}.dshsv__chip{padding:5px 10px;border:1px solid ${T.lineStrong};border-radius:999px;font-size:12px}.dshsv__chip.is-on{border-color:${T.accent};background:${T.hover}}.dshsv__hint{margin:6px 0 0;color:${T.muted};font-size:12px}.dshsv__actions{display:flex;justify-content:flex-end;gap:8px}.dshsv__spacer{margin-right:auto}.dshsv__btn{display:inline-flex;align-items:center;border:1px solid ${T.lineStrong};border-radius:7px;padding:7px 13px;background:${T.base};color:${T.text};font:inherit;cursor:pointer}.dshsv__btn:hover{background:${T.hover}}.dshsv__btn:disabled{opacity:.45;cursor:not-allowed}.dshsv__btn.is-primary{border-color:transparent;background:${T.fill};color:${T.onFill};font-weight:700}.dshsv__btn.is-primary:hover{background:${T.fillHover}}.dshsv__btn.is-primary:disabled{background:${T.fill}}.dshsv__btn.is-danger{border-color:transparent;background:none;color:${T.muted}}.dshsv__rule-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.dshsv__rule-name{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}.dshsv__badge{padding:1px 6px;border:1px solid ${T.lineStrong};border-radius:4px;color:${T.muted};font-size:11px;font-weight:400}.dshsv__rule-text{margin:8px 0 0;color:${T.muted};line-height:1.6;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.dshsv__empty{padding:26px 0;color:${T.muted};text-align:center}.dshsv__preview{margin-top:18px;padding:10px 14px;border:1px solid ${T.line};border-radius:10px}.dshsv__preview summary{cursor:pointer;font-weight:700}.dshsv__preview pre{margin:10px 0 0;white-space:pre-wrap;color:${T.muted};line-height:1.6;font:inherit}.dshsv__error{margin:18px 0;padding:14px 16px;border:1px solid ${T.lineStrong};border-radius:10px;color:${T.text};line-height:1.6}`;
    /* 判断规则是否为通用规则（适用于所有工作区） */
    const isGlobal = rule => !Array.isArray(rule.workspaces) || !rule.workspaces.length || rule.workspaces.includes('*');
    /* 判断规则在指定范围下是否生效，范围 * 表示只看通用规则 */
    const appliesTo = (rule, scope) => scope === '*' ? isGlobal(rule) : isGlobal(rule) || (Array.isArray(rule.workspaces) && rule.workspaces.includes(scope));
    /* 从服务端读取规则与工作区列表 */
    const fetchState = async () => { const res = await fetch(`${API}/state`, { credentials: 'same-origin' }); if (!res.ok) throw new Error(`读取配置失败（HTTP ${res.status}）`); return res.json(); };
    /* 把整份规则列表写回服务端，服务端负责落盘 */
    const putRules = async rules => { const res = await fetch(`${API}/rules`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules }) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data?.error || `保存失败（HTTP ${res.status}）`); return Array.isArray(data?.rules) ? data.rules : rules; };
    const LEGACY_KEYS = ['dsh-session-view.prompts.v2', 'dsh-session-view.prompts.v1'];
    /* 读取旧版存在浏览器 localStorage 里的规则，供一次性迁移到服务端文件 */
    const readLegacy = () => { const out = []; for (const k of LEGACY_KEYS) { try { const x = JSON.parse(localStorage.getItem(k)); if (Array.isArray(x)) out.push(...x.filter(r => r && typeof r.label === 'string' && typeof r.content === 'string')); } catch {} } return out; };
    /* 把旧规则中服务端还没有的部分合并写回，成功后清除旧键；失败则保留旧键下次再试 */
    const migrateLegacy = async rules => { const legacy = readLegacy(); if (!legacy.length) return rules; const same = (a, b) => a.label.trim() === b.label.trim() && a.content.trim() === b.content.trim(); const extra = legacy.filter((r, i) => !rules.some(x => same(x, r)) && legacy.findIndex(y => same(y, r)) === i); const saved = extra.length ? await putRules([...rules, ...extra]) : rules; for (const k of LEGACY_KEYS) { try { localStorage.removeItem(k); } catch {} } return saved; };
    /* 渲染失败时显示可读提示，避免整块界面变空白 */
    class Boundary extends React.Component {
      constructor(p) { super(p); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      render() {
        if (!this.state.error) return this.props.children;
        return h('div', { className: 'dshsv__error' }, '界面渲染出错：', String(this.state.error?.message || this.state.error), '。请刷新页面后重试。');
      }
    }
    /* 管理界面主面板：左选工作区，右看并编辑该工作区生效的规则 */
    function Panel() {
      const [items, setItems] = React.useState([]);
      const [workspaces, setWorkspaces] = React.useState([]);
      const [status, setStatus] = React.useState('loading');
      const [error, setError] = React.useState('');
      const [scope, setScope] = React.useState('*');
      const [draft, setDraft] = React.useState(null);
      // 挂载时从服务端取一次数据；组件卸载后不再落状态
      React.useEffect(() => { let live = true; fetchState().then(async data => { const rules = await migrateLegacy(Array.isArray(data?.rules) ? data.rules : []).catch(() => (Array.isArray(data?.rules) ? data.rules : [])); return { ...data, rules }; }).then(data => { if (!live) return; setItems(data.rules); setWorkspaces(Array.isArray(data?.workspaces) ? data.workspaces : []); setStatus('ready'); }).catch(err => { if (!live) return; setError(String(err?.message || err)); setStatus('failed'); }); return () => { live = false; }; }, []);
      const entries = items.map((rule, index) => ({ rule, index })).filter(entry => appliesTo(entry.rule, scope));
      const current = workspaces.find(w => w.id === scope);
      const countFor = id => items.filter(rule => appliesTo(rule, id)).length;
      /* 写回服务端并同步界面；失败时保留原状态并提示 */
      const persist = rules => putRules(rules).then(saved => { setItems(saved); setError(''); }).catch(err => setError(String(err?.message || err)));
      /* 打开新增表单，默认沿用当前浏览的工作区作为范围 */
      const openNew = () => setDraft({ index: null, label: '', content: '', all: scope === '*', ids: scope === '*' ? [] : [scope] });
      /* 打开编辑表单并回填已有规则，ids 永远是数组 */
      const openEdit = (rule, index) => setDraft({ index, label: rule.label, content: rule.content, all: isGlobal(rule), ids: isGlobal(rule) ? [] : (Array.isArray(rule.workspaces) ? rule.workspaces.slice() : []) });
      const patch = part => setDraft(d => (d ? { ...d, ...part } : d));
      const ids = Array.isArray(draft?.ids) ? draft.ids : [];
      const toggleId = id => setDraft(d => { if (!d) return d; const list = Array.isArray(d.ids) ? d.ids : []; return { ...d, ids: list.includes(id) ? list.filter(x => x !== id) : [...list, id] }; });
      const valid = Boolean(draft && draft.label.trim() && draft.content.trim() && (draft.all || ids.length));
      const save = () => {
        if (!draft || !draft.label.trim() || !draft.content.trim() || (!draft.all && !ids.length)) return;
        const rule = { ...(draft.index !== null && items[draft.index]?.id ? { id: items[draft.index].id } : {}), label: draft.label.trim(), content: draft.content.trim(), workspaces: draft.all ? ['*'] : ids.slice() };
        persist(draft.index === null ? [...items, rule] : items.map((x, i) => i === draft.index ? rule : x));
        setDraft(null);
      };
      /* 删除当前编辑的规则，需二次确认 */
      const remove = () => { if (draft && window.confirm('确定删除这条规则吗？')) { persist(items.filter((_, i) => i !== draft.index)); setDraft(null); } };
      const select = id => { setScope(id); setDraft(null); };
      const navItem = (id, name, count) => h('button', { key: id, className: 'dshsv__nav-item' + (scope === id ? ' is-active' : ''), onClick: () => select(id) }, h('span', { className: 'dshsv__nav-name' }, name), h('span', { className: 'dshsv__count' }, `${count} 条`));
      const nav = h('nav', { className: 'dshsv__nav', 'aria-label': '选择工作区' },
        h('div', { className: 'dshsv__nav-title' }, '通用'),
        navItem('*', '所有工作区', items.filter(isGlobal).length),
        h('div', { className: 'dshsv__nav-title' }, '工作区'),
        workspaces.length ? workspaces.map(w => navItem(w.id, w.title || w.path, countFor(w.id))) : h('p', { className: 'dshsv__hint', style: { margin: '0 8px' } }, '未读取到工作区'));
      const editor = draft && h('div', { className: 'dshsv__card is-editing' },
        h('label', { className: 'dshsv__field' }, h('span', null, '规则名称'), h('input', { className: 'dshsv__input', value: draft.label, onChange: e => patch({ label: e.target.value }), placeholder: '例如：代码审查规范' })),
        h('label', { className: 'dshsv__field' }, h('span', null, '规则内容'), h('textarea', { className: 'dshsv__textarea', value: draft.content, onChange: e => patch({ content: e.target.value }), placeholder: '写下希望模型遵守的要求' })),
        h('div', { className: 'dshsv__field' }, h('span', { className: 'dshsv__legend' }, '适用范围'),
          h('div', { className: 'dshsv__radios' },
            h('label', null, h('input', { type: 'radio', name: 'dshsv-scope', checked: draft.all, onChange: () => patch({ all: true }) }), '所有工作区'),
            h('label', null, h('input', { type: 'radio', name: 'dshsv-scope', checked: !draft.all, onChange: () => patch({ all: false }) }), '指定工作区')),
          !draft.all && h('div', { className: 'dshsv__chips' }, workspaces.map(w => h('label', { key: w.id, className: 'dshsv__chip' + (ids.includes(w.id) ? ' is-on' : ''), title: w.path }, h('input', { type: 'checkbox', checked: ids.includes(w.id), onChange: () => toggleId(w.id) }), w.title || w.path))),
          !draft.all && !ids.length && h('p', { className: 'dshsv__hint' }, '请至少选择一个工作区。')),
        h('div', { className: 'dshsv__actions' },
          draft.index !== null && h('button', { className: 'dshsv__btn is-danger dshsv__spacer', onClick: remove }, '删除'),
          h('button', { className: 'dshsv__btn', onClick: () => setDraft(null) }, '取消'),
          h('button', { className: 'dshsv__btn is-primary', disabled: !valid, onClick: save }, '保存')));
      const list = entries.length ? entries.map(({ rule, index }) => h('article', { key: index, className: 'dshsv__card' },
        h('div', { className: 'dshsv__rule-head' },
          h('div', { className: 'dshsv__rule-name' }, rule.label, scope !== '*' && h('span', { className: 'dshsv__badge' }, isGlobal(rule) ? '通用' : '专属')),
          h('button', { className: 'dshsv__btn', onClick: () => openEdit(rule, index) }, '编辑')),
        h('p', { className: 'dshsv__rule-text' }, rule.content))) : !draft && h('div', { className: 'dshsv__empty' }, status === 'loading' ? '正在读取配置…' : '这里还没有规则，点击右上角“添加规则”开始。');
      const previewText = entries.length ? entries.map(({ rule }) => `【${rule.label}】${NL}${rule.content}`).join(NL + NL) : '（没有规则时，模型不会收到本插件注入的任何内容。）';
      const main = h('div', { className: 'dshsv__main' },
        error && h('div', { className: 'dshsv__error' }, error),
        h('div', { className: 'dshsv__head' },
          h('div', null, h('h2', null, scope === '*' ? '所有工作区的通用规则' : current?.title || '工作区'), h('p', null, scope === '*' ? '这些规则会应用到每一个工作区。' : '该工作区实际生效的规则 = 通用规则 + 它的专属规则。')),
          !draft && h('button', { className: 'dshsv__btn is-primary', disabled: status !== 'ready', onClick: openNew }, '添加规则')),
        editor, list,
        h('details', { className: 'dshsv__preview' }, h('summary', null, '查看最终注入内容'), h('pre', null, previewText)));
      return h('section', { className: 'dshsv', 'aria-label': '系统提示词管理器' }, h('style', null, css),
        h(Boundary, null,
          h('div', { className: 'dshsv__inner' },
            h('h1', { className: 'dshsv__title' }, '系统提示词管理器', h('span', { className: 'dshsv__ver' }, VERSION)),
            h('p', { className: 'dshsv__intro' }, '先选工作区，再管理它的规则；底部可预览模型最终收到的内容。'),
            h('div', { className: 'dshsv__layout' }, nav, main))));
    }
    /* 把面板包在错误边界内再交给宿主，插件内部出错时只降级显示提示，不会连带整块界面变黑 */
    function View() { return h(Boundary, null, h(Panel, null)); }
    /* 侧边栏入口图标 */
    function Icon({ size = 20, active }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 3, stroke: active ? 'var(--dsw-alias-brand-primary,currentColor)' : 'currentColor', strokeWidth: 1.8 }), h('path', { d: 'M7 9h10M7 13h7M7 17h10', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' })); }
    return { inject: ['slots'], apply(ctx) { ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-session-view', order: 25, label: '系统提示词管理器' }, Icon)); ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-session-view' }, View)); } };
  },
});
