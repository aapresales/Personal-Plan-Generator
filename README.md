# LED 方案规划器 (Personal Plan Generator)

个人自用的 LED 显示屏方案生成器：填场景 + 尺寸 + 传输距离，直接出完整方案
（箱体排布 / 总像素 / 控制器 / 接收卡 / 传输链路 / 功耗配电 / 安装与附件）。

纯静态、**零第三方依赖**、纯 ESM，Node ≥ 18 或任意现代浏览器。

> 数据全部来自 `data/*.json`，引擎内没有任何产品名分支 —— 新增产品 = 追加一条 JSON，代码零改动。

## 快速开始

```bash
npm test        # 28 项单元测试
npm run demo    # 命令行直接看引擎输出，不需启页面
npm run serve   # 本地预览 → http://127.0.0.1:5173/
```

> 页面用 `fetch` 读取 `data/*.json`，所以**不要直接双击 index.html**（`file://` 会被 CORS 拦住），
> 本地请走 `npm run serve`。线上 GitHub Pages 不受影响。
>
> Windows / MSYS 环境若通配符或路径含空格出问题，加 `MSYS_NO_PATHCONV=1`。

## 目录

```
├── data/
│   ├── products.json      产品库（尺寸 / 点间距 / 像素 / 亮度 / 防护 / 功耗）
│   ├── controllers.json   控制系统库（单机带载 + 插卡式机箱）
│   ├── scenarios.json     场景规则 + 问卷字段 + 传输方案 + 附件清单
│   └── knowledge.json     行业通识 / 封装 / 控制 / 传输 / 安装
├── src/
│   ├── engine.js          计算引擎（纯函数，无 DOM 依赖）
│   ├── app.js             单页壳逻辑
│   └── styles.css         样式（light / dark 双模）
├── scripts/
│   ├── demo.mjs           命令行演示
│   └── serve.mjs          零依赖静态服务器
├── test/
│   └── engine.test.mjs    单元测试（28 项）
└── index.html
```

## 引擎核心流程

```
输入：场景 + (宽×高 或 面积) + 传输距离
  ↓
pickPitch()          面积/场景区间 → 选点间距档位
  ↓
layoutBySize()       需求宽高 ÷ 箱体尺寸 → 行列向上取整 → 真实排布
layoutByArea()       无宽高时按箱体宽高比反推矩形行列
  ↓
总像素 = 箱体数 × 单箱像素
  ↓
selectController()   选「带载 ≥ 需求 且 最小」；超限转插卡式机箱；再超并联
  ↓
selectTransmission() 按距离落区间 → 网线 / 多模 / 单模
  ↓
estimatePower()      面积 × 单位功耗 → 最大/平均 + 配电柜档位
  ↓
输出：完整方案（箱体 / 像素 / 控制器 / 接收卡 / 传输 / 功率 / 安装 / 附件）
```

## 三条别改回去的设计决策

1. **用箱体矩阵排布，不用面积除法。** 面积除法会丢失宽高比，无法真实排布。
   引擎输出实际尺寸与溢出量（`overshootX/Y`）—— 工程上屏体只能 ≥ 墙体需求。
2. **控制器选「够用且最小」。** 小屏不会误配旗舰处理器；全部带不动才升级插卡式机箱，再不够才多台并联。
3. **零产品分支。** 引擎里没有任何 `switch(产品名)`，行为全由 `cabinet.w/h` + `pitches[].pixels` 驱动。

## 实测输出样例

会议室 6.0m × 3.375m（Series B / P1.5，30m）

```
排布：7 列 × 7 行 = 49 个箱体 → 实际 6.72m × 3.78m
单箱像素：640×360 → 总像素 1129 万
控制器：Controller H2 ×1（带载 1300 万 / 8 网口）
接收卡：49 张
传输：网线直连（30m）
功率：最大 11125.9W / 平均 3708.6W → 配电 20kW
```

户外广告大牌 20m × 10m（Series E / P6.66，250m）

```
排布：16 列 × 11 行 = 176 个箱体 → 实际 20.48m × 10.56m
单箱像素：192×144 → 总像素 486.6 万
控制器：Controller M3 ×1（带载 650 万 / 10 网口）
传输：多模光纤（250m）→ 光电转换器×2 + 多模 LC 双芯光纤 + 10G SFP+ 多模光模块
功率：最大 116785.2W / 平均 29196.3W → 配电 150kW
```

## 部署

纯静态，无后端。仓库根目录即站点根，GitHub Pages 直接指 `main` / `(root)`：

```
https://aapresales.github.io/Personal-Plan-Generator/
```

## 待办

- [ ] 替换 `data/products.json` 为真实产品参数表
- [x] P1 单页壳（导航 + 搜索 + 配置器 + 结果卡片）
- [ ] P2 问卷式路径（7 项需求 → 1~3 个方案）+ 知识层页面
- [ ] P3 双模式主题 + 导出 Markdown 方案书
