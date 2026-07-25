const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { imageSize } = require('image-size');

const ROOT = 'D:/Projects/ai-man';
const OUT = process.env.PPT_OUT || path.join(ROOT, 'outputs', '灵山胜境景区导览AI数字人-产品方案介绍PPT-终稿.pptx');
const SHOT = path.join(ROOT, 'tmp', 'manual-screenshots');
const DESIGN = path.join(ROOT, 'tmp', 'product-overall-design');
const FIG = path.join(DESIGN, 'figures');
const LIVE = path.join(ROOT, 'tmp', 'live-product-screenshots');

const A = {
  home: path.join(SHOT, '01-visitor-home.png'),
  answer: path.join(LIVE, '02-live-visitor-answer.png'),
  service: path.join(SHOT, '04-visitor-performance-service.png'),
  admin: path.join(LIVE, '03-live-admin-overview.png'),
  feedback: path.join(SHOT, '06-admin-feedback.png'),
  low: path.join(LIVE, '04-live-admin-qa.png'),
  record: path.join(SHOT, '08-admin-record-detail.png'),
  knowledge: path.join(LIVE, '05-live-admin-knowledge.png'),
  avatar: path.join(SHOT, '10-admin-avatar.png'),
  solution: path.join(FIG, 'overall-solution.png'),
  architecture: path.join(FIG, 'runtime-architecture.png'),
  answerFlow: path.join(FIG, 'answer-flow.png'),
  ops: path.join(FIG, 'operations-loop.png'),
  value: path.join(FIG, 'value-map.png'),
};
Object.values(A).forEach((f) => { if (!fs.existsSync(f)) throw new Error(`Asset missing: ${f}`); });

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 5.625 });
pptx.layout = 'CUSTOM';
pptx.author = '灵山胜境景区导览AI数字人项目';
pptx.company = '灵山胜境景区导览AI数字人项目';
pptx.subject = '产品方案介绍';
pptx.title = '灵山胜境景区导览 AI 数字人｜产品方案介绍';
pptx.lang = 'zh-CN';
pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei', lang: 'zh-CN' };

const S = pptx.ShapeType;
const C = {
  deep: '0C4F4A',
  green: '14766D',
  teal: '2F8D83',
  gold: 'C99843',
  goldSoft: 'F2E5CB',
  sky: 'E5F0EC',
  ivory: 'F6F2EA',
  white: 'FFFEFA',
  ink: '153F3A',
  text: '243936',
  muted: '60716D',
  line: 'D4DEDA',
  sand: 'EDE5D5',
  red: 'B85A48',
  redSoft: 'F4E1DD',
  blueGrey: 'EAF2F0',
};
const FONT = 'Microsoft YaHei';
const W = 10, H = 5.625;

function rect(slide, x, y, w, h, fill, line = fill, opts = {}) {
  slide.addShape(opts.rounded ? S.roundRect : S.rect, {
    x, y, w, h,
    rectRadius: opts.rounded ? 0.05 : undefined,
    fill: { color: fill, transparency: opts.transparency },
    line: { color: line, width: opts.width || 0.65, transparency: line === fill ? 100 : 0 },
  });
}
function line(slide, x1, y1, x2, y2, color = C.line, width = 0.8) {
  slide.addShape(S.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width } });
}
function circle(slide, x, y, d, fill, lineColor = fill) {
  slide.addShape(S.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: lineColor, width: 0.7, transparency: lineColor === fill ? 100 : 0 } });
}
function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h, margin: opts.margin ?? 0,
    fontFace: FONT, fontSize: opts.size ?? 14,
    color: opts.color ?? C.text, bold: opts.bold ?? false,
    align: opts.align ?? 'left', valign: opts.valign ?? 'mid',
    fit: 'shrink', breakLine: false, charSpacing: opts.charSpacing ?? 0,
    italic: opts.italic ?? false,
  });
}
function contain(p, x, y, w, h, pad = 0) {
  const d = imageSize(p); const r = d.width / d.height; const box = w / h;
  let iw, ih, ix, iy;
  if (r >= box) { iw = w - pad * 2; ih = iw / r; ix = x + pad; iy = y + (h - ih) / 2; }
  else { ih = h - pad * 2; iw = ih * r; ix = x + (w - iw) / 2; iy = y + pad; }
  return { path: p, x: ix, y: iy, w: iw, h: ih };
}
function frame(slide, p, x, y, w, h, opts = {}) {
  rect(slide, x, y, w, h, opts.fill || C.white, opts.line || C.line, { width: opts.width || 0.7 });
  slide.addImage(contain(p, x + (opts.pad ?? 0.04), y + (opts.pad ?? 0.04), w - (opts.pad ?? 0.04) * 2, h - (opts.pad ?? 0.04) * 2));
}
function sectionLabel(slide, label) {
  rect(slide, 0.52, 0.28, 1.34, 0.26, C.sky, C.sky, { rounded: true });
  text(slide, label, 0.65, 0.34, 1.08, 0.13, { size: 9.7, color: C.green, bold: true, align: 'center', charSpacing: 0.4 });
}
function base(slide, section, title, page, subtitle = '') {
  slide.background = { color: C.ivory };
  rect(slide, 0, 0, W, H, C.ivory, C.ivory);
  rect(slide, 0, 0, W, 0.12, C.deep, C.deep);
  sectionLabel(slide, section);
  text(slide, title, 0.52, 0.61, 8.7, 0.38, { size: 24.5, color: C.ink, bold: true });
  if (subtitle) text(slide, subtitle, 0.54, 1.02, 8.72, 0.24, { size: 12.2, color: C.muted });
  circle(slide, 9.16, 0.33, 0.10, C.gold);
  line(slide, 0.52, 5.16, 9.48, 5.16, C.line, 0.65);
  text(slide, `灵山胜境景区导览AI数字人  ·  ${section}`, 0.54, 5.25, 5.9, 0.16, { size: 9.2, color: C.muted });
  text(slide, String(page).padStart(2, '0'), 9.05, 5.23, 0.34, 0.18, { size: 10.5, color: C.muted, bold: true, align: 'right' });
}
function darkBase(slide, page, section) {
  slide.background = { color: C.deep };
  rect(slide, 0, 0, W, H, C.deep, C.deep);
  circle(slide, 8.87, -0.51, 1.74, '277D74');
  circle(slide, 9.13, -0.28, 1.20, C.deep);
  circle(slide, -0.50, 4.93, 1.08, '277D74');
  line(slide, 0.52, 5.16, 9.48, 5.16, '4B8179', 0.65);
  text(slide, `灵山胜境景区导览AI数字人  ·  ${section}`, 0.54, 5.25, 5.8, 0.16, { size: 9.2, color: 'D8E9E4' });
  text(slide, String(page).padStart(2, '0'), 9.05, 5.23, 0.34, 0.18, { size: 10.5, color: 'D8E9E4', bold: true, align: 'right' });
}
function number(slide, n, x, y, fill = C.gold, d = 0.34) {
  circle(slide, x, y, d, fill);
  text(slide, String(n).padStart(2, '0'), x, y + 0.045, d, d - 0.08, { size: 10.2, color: C.white, bold: true, align: 'center' });
}
function miniTag(slide, label, x, y, w, fill = C.sky, color = C.green) {
  rect(slide, x, y, w, 0.24, fill, fill, { rounded: true });
  text(slide, label, x + 0.05, y + 0.035, w - 0.10, 0.13, { size: 9.3, color, bold: true, align: 'center' });
}
function callout(slide, n, title, body, x, y, w, accent = C.gold, bodySize = 11.2) {
  rect(slide, x, y, w, 0.96, C.white, C.line);
  number(slide, n, x + 0.16, y + 0.18, accent, 0.30);
  text(slide, title, x + 0.57, y + 0.12, w - 0.76, 0.18, { size: 13.3, color: C.ink, bold: true });
  text(slide, body, x + 0.50, y + 0.42, w - 0.70, 0.39, { size: bodySize, color: C.muted, valign: 'top' });
}
function infoBlock(slide, title, body, x, y, w, h, color = C.green, opts = {}) {
  rect(slide, x, y, w, h, C.white, C.line);
  rect(slide, x, y, 0.065, h, color, color);
  text(slide, title, x + 0.20, y + 0.15, w - 0.36, 0.20, { size: opts.titleSize || 15, color: C.ink, bold: true });
  text(slide, body, x + 0.20, y + 0.46, w - 0.36, h - 0.58, { size: opts.bodySize || 11.1, color: C.muted, valign: 'top' });
}
function pills(slide, values, x, y, gap = 0.12) {
  let px = x;
  values.forEach((v, i) => { const w = 0.58 + v.length * 0.13; miniTag(slide, v, px, y, w, i % 2 ? C.goldSoft : C.sky, i % 2 ? C.ink : C.green); px += w + gap; });
}

// 01 / Cover
{
  const s = pptx.addSlide(); darkBase(s, 1, '产品方案介绍');
  text(s, '灵山胜境景区导览', 0.62, 0.72, 4.6, 0.35, { size: 27, color: 'D9EAE5', bold: true });
  text(s, 'AI 数字人', 0.62, 1.11, 4.7, 0.56, { size: 42, color: C.white, bold: true });
  text(s, '产品方案介绍', 0.64, 1.77, 2.70, 0.25, { size: 17, color: 'CDE0DA' });
  text(s, '以景区官方资料为依据，将智能问答、数字人讲解、游览服务和后台运营接入同一服务链路。', 0.64, 2.40, 3.95, 0.66, { size: 16.4, color: 'DAEAE5', valign: 'top' });
  pills(s, ['可信问答', '数字人讲解', '运营闭环'], 0.64, 3.47);
  rect(s, 5.12, 1.14, 4.15, 2.94, 'EDF3EF', '629186');
  s.addImage(contain(A.home, 5.20, 1.22, 3.99, 2.25));
  rect(s, 5.20, 3.59, 3.99, 0.34, C.deep, C.deep, { transparency: 8 });
  text(s, '游客端真实界面 · 导览服务统一入口', 5.38, 3.68, 3.54, 0.12, { size: 10.3, color: C.white, bold: true });
}

// 02 / pain points
{
  const s = pptx.addSlide(); base(s, '01 需求场景', '景区导览升级：解决的不是“少一个页面”', 2, '真正需要解决的是信息难找、连续服务难接和运营问题难定位。');
  const cards = [
    ['01', '信息在不同入口间分散', '景点、演出、路线和游客服务分布在不同页面或渠道，游客需要反复切换、比对和确认。', A.home, C.gold],
    ['02', '固定内容难承接连续追问', '游客的提问会随位置和行程变化，从景点故事自然延伸到路线、演出和现场服务。', A.answer, C.green],
    ['03', '问题记录难转化为维护动作', '缺资料、无关问题、表达含糊和服务异常被混在一起，后台无法确定应由谁处理。', A.admin, C.red],
  ];
  cards.forEach((v, i) => {
    const x = 0.52 + i * 3.10;
    rect(s, x, 1.48, 2.86, 3.29, C.white, C.line);
    frame(s, v[3], x + 0.15, 1.65, 2.56, 1.17, { line: C.line });
    number(s, i + 1, x + 0.16, 3.04, v[4]);
    text(s, v[1], x + 0.61, 3.00, 1.96, 0.31, { size: 14.2, color: C.ink, bold: true, valign: 'top' });
    text(s, v[2], x + 0.18, 3.55, 2.46, 0.70, { size: 11.2, color: C.muted, valign: 'top' });
    miniTag(s, i === 0 ? '统一入口' : i === 1 ? '连续上下文' : '可执行治理', x + 0.18, 4.36, 1.17, i === 2 ? C.redSoft : C.sky, i === 2 ? C.red : C.green);
  });
}

// 03 / people
{
  const s = pptx.addSlide(); base(s, '01 需求场景', '两类用户、两种任务，共用一套服务底座', 3, '游客侧关注“得到什么”；管理员侧关注“如何持续把服务做对”。');
  rect(s, 0.52, 1.46, 4.20, 3.45, C.white, C.line);
  miniTag(s, '游客视角', 0.76, 1.68, 0.84, C.sky, C.green);
  text(s, '让每一次提问都服务于当前游览', 0.76, 2.07, 3.54, 0.25, { size: 17.5, color: C.ink, bold: true });
  const tourist = [
    ['景点与文化', '随问随答，回答能继续承接后续问题。'],
    ['路线与演出', '把“去哪、怎么走、看什么”放回同一行程。'],
    ['现场服务', '地图、服务设施与反馈入口随时可用。'],
  ];
  tourist.forEach((v, i) => { number(s, i + 1, 0.80, 2.55 + i * 0.62, i === 1 ? C.green : C.gold, 0.27); text(s, v[0], 1.20, 2.53 + i * 0.62, 1.17, 0.17, { size: 12.6, color: C.ink, bold: true }); text(s, v[1], 2.17, 2.52 + i * 0.62, 2.02, 0.22, { size: 10.8, color: C.muted }); });
  rect(s, 5.27, 1.46, 4.21, 3.45, C.white, C.line);
  miniTag(s, '景区管理员视角', 5.52, 1.68, 1.26, C.goldSoft, C.ink);
  text(s, '让每一个问题都有明确的维护去向', 5.52, 2.07, 3.54, 0.25, { size: 17.5, color: C.ink, bold: true });
  const admin = [
    ['服务状态', '判断模型、数字人和关键服务是否可用。'],
    ['问答质检', '回溯问题、回答、来源、置信度和反馈。'],
    ['资料维护', '将真正的知识缺口转为知识更新任务。'],
  ];
  admin.forEach((v, i) => { number(s, i + 1, 5.56, 2.55 + i * 0.62, i === 1 ? C.green : C.gold, 0.27); text(s, v[0], 5.96, 2.53 + i * 0.62, 1.17, 0.17, { size: 12.6, color: C.ink, bold: true }); text(s, v[1], 6.93, 2.52 + i * 0.62, 2.02, 0.22, { size: 10.8, color: C.muted }); });
  rect(s, 4.58, 2.68, 0.64, 0.96, C.deep, C.deep, { rounded: true });
  text(s, '同一\n数据底座', 4.64, 2.88, 0.52, 0.45, { size: 11.0, color: C.white, bold: true, align: 'center' });
}

// 04 / overall solution
{
  const s = pptx.addSlide(); base(s, '02 整体方案', '整体方案：让一次提问经历完整服务链路', 4, '游客端负责服务，后台负责改进；两者围绕同一套知识、记录与运行状态协同。');
  frame(s, A.solution, 0.52, 1.46, 5.52, 3.33, { fill: C.white });
  const rows = [
    ['游客服务层', '文字 / 语音提问、数字人讲解、地图、演出与游客服务入口', C.gold],
    ['业务编排层', 'FastAPI 统一处理会话、检索、模型调用、记录、反馈与能力连接', C.green],
    ['能力与数据层', '景区资料、模型、语音、数字人、地图服务与 SQLite 运行数据', C.ink],
  ];
  rows.forEach((v, i) => { const y = 1.50 + i * 0.88; infoBlock(s, v[0], v[1], 6.33, y, 3.15, 0.68, v[2], { titleSize: 14, bodySize: 10.2 }); });
  rect(s, 6.33, 4.20, 3.15, 0.58, C.sky, C.sky);
  text(s, '设计重点：回答是否可信、服务是否连续、问题是否可维护。', 6.53, 4.34, 2.75, 0.16, { size: 11.1, color: C.deep, bold: true, align: 'center' });
}

// 05 / visitor journey
{
  const s = pptx.addSlide(); base(s, '02 整体方案', '游客服务流程：从“听讲解”到“马上能行动”', 5, '系统不把路线、演出和服务信息拆成孤立功能，而是承接一次连续游览。');
  const steps = [
    ['到达景点', '先问看点与文化背景', C.gold],
    ['继续追问', '再问附近演出和活动', C.green],
    ['调整行程', '按同行者和时间选择路线', C.gold],
    ['获得服务', '跳转地图、服务设施或反馈', C.green],
  ];
  steps.forEach((v, i) => {
    const x = 0.60 + i * 2.13;
    number(s, i + 1, x, 1.56, v[2], 0.43);
    text(s, v[0], x - 0.13, 2.11, 0.72, 0.20, { size: 13.2, color: C.ink, bold: true, align: 'center' });
    text(s, v[1], x - 0.36, 2.38, 1.18, 0.38, { size: 10.4, color: C.muted, align: 'center', valign: 'top' });
    if (i < 3) line(s, x + 0.53, 1.77, x + 1.64, 1.77, C.line, 1.0);
  });
  frame(s, A.home, 0.52, 3.14, 4.15, 1.76, { fill: C.white });
  frame(s, A.service, 5.26, 3.14, 4.15, 1.76, { fill: C.white });
  miniTag(s, '讲解 · 问答 · 可信状态 · 反馈', 0.72, 3.32, 1.76, C.deep, C.white);
  miniTag(s, '地图 · 演出 · 游客服务', 5.46, 3.32, 1.50, C.deep, C.white);
}

// 06 / visitor entry
{
  const s = pptx.addSlide(); base(s, '03 产品展示', '游客端统一入口：服务集中，而不是功能堆叠', 6, '真实项目界面将数字人、自然语言提问、可靠提示和游览服务放在同一页。');
  frame(s, A.home, 0.52, 1.42, 6.34, 3.57, { fill: C.white });
  const notes = [
    ['数字人讲解区', '以形象与播报增强内容表达；暂停、重连与手动播报状态可见。', C.gold],
    ['问答与可信状态', '支持示例问题、文字与语音输入；回答区域明确呈现资料可信或人工复核状态，并保留反馈入口。', C.green],
    ['游览服务区', '演出时间、地图导航、游客服务与周边设施可直接进入。', C.gold],
  ];
  notes.forEach((v, i) => callout(s, i + 1, v[0], v[1], 7.15, 1.46 + i * 1.07, 2.31, v[2], 10.2));
}

// 07 / credible answer
{
  const s = pptx.addSlide(); base(s, '03 产品展示', '可信回答：不仅“答出来”，还要让游客知道能否放心使用', 7, '游客端展示回答、可靠状态与反馈入口；后台完整留存原问题、来源、置信度和模型状态。');
  frame(s, A.answer, 0.52, 1.43, 6.35, 3.55, { fill: C.white });
  const blocks = [
    ['导览回答', '围绕景区资料组织自然、连贯的导览式回答。', C.gold],
    ['可信状态', '根据检索命中与可靠判断，明确提示资料可信或建议人工复核。', C.green],
    ['后台留痕', '原问题、来源、置信度、模型状态和响应耗时完整保留。', C.ink],
    ['反馈入口', '“有帮助 / 无帮助”关联原问题和回答，形成持续优化依据。', C.gold],
  ];
  blocks.forEach((v, i) => {
    const y = 1.47 + i * 0.82;
    rect(s, 7.15, y, 2.30, 0.70, C.white, C.line);
    circle(s, 7.35, y + 0.18, 0.20, v[2]);
    text(s, v[0], 7.68, y + 0.11, 1.43, 0.16, { size: 12.0, color: C.ink, bold: true });
    text(s, v[1], 7.35, y + 0.39, 1.81, 0.18, { size: 9.6, color: C.muted, valign: 'top' });
  });
}

// 08 / admin overview
{
  const s = pptx.addSlide(); base(s, '03 产品展示', '景区管理后台：把“运营状态”变成“日常动作”', 8, '管理员可从总览进入游客洞察、问答质检、知识库和数字人管理，逐项定位并处理。');
  frame(s, A.admin, 0.52, 1.42, 5.88, 3.57, { fill: C.white });
  const mod = [
    ['运营总览', '服务状态、调用分布、待处理事项和关键指标。', C.gold],
    ['游客洞察', '高频主题、反馈与游客关注点。', C.green],
    ['问答质检', '查看原问题、回答、来源与可靠状态。', C.ink],
    ['知识库', '新增、上传、编辑、筛选与删除景区资料。', C.gold],
    ['数字人管理', '查看形象资源、运行状态与生成任务。', C.green],
  ];
  mod.forEach((v, i) => {
    const y = 1.46 + i * 0.66;
    rect(s, 6.76, y, 2.68, 0.49, i === 1 ? C.sky : C.white, C.line);
    rect(s, 6.76, y, 0.07, 0.49, v[2], v[2]);
    text(s, v[0], 6.96, y + 0.08, 1.06, 0.16, { size: 11.4, color: C.ink, bold: true });
    text(s, v[1], 8.12, y + 0.08, 1.11, 0.22, { size: 9.2, color: C.muted, valign: 'top' });
  });
  miniTag(s, '后台不是“看数据”，而是“据数据处置”', 6.84, 4.71, 2.50, C.deep, C.white);
}

// 09 / low confidence
{
  const s = pptx.addSlide(); base(s, '03 产品展示', '低置信度问题治理：分清原因，才能做对维护', 9, '当前后台低置信度记录已清空；治理机制保留，用于把真实问题分流到正确处理路径。');
  frame(s, A.low, 0.52, 1.47, 3.53, 2.31, { fill: C.white });
  miniTag(s, '当前运行状态 · 低置信度记录 0', 0.83, 3.94, 2.91, C.sky, C.green);
  const cases = [
    ['资料缺口', '属于导览范围，但官方资料支撑不足。', '补充或修订资料，再以原问题复测。', C.gold],
    ['无关问题', '股票、闲聊等超出景区导览服务边界。', '标记并过滤，不进入知识维护。', C.red],
    ['表达含糊', '对象、地点或上下文不完整。', '引导补充信息，转入澄清交互。', C.green],
    ['服务异常', '模型、语音、地图或数字人状态异常。', '检查接口、连接和运行日志。', C.ink],
  ];
  cases.forEach((v, i) => {
    const x = 4.43 + (i % 2) * 2.52, y = 1.48 + Math.floor(i / 2) * 1.42;
    rect(s, x, y, 2.26, 1.12, C.white, C.line);
    number(s, i + 1, x + 0.18, y + 0.18, v[3], 0.30);
    text(s, v[0], x + 0.60, y + 0.15, 1.34, 0.18, { size: 14.1, color: C.ink, bold: true });
    text(s, v[1], x + 0.20, y + 0.52, 1.78, 0.18, { size: 10.2, color: C.muted });
    text(s, v[2], x + 0.20, y + 0.81, 1.78, 0.16, { size: 10.0, color: v[3], bold: true });
  });
  rect(s, 4.43, 4.33, 4.78, 0.48, C.goldSoft, C.goldSoft);
  text(s, '治理目标：避免“无关问题”被误判为知识库缺口，让维护精力回到真正影响游客服务的问题上。', 4.66, 4.44, 4.32, 0.16, { size: 10.5, color: C.ink, bold: true, align: 'center' });
}

// 10 / technical architecture
{
  const s = pptx.addSlide(); base(s, '04 核心技术与模型', '分层架构：前端体验、业务编排与外部能力解耦协同', 10, '模型、语音、数字人和地图以接口接入，既满足当前轻量部署，也为后续替换和扩展保留空间。');
  frame(s, A.architecture, 0.52, 1.42, 5.38, 3.57, { fill: C.white });
  const layers = [
    ['界面层', 'React / TypeScript / Vite', '游客端与管理后台共用交互与数据底座。', C.gold],
    ['服务编排', 'FastAPI', '会话、检索、模型调用、反馈与状态记录。', C.green],
    ['知识与模型', '景区知识检索 + DeepSeek', '资料约束回答，保留来源、状态和可追溯记录。', C.ink],
    ['多模态能力', 'ASR / TTS / LiveTalking / Wav2Lip / WebRTC', '完成输入识别、播报、形象驱动与浏览器播放。', C.gold],
    ['数据与位置', 'SQLite + 地图服务', '保存知识与运行记录，并提供定位与步行规划。', C.green],
  ];
  layers.forEach((v, i) => { const y = 1.43 + i * 0.70; rect(s, 6.21, y, 3.24, 0.57, C.white, C.line); rect(s, 6.21, y, 0.86, 0.57, v[3], v[3]); text(s, v[0], 6.28, y + 0.16, 0.72, 0.13, { size: 10.0, color: C.white, bold: true, align: 'center' }); text(s, v[1], 7.22, y + 0.09, 2.00, 0.15, { size: 10.6, color: C.ink, bold: true }); text(s, v[2], 7.22, y + 0.29, 2.00, 0.14, { size: 8.9, color: C.muted }); });
}

// 11 / trusted QA
{
  const s = pptx.addSlide(); base(s, '04 核心技术与模型', '知识增强问答：把“回答生成”放在资料约束之下', 11, '系统先检索景区资料，再组织回答；同时返回来源、可靠状态与记录，为前台展示和后台质检提供依据。');
  frame(s, A.answerFlow, 0.52, 1.42, 5.78, 2.70, { fill: C.white });
  const logic = [
    ['资料检索', '从景区资料中召回候选片段，并保留命中来源。', C.gold],
    ['上下文组织', '将问题、资料和有限轮次的会话历史共同输入模型。', C.green],
    ['可靠判断', '资料不足、超出服务范围或调用异常时明确标识。', C.ink],
  ];
  logic.forEach((v, i) => infoBlock(s, v[0], v[1], 6.65, 1.42 + i * 0.81, 2.81, 0.65, v[2], { titleSize: 13.1, bodySize: 10.0 }));
  const output = [
    ['游客看到', '回答正文 + 可靠状态 + 反馈入口'],
    ['后台看到', '问题、回答、来源、置信度、模型状态与响应时间'],
  ];
  output.forEach((v, i) => { const x = 0.52 + i * 4.05; rect(s, x, 4.38, 3.74, 0.48, i ? C.sky : C.goldSoft, i ? C.sky : C.goldSoft); text(s, v[0], x + 0.18, 4.51, 0.70, 0.14, { size: 11.4, color: C.ink, bold: true }); text(s, v[1], x + 0.94, 4.48, 2.60, 0.17, { size: 10.0, color: C.ink }); });
}

// 12 / multimodal
{
  const s = pptx.addSlide(); base(s, '04 核心技术与模型', '多模态数字人：增强表达，不替代事实判断', 12, '数字人只播报已完成知识检索和可靠判断的回答；文字问答始终是基础服务链路。');
  frame(s, A.home, 0.52, 1.42, 4.62, 3.57, { fill: C.white });
  const chain = [
    ['输入理解', '文字输入 / 语音识别', C.gold],
    ['内容生成', '知识检索 + 大模型组织回答', C.green],
    ['表达呈现', 'TTS + 数字人 + WebRTC 播放', C.ink],
    ['持续服务', '数字人或语音异常时回落至文字问答和资料展示', C.gold],
  ];
  chain.forEach((v, i) => {
    const y = 1.47 + i * 0.82;
    number(s, i + 1, 5.52, y + 0.11, v[2], 0.30);
    line(s, 5.67, y + 0.42, 5.67, y + 0.76, i < 3 ? C.line : C.ivory, 0.8);
    text(s, v[0], 6.00, y + 0.09, 2.20, 0.17, { size: 13.6, color: C.ink, bold: true });
    text(s, v[1], 6.00, y + 0.34, 3.10, 0.22, { size: 10.6, color: C.muted, valign: 'top' });
  });
  rect(s, 5.52, 4.61, 3.87, 0.28, C.deep, C.deep);
  text(s, '服务降级不是“假装正常”，而是明确保留可用能力与真实调用状态。', 5.73, 4.68, 3.44, 0.11, { size: 9.8, color: C.white, bold: true, align: 'center' });
}

// 13 / innovation - tech/function
{
  const s = pptx.addSlide(); base(s, '05 系统创新特性', '创新要点（一）：让数字人从展示层进入服务链', 13, '项目的价值不在于叠加“模型 + 形象”，而在于用一套机制把可信内容、自然表达和维护动作接起来。');
  const inv = [
    ['可信对话机制', '检索、生成、可靠判断与后台来源留痕同步执行；回答不脱离景区资料口径。', '知识增强问答', C.gold],
    ['一体化导览体验', '景点讲解、路线、演出和现场服务在连续对话中衔接，减少入口切换。', '行程导向服务', C.green],
    ['低置信度分类治理', '不把所有低置信问题视为缺资料，按问题性质进入知识、澄清或技术处理。', '可执行后台治理', C.ink],
  ];
  inv.forEach((v, i) => { const y = 1.42 + i * 0.89; rect(s, 0.52, y, 8.92, 0.76, C.white, C.line); number(s, i + 1, 0.75, y + 0.20, v[3], 0.32); text(s, v[0], 1.29, y + 0.13, 2.30, 0.16, { size: 14.6, color: C.ink, bold: true }); text(s, v[1], 3.64, y + 0.12, 3.84, 0.25, { size: 10.4, color: C.muted, valign: 'top' }); miniTag(s, v[2], 7.86, y + 0.26, 1.20, v[3] === C.ink ? C.sky : C.goldSoft, v[3] === C.ink ? C.green : C.ink); });
  rect(s, 0.52, 4.22, 4.38, 0.62, C.white, C.line);
  const flowLabels = ['游客提问', '有依据回答', '记录反馈', '后台治理'];
  flowLabels.forEach((label, i) => { const x = 0.72 + i * 1.01; circle(s, x, 4.39, 0.18, i % 2 ? C.green : C.gold); text(s, label, x - 0.23, 4.59, 0.64, 0.11, { size: 8.5, color: C.muted, align: 'center', bold: i === 1 }); if (i < 3) line(s, x + 0.20, 4.48, x + 0.82, 4.48, C.line, 0.65); });
  rect(s, 5.24, 4.22, 4.20, 0.62, C.sky, C.sky);
  text(s, '形成“游客提问 → 有依据回答 → 记录反馈 → 后台治理 → 内容更新”的持续服务链路。', 5.49, 4.43, 3.70, 0.14, { size: 10.5, color: C.deep, bold: true, align: 'center' });
}

// 14 / innovation - experience & extension
{
  const s = pptx.addSlide(); base(s, '05 系统创新特性', '创新要点（二）：前台体验与后台运营相互驱动', 14, '面向游客把服务做得自然、可理解；面向管理员把问题做成可观察、可维护和可扩展的任务。');
  frame(s, A.ops, 0.52, 1.43, 4.56, 3.44, { fill: C.white });
  const ex = [
    ['自然交互', '文字、语音与数字人按游客习惯协同输出。', C.gold],
    ['可信可见', '游客可见可靠状态和反馈入口；来源与置信度进入后台质检。', C.green],
    ['反馈可用', '反馈与问答记录关联，支撑复核和知识更新。', C.ink],
    ['能力可换', '模型、语音、地图和数字人均可按部署条件替换。', C.gold],
  ];
  ex.forEach((v, i) => { const x = 5.46 + (i % 2) * 2.00, y = 1.53 + Math.floor(i / 2) * 1.23; rect(s, x, y, 1.77, 1.00, C.white, C.line); circle(s, x + 0.18, y + 0.18, 0.19, v[2]); text(s, v[0], x + 0.48, y + 0.14, 1.08, 0.17, { size: 12.8, color: C.ink, bold: true }); text(s, v[1], x + 0.18, y + 0.49, 1.38, 0.25, { size: 9.7, color: C.muted, valign: 'top' }); });
  rect(s, 5.46, 4.12, 3.97, 0.76, C.deep, C.deep);
  text(s, '前台产生真实问题，后台将问题转为更新任务；知识内容的更新又反馈到下一次问答。', 5.72, 4.34, 3.47, 0.19, { size: 11.1, color: C.white, bold: true, align: 'center' });
}

// 15 / test
{
  const s = pptx.addSlide(); base(s, '06 测试数据与验证', '分批验证：既看真实回答，也看当前代码质量', 15, '真实模型对照与自动化回归属于不同验证批次；本页按各自范围呈现，避免混用指标。');
  rect(s, 0.52, 1.45, 5.30, 2.94, C.white, C.line);
  rect(s, 0.52, 1.45, 5.30, 0.44, C.deep, C.deep);
  text(s, '真实模型对照测试 · 2026.07.11', 0.75, 1.59, 4.85, 0.14, { size: 12.5, color: C.white, bold: true });
  const modelStats = [['20 / 20', '完成 DeepSeek（deepseek-v4-pro）真实调用'], ['20 / 20', '检索到官方资料'], ['3 条', '每题返回检索来源'], ['5.314 秒', '平均响应时间（2.657–7.316 秒）']];
  modelStats.forEach((v, i) => { const x = 0.75 + (i % 2) * 2.43, y = 2.15 + Math.floor(i / 2) * 0.90; text(s, v[0], x, y, 1.18, 0.26, { size: i === 3 ? 19 : 22, color: i === 3 ? C.green : C.ink, bold: true }); text(s, v[1], x, y + 0.36, 1.90, 0.24, { size: 10.3, color: C.muted, valign: 'top' }); });
  rect(s, 6.14, 1.45, 3.30, 2.94, C.white, C.line);
  rect(s, 6.14, 1.45, 3.30, 0.44, C.green, C.green);
  text(s, '当前代码回归验证 · 2026.07.15', 6.35, 1.59, 2.85, 0.14, { size: 12.5, color: C.white, bold: true });
  text(s, '67 项', 6.40, 2.22, 1.12, 0.34, { size: 29, color: C.ink, bold: true });
  text(s, '后端自动化测试通过', 6.42, 2.72, 1.86, 0.20, { size: 13.3, color: C.ink, bold: true });
  line(s, 6.40, 3.17, 9.14, 3.17, C.line, 0.8);
  text(s, '覆盖：问答、知识库、后台、反馈、游客报告、导航、语音与数字人等核心链路。', 6.42, 3.35, 2.52, 0.34, { size: 10.4, color: C.muted, valign: 'top' });
  rect(s, 6.42, 3.83, 2.55, 0.25, C.sky, C.sky, { rounded: true });
  text(s, '前端 TypeScript 检查与生产构建通过', 6.56, 3.88, 2.25, 0.12, { size: 9.4, color: C.green, bold: true, align: 'center' });
  rect(s, 0.52, 4.58, 8.92, 0.28, C.goldSoft, C.goldSoft);
  text(s, '验证结论：核心服务链路具备真实模型调用证据、资料来源追溯能力与回归验证基线。', 0.76, 4.65, 8.42, 0.12, { size: 10.6, color: C.ink, bold: true, align: 'center' });
}

// 16 / conclusion
{
  const s = pptx.addSlide(); darkBase(s, 16, '总结');
  text(s, '从“会说话”到“能服务、可维护”', 0.62, 0.60, 7.95, 0.42, { size: 30.5, color: C.white, bold: true });
  text(s, '已形成面向景区导览场景的完整服务方案：以可信内容为基础，以连续体验为前台，以运营闭环为保障。', 0.64, 1.17, 7.78, 0.23, { size: 14.3, color: 'D3E5DF' });
  const end = [
    ['可信', '可靠状态与反馈可见，来源留存后台', C.gold],
    ['连贯', '讲解、问路、演出与服务连续衔接', C.green],
    ['可维护', '反馈与低置信度问题形成治理任务', C.gold],
    ['可扩展', '模型、数字人与服务能力接口化', C.green],
  ];
  end.forEach((v, i) => { const x = 0.64 + (i % 2) * 3.45, y = 1.82 + Math.floor(i / 2) * 1.18; rect(s, x, y, 3.08, 0.88, i === 1 ? '155F58' : '165A54', '4C877D'); circle(s, x + 0.23, y + 0.24, 0.38, v[2]); text(s, v[0], x + 0.80, y + 0.17, 1.78, 0.19, { size: 17.3, color: C.white, bold: true }); text(s, v[1], x + 0.80, y + 0.48, 1.98, 0.15, { size: 10.6, color: 'D8E9E3' }); });
  rect(s, 7.47, 1.74, 1.84, 2.93, '165A54', '4C877D');
  miniTag(s, '可交付', 7.82, 1.96, 1.12, C.goldSoft, C.ink);
  frame(s, A.home, 7.61, 2.32, 1.55, 1.08, { fill: 'EAF0ED', line: '6D968E', pad: 0.02 });
  text(s, '游客端、可信问答、\n后台治理已形成可验证链路', 7.66, 3.72, 1.46, 0.39, { size: 9.5, color: 'D8E9E3', bold: true, align: 'center', valign: 'top' });
  text(s, '灵山胜境景区导览 AI 数字人', 7.47, 4.76, 1.84, 0.16, { size: 10.3, color: C.goldSoft, bold: true, align: 'center' });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
pptx.writeFile({ fileName: OUT });
console.log(`Created ${OUT}`);
