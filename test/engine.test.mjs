/**
 * LED 方案规划器 · 单元测试（28 项）
 *   npm test
 *   # Windows / MSYS 通配符不生效时： node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  pickPitch,
  layoutBySize,
  layoutByArea,
  selectController,
  selectTransmission,
  estimatePower,
  pickDistributor,
  plan
} from '../src/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, 'data', p), 'utf8'));

const products = read('products.json');
const controllers = read('controllers.json');
const scenarios = read('scenarios.json');
const data = { products, controllers, scenarios };

const byId = (id) => products.find((p) => p.id === id);
const P = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/* ============================ 一、排布（箱体矩阵） ============================ */

test('排布01 · 完美贴合：3.84m × 1.62m / 箱体 960×540 → 4×3，零溢出', () => {
  const l = layoutBySize(3.84, 1.62, { w: 960, h: 540 });
  assert.equal(l.cols, 4);
  assert.equal(l.rows, 3);
  assert.equal(l.cabinets, 12);
  assert.equal(l.realWidthM, 3.84);
  assert.equal(l.realHeightM, 1.62);
  assert.equal(l.overshootXm, 0);
  assert.equal(l.overshootYm, 0);
});

test('排布02 · 会议室 6.0m × 3.375m → 7 列 × 7 行，实际 6.72m × 3.78m', () => {
  const l = layoutBySize(6.0, 3.375, { w: 960, h: 540 });
  assert.equal(l.cols, 7);
  assert.equal(l.rows, 7);
  assert.equal(l.cabinets, 49);
  assert.equal(l.realWidthM, 6.72);
  assert.equal(l.realHeightM, 3.78);
});

test('排布03 · 户外 20m × 10m / 箱体 1280×960 → 16 列 × 11 行，实际 20.48m × 10.56m', () => {
  const l = layoutBySize(20, 10, { w: 1280, h: 960 });
  assert.equal(l.cols, 16);
  assert.equal(l.rows, 11);
  assert.equal(l.cabinets, 176);
  assert.equal(l.realWidthM, 20.48);
  assert.equal(l.realHeightM, 10.56);
});

test('排布04 · 溢出量 = 实际尺寸 − 需求尺寸，且永不为负', () => {
  const l = layoutBySize(5.0, 2.0, { w: 960, h: 540 });
  assert.ok(Math.abs(l.overshootXm - (l.realWidthM - 5.0)) < 1e-9);
  assert.ok(Math.abs(l.overshootYm - (l.realHeightM - 2.0)) < 1e-9);
  assert.ok(l.overshootXm >= 0 && l.overshootYm >= 0);
});

test('排布05 · 箱体数恒等于 列 × 行', () => {
  for (const [w, h] of [[3.84, 1.62], [6, 3.375], [20, 10], [1.1, 0.7]]) {
    const l = layoutBySize(w, h, { w: 960, h: 540 });
    assert.equal(l.cabinets, l.cols * l.rows);
  }
});

test('排布06 · 需求宽高非正数时抛错', () => {
  assert.throws(() => layoutBySize(0, 3, { w: 960, h: 540 }));
  assert.throws(() => layoutBySize(3, -1, { w: 960, h: 540 }));
});

/* ============================ 二、面积反推排布 ============================ */

test('面积排布07 · 实际面积恒 ≥ 需求面积', () => {
  for (const area of [5, 12, 20, 60, 200]) {
    const l = layoutByArea(area, { w: 960, h: 540 });
    assert.ok(l.realWidthM * l.realHeightM >= area - 1e-9, `area=${area}`);
  }
});

test('面积排布08 · 行列均为正整数且箱体数自洽', () => {
  const l = layoutByArea(20, { w: 960, h: 540 });
  assert.ok(Number.isInteger(l.cols) && l.cols >= 1);
  assert.ok(Number.isInteger(l.rows) && l.rows >= 1);
  assert.equal(l.cabinets, l.cols * l.rows);
});

test('面积排布09 · 无宽高时仍得到接近 16:9 的矩形', () => {
  const l = layoutByArea(20, { w: 960, h: 540 }, 16 / 9);
  const ratio = l.realWidthM / l.realHeightM;
  assert.ok(ratio > 1.2 && ratio < 2.6, `ratio=${P(ratio)}`);
});

/* ============================ 三、点间距选型 ============================ */

test('选间距10 · 场景区间内取中点最近的一档（会议室 → P1.5）', () => {
  const pitch = pickPitch(byId('series-b'), { pitchHint: [1.2, 1.8] });
  assert.equal(pitch, 1.5);
  assert.ok(byId('series-b').pitches.some((p) => p.pitch === pitch));
});

test('选间距11 · 户外区间 → P6.66', () => {
  assert.equal(pickPitch(byId('series-e'), { pitchHint: [6, 7] }), 6.66);
});

test('选间距12 · 无场景提示时按面积区间推导（6.22m² → P1.5）', () => {
  const pitch = pickPitch(byId('series-b'), { widthM: 3.84, heightM: 1.62 });
  assert.equal(pitch, 1.5);
  assert.ok(byId('series-b').pitches.some((p) => p.pitch === pitch));
});

test('选间距13 · 面积越大，点间距越粗', () => {
  const fine = pickPitch(byId('series-h'), { areaSqm: 4 });
  const coarse = pickPitch(byId('series-h'), { areaSqm: 200 });
  assert.ok(coarse > fine, `fine=${fine} coarse=${coarse}`);
});

/* ============================ 四、总像素 ============================ */

test('总像素14 · 会议室 49 箱 × 640×360 = 1129 万', () => {
  const l = layoutBySize(6.0, 3.375, { w: 960, h: 540 });
  assert.equal((l.cabinets * 640 * 360) / 10000, 1128.96);
});

test('总像素15 · 户外 176 箱 × 192×144 = 486.6 万', () => {
  const l = layoutBySize(20, 10, { w: 1280, h: 960 });
  assert.equal(P((l.cabinets * 192 * 144) / 10000, 1), 486.6);
});

/* ============================ 五、控制器选型 ============================ */

test('控制器16 · 够用且最小：1129 万 → Controller H2（1300 万 / 8 网口）', () => {
  const c = selectController(11289600, controllers);
  assert.equal(c.kind, 'box');
  assert.equal(c.name, 'Controller H2');
  assert.equal(c.units, 1);
  assert.equal(c.capacity, 13000000);
  assert.equal(c.ports, 8);
});

test('控制器17 · 小屏不误配旗舰：486.6 万 → Controller M3（650 万 / 10 网口）', () => {
  const c = selectController(4866048, controllers);
  assert.equal(c.name, 'Controller M3');
  assert.equal(c.capacity, 6500000);
  assert.equal(c.ports, 10);
});

test('控制器18 · 超单机上限 → 转插卡式机箱', () => {
  const c = selectController(24000000, controllers);
  assert.equal(c.kind, 'frame');
  assert.equal(c.name, '机箱 F8');
  assert.equal(c.units, 1);
  assert.equal(c.cards, 6);
});

test('控制器19 · 连机箱也装不下 → 多台并联', () => {
  const c = selectController(36000000, controllers);
  assert.equal(c.kind, 'frame');
  assert.equal(c.units, 2);
  assert.equal(c.cards, 9);
  assert.equal(c.parallel, true);
});

/* ============================ 六、传输链路 ============================ */

test('传输20 · 30m → 网线直连', () => {
  const t = selectTransmission(30, scenarios.transmission);
  assert.equal(t.id, 'cable');
  assert.equal(t.label, '网线直连');
});

test('传输21 · 250m → 多模光纤', () => {
  const t = selectTransmission(250, scenarios.transmission);
  assert.equal(t.id, 'mmf');
  assert.equal(t.label, '多模光纤');
});

test('传输22 · 800m → 单模光纤', () => {
  const t = selectTransmission(800, scenarios.transmission);
  assert.equal(t.id, 'smf');
  assert.equal(t.label, '单模光纤');
});

test('传输23 · 光纤方案两端各一台光电转换器（×2）', () => {
  for (const id of ['mmf', 'smf']) {
    const seg = scenarios.transmission.find((t) => t.id === id);
    const oc = seg.components.find((c) => c.name === '光电转换器');
    assert.ok(oc, `${id} 缺光电转换器`);
    assert.equal(oc.qty, 2);
  }
});

/* ============================ 七、功耗与配电 ============================ */

test('功耗24 · 室内 25.4016m² × 438 = 最大 11125.9W / 平均 3708.6W', () => {
  const p = estimatePower(25.4016, byId('series-b'));
  assert.equal(p.maxW, 11125.9);
  assert.equal(p.avgW, 3708.6);
});

test('功耗25 · 户外 216.2688m² × 540 = 最大 116785.2W / 平均 29196.3W', () => {
  const p = estimatePower(216.2688, byId('series-e'));
  assert.equal(p.maxW, 116785.2);
  assert.equal(p.avgW, 29196.3);
});

test('配电26 · 档位取「≥ 需求且最小」：11125.9W → 20kW，116785.2W → 150kW', () => {
  assert.equal(pickDistributor(11125.9), 20);
  assert.equal(pickDistributor(116785.2), 150);
});

/* ============================ 八、数据完整性与端到端 ============================ */

test('数据27 · 场景 picks 引用的产品都存在，且像素数与箱体/点间距自洽', () => {
  for (const s of scenarios.scenes) {
    for (const pid of s.picks) {
      assert.ok(byId(pid), `场景 ${s.id} 引用了不存在的产品 ${pid}`);
    }
  }
  for (const p of products) {
    for (const pit of p.pitches) {
      const expW = p.cabinet.w / pit.pitch;
      const expH = p.cabinet.h / pit.pitch;
      assert.ok(Math.abs(expW - pit.pixels[0]) <= 2, `${p.id} P${pit.pitch} 宽像素不符`);
      assert.ok(Math.abs(expH - pit.pixels[1]) <= 2, `${p.id} P${pit.pitch} 高像素不符`);
    }
  }
});

test('端到端28 · 会议室方案字段齐全，options=3 返回 3 个备选', () => {
  const [one] = plan({ sceneId: 'conference-room', widthM: 6.0, heightM: 3.375, distanceM: 30 }, data);
  assert.equal(one.layout.cabinets, 49);
  assert.equal(one.totalPixels, 11289600);
  assert.equal(one.controller.name, 'Controller H2');
  assert.equal(one.receiverCards, 49);
  assert.equal(one.transmission.id, 'cable');
  assert.equal(one.power.maxW, 11125.9);
  assert.equal(one.power.distributorKw, 20);
  assert.ok(one.install.length > 0);
  assert.equal(one.pitch, 1.5);

  const three = plan(
    { sceneId: 'conference-room', widthM: 6.0, heightM: 3.375, distanceM: 30, options: 3 },
    data
  );
  assert.equal(three.length, 3);
  assert.deepEqual(three.map((p) => p.product.id), ['series-b', 'series-j', 'series-d']);
});
