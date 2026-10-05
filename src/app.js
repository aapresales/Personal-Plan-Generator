/**
 * LED 方案规划器 · 单页壳
 * 导航 / 搜索 / 配置器表单 / 结果卡片 —— 全部由 data/*.json 驱动。
 */
import { plan } from './engine.js';

/* ----------------------------- 工具 ----------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const wan = (px) => (px / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const num = (v, d = 2) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: d });
const m = (v) => `${num(v, 3)}m`;

/* ----------------------------- 主题 ----------------------------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '◐', light: '☀', dark: '☾' };

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#themeToggle').textContent = THEME_LABEL[t];
  $('#themeToggle').title = `主题：${t === 'auto' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}`;
}

function initTheme() {
  const urlTheme = new URLSearchParams(location.search).get('theme');
  const saved = localStorage.getItem('ppg.theme');
  applyTheme(THEMES.includes(urlTheme) ? urlTheme : THEMES.includes(saved) ? saved : 'auto');
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    localStorage.setItem('ppg.theme', next);
    applyTheme(next);
  });
}

/* ----------------------------- 数据 ----------------------------- */
async function loadData() {
  const get = (p) => fetch(`./data/${p}`).then((r) => {
    if (!r.ok) throw new Error(`${p} 载入失败 (${r.status})`);
    return r.json();
  });
  const [products, controllers, scenarios, knowledge] = await Promise.all([
    get('products.json'),
    get('controllers.json'),
    get('scenarios.json'),
    get('knowledge.json')
  ]);
  return { products, controllers, scenarios, knowledge };
}

/* ----------------------------- 结果卡片 ----------------------------- */
function layoutViz(layout) {
  const total = layout.cols * layout.rows;
  if (total > 600) return '';
  const cells = '<i></i>'.repeat(total);
  return `<div class="layout-viz${total > 240 ? ' layout-viz--big' : ''}"
    style="grid-template-columns:repeat(${layout.cols},auto)" title="${layout.cols} 列 × ${layout.rows} 行">${cells}</div>`;
}

const nbsp = (v) => String(v).replace(/\s*·\s*/g, ' · ');

function controllerText(c, wanFn) {
  if (c.kind === 'frame') {
    const cards = `${c.cardName} ×${c.cards} 张`;
    const units = c.units > 1 ? ` ×${c.units} 台并联` : ' ×1';
    return `${c.name}${units}（${cards}，合计带载 ${wanFn(c.capacity)}万）`;
  }
  const par = c.parallel ? ` ×${c.units} 台并联` : ' ×1';
  return `${c.name}${par}（带载 ${wanFn(c.capacity)}万 / ${c.ports} 网口）`;
}

function transmissionText(t) {
  const comps = t.components
    .map((c) => (c.qty > 1 ? `${c.name}×${c.qty}${c.note ? `（${c.note}）` : ''}` : c.name))
    .join(' + ');
  return `${t.label}（${num(t.distanceM, 1)}m）→ ${comps}`;
}

function renderPlan(p, index, total) {
  const usageLabel = p.product.usage === 'outdoor' ? '户外' : '室内';
  const rel = p.product.usage === 'outdoor' ? '' : '≥';
  return `
  <article class="card plan">
    <div class="plan__head">
      <div>
        <div class="plan__title">
          ${total > 1 ? `方案 ${index + 1} · ` : ''}${esc(p.product.name)} / P${p.pitch}
        </div>
        <div class="plan__meta">
          ${esc(p.scene.label)} · 箱体 ${p.cabinet.w}×${p.cabinet.h}mm · 单箱像素 ${p.pixelsPerCabinet.w}×${p.pixelsPerCabinet.h}
        </div>
      </div>
      <div class="badges">
        <span class="badge">${usageLabel}</span>
        <span class="badge badge--neutral">亮度 ${num(p.product.brightness)} nit</span>
        <span class="badge badge--neutral">刷新 ${num(p.product.refresh)} Hz</span>
        <span class="badge badge--neutral">${esc(p.product.ip.front)}</span>
      </div>
    </div>

    <div class="plan__body">
      <div class="rows">
        <div class="row">
          <div class="row__k">屏体排布</div>
          <div class="row__v">
            <span class="strong">${p.layout.cols} 列 × ${p.layout.rows} 行 = ${p.layout.cabinets} 个箱体</span>
            <div class="tiny">实际 ${m(p.layout.realWidthM)} × ${m(p.layout.realHeightM)} · 面积 ${num(p.areaSqm, 3)}m² · 溢出 ${num(p.layout.overshootXm * 1000, 0)}mm × ${num(p.layout.overshootYm * 1000, 0)}mm</div>
            ${layoutViz(p.layout)}
          </div>
        </div>

        <div class="row">
          <div class="row__k">总像素</div>
          <div class="row__v"><span class="strong">${wan(p.totalPixels)} 万</span>
            <span class="muted tiny">（${p.layout.cabinets} × ${p.pixelsPerCabinet.w * p.pixelsPerCabinet.h}）</span></div>
        </div>

        <div class="row">
          <div class="row__k">控制器</div>
          <div class="row__v">${esc(controllerText(p.controller, wan))}</div>
        </div>

        <div class="row">
          <div class="row__k">接收卡</div>
          <div class="row__v">${p.receiverCards} 张 <span class="tiny muted">（每箱一张）</span></div>
        </div>

        <div class="row">
          <div class="row__k">传输链路</div>
          <div class="row__v">${esc(transmissionText(p.transmission))}</div>
        </div>

        <div class="row">
          <div class="row__k">功耗 / 配电</div>
          <div class="row__v">
            最大 <span class="strong">${num(p.power.maxW / 1000, 2)} kW</span>
            · 平均 ${num(p.power.avgW / 1000, 2)} kW
            <div class="tiny">配电柜建议 <span class="strong">${p.power.distributorKw} kW</span>（${num(p.power.maxPerSqm, 0)} W/m² 最大 / ${num(p.power.avgPerSqm, 0)} W/m² 平均）</div>
          </div>
        </div>

        <div class="row">
          <div class="row__k">安装方式</div>
          <div class="row__v"><div class="chips">${p.install.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div></div>
        </div>

        <div class="row">
          <div class="row__k">附件清单</div>
          <div class="row__v"><div class="chips">${p.accessories.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div></div>
        </div>
      </div>

      ${p.warnings.length ? `<div class="notes">${p.warnings.map((w) => `<div class="note">⚠ ${esc(w)}</div>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

/* ----------------------------- 配置器 ----------------------------- */
function initPlanner(data) {
  const sceneSel = $('#sceneId');
  sceneSel.innerHTML = data.scenarios.scenes
    .map((s) => `<option value="${s.id}">${esc(s.label)} · ${s.usage === 'outdoor' ? '户外' : '室内'}</option>`)
    .join('');
  if (data.scenarios.scenes.some((s) => s.id === 'conference-room')) sceneSel.value = 'conference-room';

  const syncSceneDefaults = () => {
    const s = data.scenarios.scenes.find((x) => x.id === sceneSel.value);
    if (!s) return;
    $('#distanceM').value = s.distanceHint ?? 30;
  };

  const syncSizeMode = () => {
    const area = $('#sizeMode').value === 'area';
    $$('[data-mode="wh"]').forEach((el) => (el.hidden = area));
    $$('[data-mode="area"]').forEach((el) => (el.hidden = !area));
  };

  const readReq = () => {
    const byArea = $('#sizeMode').value === 'area';
    return {
      sceneId: sceneSel.value,
      widthM: byArea ? undefined : Number($('#widthM').value) || undefined,
      heightM: byArea ? undefined : Number($('#heightM').value) || undefined,
      areaSqm: byArea ? Number($('#areaSqm').value) || undefined : undefined,
      distanceM: Number($('#distanceM').value) || 0,
      options: Number($('#options').value) || 1
    };
  };

  const generate = () => {
    const out = $('#plannerResults');
    const hint = $('#formHint');
    try {
      const req = readReq();
      if (!req.widthM && !req.heightM && !req.areaSqm) throw new Error('请填写尺寸或面积');
      const plans = plan(req, data);
      out.innerHTML = plans.map((p, i) => renderPlan(p, i, plans.length)).join('');
      const first = plans[0];
      hint.textContent =
        `共 ${plans.length} 个方案 · 首选 ${first.product.name}/P${first.pitch} · ` +
        `${first.layout.cabinets} 箱 · ${wan(first.totalPixels)} 万像素`;
    } catch (err) {
      out.innerHTML = '';
      hint.textContent = `生成失败：${err.message}`;
    }
  };

  $('#planForm').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  $('#sceneId').addEventListener('change', () => { syncSceneDefaults(); generate(); });
  $('#sizeMode').addEventListener('change', () => { syncSizeMode(); generate(); });
  $('#resetBtn').addEventListener('click', () => {
    setTimeout(() => {
      const s = data.scenarios.scenes.find((x) => x.id === sceneSel.value);
      $('#widthM').value = 6;
      $('#heightM').value = 3.375;
      $('#areaSqm').value = 20;
      $('#distanceM').value = s?.distanceHint ?? 30;
      $('#options').value = '1';
      $('#sizeMode').value = 'wh';
      syncSizeMode();
      $('#plannerResults').innerHTML = '';
      $('#formHint').textContent = '';
    });
  });

  syncSceneDefaults();
  syncSizeMode();
  generate();
}

/* ----------------------------- 产品库 ----------------------------- */
function productCard(p) {
  const pitches = p.pitches.map((x) => `P${x.pitch}`).join(' / ');
  return `
  <article class="card prod" data-text="${esc([p.id, p.name, p.usage, pitches, p.scenes.join(' ')].join(' ').toLowerCase())}">
    <div class="prod__head">
      <span class="prod__name">${esc(p.name)}</span>
      <span class="badge">${p.usage === 'outdoor' ? '户外' : '室内'}</span>
    </div>
    <div class="prod__specs">
      <div><span>点间距</span><b>${pitches}</b></div>
      <div><span>箱体</span><b>${p.cabinet.w}×${p.cabinet.h}</b></div>
      <div><span>亮度</span><b>${num(p.brightness)} nit</b></div>
      <div><span>刷新率</span><b>${num(p.refresh)} Hz</b></div>
      <div><span>灰度</span><b>${p.grayScale} bit</b></div>
      <div><span>对比度</span><b>${esc(p.contrast)}</b></div>
      <div><span>防护</span><b>${esc(p.ip.front)} / ${esc(p.ip.back)}</b></div>
      <div><span>功耗</span><b>${p.power.maxPerSqm} W/m²</b></div>
    </div>
    <div class="chips">${p.install.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
  </article>`;
}

function renderProducts(data) {
  $('#productGrid').innerHTML = data.products.map(productCard).join('');
}

/* ----------------------------- 知识层 ----------------------------- */
function renderKnowledge(data) {
  $('#knowledgeWrap').innerHTML = data.knowledge.sections
    .map(
      (s) => `
    <section class="card sec" data-sec>
      <h2 class="sec__title">${esc(s.title)}</h2>
      <div class="sec__list">
        ${s.items
          .map(
            (it) => `
          <div class="item" data-text="${esc(`${it.term} ${it.desc}`.toLowerCase())}">
            <div class="item__term">${esc(it.term)}</div>
            <div class="item__desc">${esc(it.desc)}</div>
          </div>`
          )
          .join('')}
      </div>
    </section>`
    )
    .join('');
}

/* ----------------------------- 搜索 ----------------------------- */
function initSearch() {
  const input = $('#globalSearch');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();

    $$('#productGrid .prod').forEach((el) => {
      el.hidden = q !== '' && !el.dataset.text.includes(q);
    });
    $('#productEmpty').hidden = $$('#productGrid .prod').some((el) => !el.hidden);

    $$('#knowledgeWrap .item').forEach((el) => {
      el.hidden = q !== '' && !el.dataset.text.includes(q);
    });
    $$('#knowledgeWrap [data-sec]').forEach((sec) => {
      sec.hidden = [...sec.querySelectorAll('.item')].every((el) => el.hidden);
    });
    $('#knowledgeEmpty').hidden = [...$$('#knowledgeWrap .item')].some((el) => !el.hidden);
  });
}

/* ----------------------------- 导航 ----------------------------- */
function initTabs() {
  const activate = (name) => {
    const btn = $$('.tab').find((t) => t.dataset.tab === name);
    if (!btn) return;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  };
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) activate(btn.dataset.tab);
  });
  activate(new URLSearchParams(location.search).get('tab') || 'planner');
}

/* ----------------------------- 启动 ----------------------------- */
(async function main() {
  initTheme();
  initTabs();
  initSearch();
  try {
    const data = await loadData();
    renderProducts(data);
    renderKnowledge(data);
    initPlanner(data);
    $('#dataMeta').textContent =
      `${data.products.length} 个产品 · ${data.scenarios.scenes.length} 个场景 · ${data.controllers.length} 个控制器`;
  } catch (err) {
    $('#plannerResults').innerHTML =
      `<div class="card sec"><p class="item__desc">数据载入失败：${esc(err.message)}</p>
       <p class="tiny">若你是直接双击打开的 index.html（file:// 协议），浏览器会拦住 fetch 读取 JSON。<br>
       本地预览请改用 <code>npm run serve</code>，线上 GitHub Pages 不受影响。</p></div>`;
  }
})();
