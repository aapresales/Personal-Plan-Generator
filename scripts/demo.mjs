/**
 * 命令行演示：直接看引擎输出，不需要启页面。
 *   npm run demo
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { plan } from '../src/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, 'data', p), 'utf8'));

const data = {
  products: read('products.json'),
  controllers: read('controllers.json'),
  scenarios: read('scenarios.json')
};

const cases = [
  { title: '室内会议室', req: { sceneId: 'conference-room', widthM: 6.0, heightM: 3.375, distanceM: 30, options: 1 } },
  { title: '户外广告大牌', req: { sceneId: 'outdoor-billboard', widthM: 20, heightM: 10, distanceM: 250, options: 1 } }
];

const wan = (px) => (px / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 });

for (const c of cases) {
  console.log(`\n===== ${c.title} =====`);
  for (const p of plan(c.req, data)) {
    console.log(`排布：${p.layout.cols} 列 × ${p.layout.rows} 行 = ${p.layout.cabinets} 个箱体 → 实际 ${p.layout.realWidthM}m × ${p.layout.realHeightM}m`);
    console.log(`产品：${p.product.name} / P${p.pitch} · 单箱像素 ${p.pixelsPerCabinet.w}×${p.pixelsPerCabinet.h} → 总像素 ${wan(p.totalPixels)} 万`);
    const ctl = p.controller.kind === 'frame'
      ? `${p.controller.name} ×${p.controller.units}（${p.controller.cardName} ×${p.controller.cards} 张）`
      : `${p.controller.name} ×${p.controller.units}（带载 ${wan(p.controller.capacity)} 万 / ${p.controller.ports} 网口）`;
    console.log(`控制器：${ctl}`);
    console.log(`接收卡：${p.receiverCards} 张`);
    console.log(`传输：${p.transmission.label}（${p.transmission.distanceM}m）`);
    console.log(`功率：最大 ${p.power.maxW}W / 平均 ${p.power.avgW}W → 配电 ${p.power.distributorKw}kW`);
    console.log(`安装：${p.install.join(' · ')}`);
  }
}
console.log('');
