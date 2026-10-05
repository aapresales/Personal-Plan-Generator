/**
 * LED 方案规划器 · 计算引擎
 * ------------------------------------------------------------------
 * 纯函数，无 DOM 依赖，可在 Node 与浏览器 ESM 中直接引用。
 *
 * 核心约束（别改回去）：
 *  1. 排布一律走「箱体矩阵」，不做面积除法 —— 面积除法会丢失宽高比，无法真实排布。
 *  2. 引擎内零产品名分支：所有行为由 cabinet.w/h + pitches[].pixels 驱动，
 *     新增产品 = 追加一条 JSON，代码零改动。
 *  3. 输出真实尺寸与溢出量（overshootX/Y）：工程上屏体只能 ≥ 墙体需求。
 */

/** 配电柜标准档位（kW），取「≥ 需求 且 最小」的一档 */
export const DISTRIBUTOR_LADDER = [10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400];

/** 无场景提示时，按面积区间推导目标点间距 */
const PITCH_BANDS = [
  { maxArea: 5, target: 0.9 },
  { maxArea: 15, target: 1.5 },
  { maxArea: 40, target: 2.0 },
  { maxArea: 100, target: 3.0 },
  { maxArea: Infinity, target: 6.0 }
];

const EPS = 1e-6;

/** 保留 d 位小数，避免浮点噪声（3.8400000000000003 → 3.84） */
export function round(v, d = 2) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function nearestTo(list, target) {
  return list.reduce((best, cur) =>
    Math.abs(cur.pitch - target) < Math.abs(best.pitch - target) ? cur : best
  );
}

/* ------------------------------------------------------------------ */
/* 1. 点间距选型                                                        */
/* ------------------------------------------------------------------ */

/**
 * 选点间距：优先落在场景 pitchHint 区间内（取区间中点最近的一档），
 * 没有提示时按面积区间推导目标值。
 * @param {object} product 产品记录
 * @param {{areaSqm?:number,widthM?:number,heightM?:number,pitchHint?:number[],pitch?:number}} req
 * @returns {number} 点间距 mm
 */
export function pickPitch(product, req = {}) {
  const list = (product.pitches || []).slice().sort((a, b) => a.pitch - b.pitch);
  if (!list.length) throw new Error(`产品 ${product.id} 没有点间距数据`);

  if (req.pitch != null) {
    const exact = list.find((p) => p.pitch === req.pitch);
    if (exact) return exact.pitch;
  }

  const hint = req.pitchHint;
  if (Array.isArray(hint) && hint.length === 2) {
    const inRange = list.filter((p) => p.pitch >= hint[0] && p.pitch <= hint[1]);
    if (inRange.length) return nearestTo(inRange, (hint[0] + hint[1]) / 2).pitch;
  }

  const area =
    req.areaSqm ?? (req.widthM && req.heightM ? req.widthM * req.heightM : 0);
  const band = PITCH_BANDS.find((b) => area <= b.maxArea) || PITCH_BANDS[PITCH_BANDS.length - 1];
  return nearestTo(list, band.target).pitch;
}

/* ------------------------------------------------------------------ */
/* 2. 排布：箱体矩阵                                                     */
/* ------------------------------------------------------------------ */

/**
 * 按需求宽高排布：每边向上取整到整数箱体。
 * @returns {{cols:number,rows:number,cabinets:number,realWidthM:number,realHeightM:number,overshootXm:number,overshootYm:number}}
 */
export function layoutBySize(widthM, heightM, cabinet) {
  if (!(widthM > 0) || !(heightM > 0)) throw new Error('需求宽高必须为正数');
  const cw = cabinet.w / 1000;
  const ch = cabinet.h / 1000;
  const cols = Math.ceil(widthM / cw - EPS);
  const rows = Math.ceil(heightM / ch - EPS);
  return buildLayout(cols, rows, cabinet, {
    overshootXm: round(cols * cw - widthM, 4),
    overshootYm: round(rows * ch - heightM, 4)
  });
}

/**
 * 只有面积、没有宽高时：按箱体宽高比反推一个尽量接近 16:9 的矩形行列。
 */
export function layoutByArea(areaSqm, cabinet, targetRatio = 16 / 9) {
  if (!(areaSqm > 0)) throw new Error('面积必须为正数');
  const cw = cabinet.w / 1000;
  const ch = cabinet.h / 1000;
  const minCount = Math.ceil(areaSqm / (cw * ch) - EPS);
  const k = Math.sqrt(minCount * targetRatio * (ch / cw));
  const lo = Math.max(1, Math.floor(k * 0.4));
  const hi = Math.max(lo + 1, Math.ceil(k * 2.5));

  let best = null;
  for (let cols = lo; cols <= hi; cols++) {
    const rows = Math.ceil(minCount / cols - EPS);
    const count = cols * rows;
    const ratio = (cols * cw) / (rows * ch);
    const err = Math.abs(ratio - targetRatio);
    const cand = { cols, rows, count, err };
    if (
      !best ||
      err < best.err - 1e-9 ||
      (Math.abs(err - best.err) < 1e-9 && cand.cols > best.cols)
    ) {
      best = cand;
    }
  }

  return buildLayout(best.cols, best.rows, cabinet, { totalCount: best.count });
}

function buildLayout(cols, rows, cabinet, extra = {}) {
  const cw = cabinet.w / 1000;
  const ch = cabinet.h / 1000;
  const cabinets = cols * rows;
  return {
    cols,
    rows,
    cabinets,
    realWidthM: round(cols * cw, 4),
    realHeightM: round(rows * ch, 4),
    overshootXm: extra.overshootXm ?? 0,
    overshootYm: extra.overshootYm ?? 0,
    cabinet
  };
}

/* ------------------------------------------------------------------ */
/* 3. 控制器选型：够用且最小                                             */
/* ------------------------------------------------------------------ */

/**
 * 选「带载 ≥ 需求 且 最小」的型号；全部带不动则升级插卡式机箱；再不够则并联。
 * @returns {object} 控制器方案
 */
export function selectController(totalPixels, controllers) {
  const boxes = controllers
    .filter((c) => c.type === 'box')
    .sort((a, b) => a.capacity - b.capacity);

  const fit = boxes.find((c) => c.capacity >= totalPixels);
  if (fit) {
    return {
      kind: 'box',
      name: fit.name,
      units: 1,
      parallel: false,
      capacity: fit.capacity,
      ports: fit.ports,
      headroom: fit.capacity - totalPixels,
      model: fit
    };
  }

  const frames = controllers
    .filter((c) => c.type === 'frame')
    .sort((a, b) => a.slots * a.card.capacity - b.slots * b.card.capacity);

  if (frames.length) {
    const f = frames[0];
    const slotsNeeded = Math.ceil(totalPixels / f.card.capacity);
    const units = Math.max(1, Math.ceil(slotsNeeded / f.slots));
    return {
      kind: 'frame',
      name: f.name,
      units,
      parallel: units > 1,
      cards: slotsNeeded,
      cardName: f.card.name,
      cardCapacity: f.card.capacity,
      capacity: slotsNeeded * f.card.capacity,
      slots: f.slots,
      headroom: slotsNeeded * f.card.capacity - totalPixels,
      model: f
    };
  }

  const biggest = boxes[boxes.length - 1];
  const units = Math.ceil(totalPixels / biggest.capacity);
  return {
    kind: 'box',
    name: biggest.name,
    units,
    parallel: true,
    capacity: biggest.capacity * units,
    ports: biggest.ports,
    headroom: biggest.capacity * units - totalPixels,
    model: biggest
  };
}

/* ------------------------------------------------------------------ */
/* 4. 传输链路选型                                                      */
/* ------------------------------------------------------------------ */

/**
 * 按距离落区间：网线（≤100m）/ 多模（≤500m）/ 单模（更远）。
 */
export function selectTransmission(distanceM, transmission) {
  const sorted = transmission
    .slice()
    .sort((a, b) => (a.maxDistance ?? Infinity) - (b.maxDistance ?? Infinity));
  const seg =
    sorted.find((t) => distanceM <= (t.maxDistance ?? Infinity)) || sorted[sorted.length - 1];
  return {
    id: seg.id,
    label: seg.label,
    maxDistance: seg.maxDistance ?? null,
    distanceM,
    components: (seg.components || []).map((c) => ({ ...c }))
  };
}

/* ------------------------------------------------------------------ */
/* 5. 功耗估算与配电                                                    */
/* ------------------------------------------------------------------ */

/** 最大功耗 = 实际面积 × 单位面积最大功耗；平均功耗 = 实际面积 × 单位面积平均功耗 */
export function estimatePower(areaSqm, product) {
  const conf = product.power || {};
  const maxPerSqm = conf.maxPerSqm ?? 0;
  const avgPerSqm = conf.avgPerSqm ?? maxPerSqm * (conf.avgRatio ?? 1 / 3);
  return {
    maxW: round(areaSqm * maxPerSqm, 1),
    avgW: round(areaSqm * avgPerSqm, 1),
    maxPerSqm,
    avgPerSqm: round(avgPerSqm, 1)
  };
}

/** 配电柜档位：≥ 需求且最小 */
export function pickDistributor(maxW, ladder = DISTRIBUTOR_LADDER) {
  const kw = maxW / 1000;
  return ladder.find((x) => x >= kw) ?? ladder[ladder.length - 1];
}

/* ------------------------------------------------------------------ */
/* 6. 主流程                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {{sceneId:string,productId?:string,widthM?:number,heightM?:number,areaSqm?:number,distanceM?:number,pitch?:number,options?:number}} req
 * @param {{products:object[],controllers:object[],scenarios:object}} data
 * @returns {object} 完整方案
 */
export function plan(req, data) {
  const scene =
    (data.scenarios.scenes || []).find((s) => s.id === req.sceneId) ||
    (data.scenarios.scenes || [])[0];
  if (!scene) throw new Error('没有可用的场景数据');

  const wanted = req.options && req.options > 0 ? req.options : 1;
  const picks = (scene.picks || []).slice(0, wanted);
  return picks.map((pid) => buildOne(req, data, scene, pid));
}

function buildOne(req, data, scene, productId) {
  const product = data.products.find((p) => p.id === productId);
  if (!product) throw new Error(`产品不存在：${productId}`);

  const pitch = pickPitch(product, {
    widthM: req.widthM,
    heightM: req.heightM,
    areaSqm: req.areaSqm,
    pitchHint: scene.pitchHint,
    pitch: req.pitch
  });
  const pitchInfo = product.pitches.find((p) => p.pitch === pitch);

  const layout =
    req.widthM && req.heightM
      ? layoutBySize(req.widthM, req.heightM, product.cabinet)
      : layoutByArea(req.areaSqm, product.cabinet);

  const areaSqm = round(layout.realWidthM * layout.realHeightM, 4);
  const pixelsPerCabinet = { w: pitchInfo.pixels[0], h: pitchInfo.pixels[1] };
  const totalPixels = layout.cabinets * pixelsPerCabinet.w * pixelsPerCabinet.h;

  const controller = selectController(totalPixels, data.controllers);
  const transmission = selectTransmission(
    req.distanceM ?? scene.distanceHint ?? 30,
    data.scenarios.transmission
  );
  const power = estimatePower(areaSqm, product);
  const distributorKw = pickDistributor(power.maxW);
  const receiverCards = product.hasReceiverCard === false ? 0 : layout.cabinets;

  const warnings = [];
  if (transmission.id !== 'cable' && totalPixels > 5000000) {
    warnings.push('大面积远距离场景，建议核对光纤与光模块带宽是否匹配总像素');
  }
  if (transmission.id !== 'cable') {
    warnings.push('光纤两端各需一台光电转换器（发送端 + 接收端），报价时勿漏');
  }
  if (controller.parallel) {
    warnings.push(`控制器需 ${controller.units} 台并联，务必使用同一时钟源保证同步`);
  }
  if (layout.overshootXm > 500 || layout.overshootYm > 500) {
    warnings.push('屏体尺寸溢出较大，建议复核墙体可用空间或更换箱体规格');
  }
  if (scene.usage === 'outdoor' && product.ip.front !== 'IP65') {
    warnings.push('户外场景建议选用 IP65 及以上防护等级');
  }

  return {
    scene: { id: scene.id, label: scene.label, usage: scene.usage },
    product: {
      id: product.id,
      name: product.name,
      usage: product.usage,
      brightness: product.brightness,
      refresh: product.refresh,
      ip: product.ip
    },
    pitch,
    cabinet: { ...product.cabinet },
    pixelsPerCabinet,
    layout,
    areaSqm,
    totalPixels,
    controller,
    receiverCards,
    transmission,
    power: { ...power, distributorKw },
    install: scene.install ? [...scene.install] : [...(product.install || [])],
    accessories: [...(scene.accessories || [])],
    warnings
  };
}
