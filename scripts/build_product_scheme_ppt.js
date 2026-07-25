const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { imageSize } = require('image-size');

const ROOT = 'D:/Projects/ai-man';
const OUT = path.join(ROOT, 'outputs', '灵山胜境景区导览AI数字人-产品方案介绍PPT-终稿.pptx');
const SHOTS = path.join(ROOT, 'tmp', 'manual-screenshots');
const PROD = path.join(ROOT, 'tmp', 'product-overall-design');
const FIG = path.join(PROD, 'figures');

const assets = {
  home: path.join(SHOTS, '01-visitor-home.png'),
  answer: path.join(SHOTS, '03-visitor-answer-expanded.png'),
  service: path.join(SHOTS, '04-visitor-performance-service.png'),
  admin: path.join(PROD, 'admin-overview-current.png'),
  low: path.join(SHOTS, '07-admin-low-confidence.png'),
  avatar: path.join(SHOTS, '10-admin-avatar.png'),
  solution: path.join(FIG, 'overall-solution.png'),
  architecture: path.join(FIG, 'runtime-architecture.png'),
  answerFlow: path.join(FIG, 'answer-flow.png'),
  operations: path.join(FIG, 'operations-loop.png'),
};

for (const p of Object.values(assets)) {
  if (!fs.existsSync(p)) throw new Error(`Missing required asset: ${p}`);
}

const pptx = new PptxGenJS();
pptx.author = '灵山胜境景区导览AI数字人项目';
pptx.company = '灵山胜境景区导览AI数字人项目';
pptx.subject = '产品方案介绍';
pptx.title = '灵山胜境景区导览 AI 数字人｜产品方案介绍';
pptx.lang = 'zh-CN';
pptx.theme = {
  headFontFace: 'Microsoft YaHei',
  bodyFontFace: 'Microsoft YaHei',
  lang: 'zh-CN',
};
pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 5.625 });
pptx.layout = 'CUSTOM';
pptx.margin = 0;

const S = pptx.ShapeType;
const C = {
  deep: '0D4F4A',
  ink: '183F3C',
  teal: '2D7B73',
  tealPale: 'DDEDE8',
  gold: 'C69A50',
  goldPale: 'F2E4C8',
  ivory: 'F7F3EB',
  paper: 'FFFDF8',
  mist: 'EDF2EF',
  line: 'D6DDD9',
  text: '263937',
  muted: '63736F',
  white: 'FFFFFF',
  red: 'B65B4A',
  redPale: 'F4E0DB',
  sage: 'A7BEAF',
};
const FONT = 'Microsoft YaHei';
const W = 10;
const H = 5.625;

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontFace: FONT,
    fontSize: opts.fontSize ?? 20,
    color: opts.color ?? C.text,
    bold: opts.bold ?? false,
    breakLine: false,
    margin: opts.margin ?? 0,
    valign: opts.valign ?? 'mid',
    align: opts.align ?? 'left',
    fit: 'shrink',
    paraSpaceAfterPt: opts.paraSpaceAfterPt ?? 0,
    charSpacing: opts.charSpacing ?? 0,
    italic: opts.italic ?? false,
    transparency: opts.transparency,
  });
}

function rect(slide, x, y, w, h, fill, line = fill, radius = false, transparency) {
  slide.addShape(radius ? S.roundRect : S.rect, {
    x, y, w, h,
    rectRadius: radius ? 0.06 : undefined,
    fill: { color: fill, transparency },
    line: { color: line, transparency: line === fill ? 100 : 0, width: 0.75 },
  });
}

function circle(slide, x, y, d, fill, line = fill) {
  slide.addShape(S.ellipse, {
    x, y, w: d, h: d,
    fill: { color: fill },
    line: { color: line, transparency: line === fill ? 100 : 0, width: 0.75 },
  });
}

function line(slide, x1, y1, x2, y2, color = C.line, width = 1.1, dash = 'solid') {
  slide.addShape(S.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width, dashType: dash },
  });
}

function dot(slide, x, y, color = C.gold, d = 0.08) {
  circle(slide, x, y, d, color);
}

function contain(pathStr, x, y, w, h, pad = 0) {
  const dim = imageSize(pathStr);
  const ratio = dim.width / dim.height;
  const boxRatio = w / h;
  let iw, ih, ix, iy;
  if (ratio >= boxRatio) {
    iw = w - pad * 2;
    ih = iw / ratio;
    ix = x + pad;
    iy = y + (h - ih) / 2;
  } else {
    ih = h - pad * 2;
    iw = ih * ratio;
    ix = x + (w - iw) / 2;
    iy = y + pad;
  }
  return { path: pathStr, x: ix, y: iy, w: iw, h: ih };
}

function crop(pathStr, x, y, w, h) {
  const dim = imageSize(pathStr);
  const ratio = dim.width / dim.height;
  const boxRatio = w / h;
  let iw, ih, ix, iy;
  if (ratio >= boxRatio) {
    ih = h;
    iw = ih * ratio;
    ix = x - (iw - w) / 2;
    iy = y;
  } else {
    iw = w;
    ih = iw / ratio;
    ix = x;
    iy = y - (ih - h) / 2;
  }
  return { path: pathStr, x: ix, y: iy, w: iw, h: ih };
}

function addScreenshot(slide, p, x, y, w, h, label, opts = {}) {
  rect(slide, x - 0.035, y - 0.035, w + 0.07, h + 0.07, C.white, C.line, false);
  slide.addImage(contain(p, x, y, w, h, opts.pad ?? 0));
  if (label) {
    rect(slide, x + 0.12, y + 0.10, Math.min(w - 0.24, 2.2), 0.27, C.deep, C.deep, false);
    addText(slide, label, x + 0.22, y + 0.107, Math.min(w - 0.44, 1.95), 0.23, {
      fontSize: 12.5, color: C.white, bold: true,
    });
  }
}

function addFooter(slide, section, page, dark = false) {
  const color = dark ? 'D1E1DB' : C.muted;
  const faint = dark ? '5B8D85' : C.line;
  line(slide, 0.52, 5.23, 9.48, 5.23, faint, 0.65);
  addText(slide, `灵山胜境景区导览AI数字人  ·  ${section}`, 0.55, 5.29, 5.7, 0.18, {
    fontSize: 9.5, color, valign: 'mid',
  });
  addText(slide, String(page).padStart(2, '0'), 8.98, 5.27, 0.45, 0.20, {
    fontSize: 10.5, color, bold: true, align: 'right',
  });
}

function addLightTitle(slide, section, title, page, deck = '') {
  slide.background = { color: C.ivory };
  rect(slide, 0, 0, W, H, C.ivory, C.ivory, false);
  addText(slide, section.toUpperCase(), 0.55, 0.35, 1.7, 0.20, {
    fontSize: 10.5, color: C.gold, bold: true, charSpacing: 1.1,
  });
  addText(slide, title, 0.55, 0.58, 8.7, 0.52, {
    fontSize: 30.5, color: C.ink, bold: true,
  });
  if (deck) addText(slide, deck, 0.57, 1.11, 8.35, 0.28, { fontSize: 13.5, color: C.muted });
  dot(slide, 9.13, 0.42, C.gold, 0.10);
  addFooter(slide, section, page);
}

function addDarkBase(slide, page, section) {
  slide.background = { color: C.deep };
  rect(slide, 0, 0, W, H, C.deep, C.deep, false);
  circle(slide, 8.72, -0.54, 1.9, C.teal, C.teal);
  circle(slide, 8.98, -0.25, 1.25, C.deep, C.deep);
  circle(slide, -0.52, 4.78, 1.12, C.teal, C.teal);
  addFooter(slide, section, page, true);
}

function numberBadge(slide, n, x, y, fill = C.deep) {
  circle(slide, x, y, 0.34, fill, fill);
  addText(slide, String(n).padStart(2, '0'), x, y + 0.02, 0.34, 0.25, {
    fontSize: 10.5, color: C.white, bold: true, align: 'center',
  });
}

function contentCard(slide, x, y, w, h, n, title, body, accent = C.gold) {
  rect(slide, x, y, w, h, C.paper, C.line, false);
  numberBadge(slide, n, x + 0.22, y + 0.20, accent);
  addText(slide, title, x + 0.68, y + 0.18, w - 0.9, 0.31, {
    fontSize: 19.5, color: C.ink, bold: true,
  });
  addText(slide, body, x + 0.22, y + 0.72, w - 0.44, h - 0.90, {
    fontSize: 14.2, color: C.muted, valign: 'top',
  });
}

function smallTag(slide, text, x, y, w, fill, color) {
  rect(slide, x, y, w, 0.30, fill, fill, true);
  addText(slide, text, x + 0.08, y + 0.038, w - 0.16, 0.21, {
    fontSize: 11.5, color, bold: true, align: 'center',
  });
}

// 1. Cover
{
  const slide = pptx.addSlide();
  addDarkBase(slide, 1, '产品方案介绍');
  addText(slide, '灵山胜境景区导览', 0.62, 0.72, 4.6, 0.52, {
    fontSize: 32, color: 'DDEFE9', bold: true,
  });
  addText(slide, 'AI 数字人', 0.62, 1.19, 4.2, 0.62, {
    fontSize: 43, color: C.white, bold: true,
  });
  addText(slide, '产品方案介绍', 0.65, 1.95, 3.1, 0.34, {
    fontSize: 18, color: 'D1E1DB',
  });
  line(slide, 0.65, 2.45, 3.70, 2.45, C.gold, 1.8);
  addText(slide, '把景区资料、自然对话、数字人讲解与后台维护连接为一条服务链路。', 0.65, 2.72, 3.78, 0.65, {
    fontSize: 17, color: 'D9E9E4', valign: 'top',
  });
  smallTag(slide, '可信问答', 0.65, 3.71, 0.94, '1C6962', C.white);
  smallTag(slide, '数字人讲解', 1.72, 3.71, 1.20, '1C6962', C.white);
  smallTag(slide, '运营闭环', 3.05, 3.71, 0.94, '1C6962', C.white);
  rect(slide, 5.06, 0.58, 4.18, 4.34, 'EAF0EB', '5D8D83', false);
  slide.addImage(contain(assets.home, 5.16, 0.68, 3.98, 4.14));
  rect(slide, 5.16, 4.40, 3.98, 0.42, C.deep, C.deep, false, 15);
  addText(slide, '游客端 · 数字人导览统一入口', 5.36, 4.48, 3.40, 0.18, {
    fontSize: 11, color: C.white, bold: true,
  });
}

// 2. Pain points
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '01 需求场景', '景区导览为何需要升级', 2, '服务信息要易获得，连续追问要能承接，运营问题要可处理。');
  contentCard(slide, 0.55, 1.72, 2.78, 2.43, 1, '信息分散', '景点介绍、演出、路线与服务入口分布在不同页面或不同渠道，游客往往要反复查找。', C.gold);
  contentCard(slide, 3.60, 1.72, 2.78, 2.43, 2, '追问难接', '固定讲解可以回答“是什么”，却难以继续理解“在哪里”“接下来怎么走”等连续需求。', C.teal);
  contentCard(slide, 6.65, 1.72, 2.78, 2.43, 3, '服务难维护', '问题无统一沉淀和分类，资料缺口、无关提问、表达不清与服务异常难以获得对应处置。', C.red);
  addText(slide, '导览升级的重点，不只是增加一个问答入口，而是让服务可持续地被回答、被核验和被维护。', 0.70, 4.52, 8.70, 0.38, {
    fontSize: 17.5, color: C.ink, bold: true, align: 'center',
  });
}

// 3. Users
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '01 需求场景', '两类用户，同一条服务闭环', 3, '游客获得连续、可信的游览帮助；景区管理员获得可追溯、可处理的运营视角。');
  rect(slide, 0.55, 1.62, 3.68, 3.20, C.paper, C.line, false);
  smallTag(slide, '游客', 0.80, 1.86, 0.67, C.tealPale, C.deep);
  addText(slide, '游客端的核心诉求', 0.80, 2.27, 2.55, 0.30, { fontSize: 22, color: C.ink, bold: true });
  const tourist = [
    ['随问随答', '景点、路线、演出与服务查询在同一入口完成。'],
    ['回答可核验', '回答可查看资料来源与可靠状态。'],
    ['多种交互', '文字、语音和数字人讲解可按现场条件切换。'],
  ];
  tourist.forEach((v, i) => {
    dot(slide, 0.84, 2.83 + i * 0.58, C.gold, 0.09);
    addText(slide, v[0], 1.03, 2.77 + i * 0.58, 1.02, 0.22, { fontSize: 15.2, color: C.ink, bold: true });
    addText(slide, v[1], 2.04, 2.75 + i * 0.58, 1.86, 0.31, { fontSize: 12.4, color: C.muted, valign: 'top' });
  });
  rect(slide, 5.77, 1.62, 3.68, 3.20, C.paper, C.line, false);
  smallTag(slide, '景区管理员', 6.02, 1.86, 1.12, C.goldPale, C.ink);
  addText(slide, '后台的核心诉求', 6.02, 2.27, 2.55, 0.30, { fontSize: 22, color: C.ink, bold: true });
  const admin = [
    ['问题可见', '查看高频问题、低置信度记录与游客反馈。'],
    ['资料可改', '围绕来源、问答记录和知识内容快速校正。'],
    ['状态可管', '掌握问答服务、数字人与内容运营的整体状态。'],
  ];
  admin.forEach((v, i) => {
    dot(slide, 6.06, 2.83 + i * 0.58, C.teal, 0.09);
    addText(slide, v[0], 6.25, 2.77 + i * 0.58, 1.02, 0.22, { fontSize: 15.2, color: C.ink, bold: true });
    addText(slide, v[1], 7.26, 2.75 + i * 0.58, 1.86, 0.31, { fontSize: 12.4, color: C.muted, valign: 'top' });
  });
  circle(slide, 4.52, 2.54, 0.94, C.deep, C.deep);
  addText(slide, '同一\n能力底座', 4.57, 2.71, 0.84, 0.50, { fontSize: 13.2, color: C.white, bold: true, align: 'center', valign: 'mid' });
  line(slide, 4.24, 3.01, 4.50, 3.01, C.gold, 1.2);
  line(slide, 5.46, 3.01, 5.72, 3.01, C.gold, 1.2);
}

// 4. Positioning & solution
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '02 整体方案', '产品定位：将“能问”变成“能服务、可维护”', 4, '面向景区导览场景，建立从游客提问到后台运营的统一服务方案。');
  addScreenshot(slide, assets.solution, 0.56, 1.55, 5.92, 3.28, '整体方案');
  const items = [
    ['统一入口', '游客通过文字、语音和数字人进入同一导览服务。'],
    ['资料依据', '以景区知识检索支撑回答，让来源和状态可见。'],
    ['运营闭环', '记录、反馈和低置信问题进入后台，成为维护任务。'],
  ];
  items.forEach((v, i) => {
    const y = 1.66 + i * 1.02;
    rect(slide, 6.82, y, 2.63, 0.82, C.paper, C.line, false);
    numberBadge(slide, i + 1, 7.03, y + 0.24, i === 1 ? C.teal : C.gold);
    addText(slide, v[0], 7.50, y + 0.16, 1.65, 0.22, { fontSize: 16, color: C.ink, bold: true });
    addText(slide, v[1], 7.50, y + 0.41, 1.65, 0.28, { fontSize: 11.2, color: C.muted, valign: 'top' });
  });
}

// 5. Visitor flow
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '02 整体方案', '一次连续游览，四类服务自然衔接', 5, '系统围绕游客真实游览过程组织服务，而非将功能拆成彼此孤立的入口。');
  const flow = [
    ['问景点', '了解文化背景与游览重点', C.gold],
    ['听讲解', '数字人以语音与画面辅助理解', C.teal],
    ['查路线', '按当前位置获得路线与点位提示', C.gold],
    ['找服务', '演出、餐饮、卫生间等信息可继续追问', C.teal],
  ];
  flow.forEach((v, i) => {
    const x = 0.58 + i * 1.48;
    circle(slide, x, 1.78, 0.58, v[2], v[2]);
    addText(slide, String(i + 1), x, 1.91, 0.58, 0.22, { fontSize: 18, color: C.white, bold: true, align: 'center' });
    addText(slide, v[0], x - 0.12, 2.50, 0.82, 0.25, { fontSize: 16, color: C.ink, bold: true, align: 'center' });
    addText(slide, v[1], x - 0.28, 2.83, 1.16, 0.59, { fontSize: 11.5, color: C.muted, align: 'center', valign: 'top' });
    if (i < 3) line(slide, x + 0.68, 2.07, x + 1.24, 2.07, C.line, 1.4);
  });
  rect(slide, 0.56, 3.93, 5.92, 0.63, C.tealPale, C.tealPale, false);
  addText(slide, '连续对话负责承接“接下来怎么走、还有什么可看、在哪里办理”等自然追问。', 0.80, 4.10, 5.42, 0.22, { fontSize: 14.2, color: C.deep, bold: true, align: 'center' });
  addScreenshot(slide, assets.service, 7.00, 1.57, 2.42, 2.83, '演出与服务');
}

// 6. Visitor unified entry
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '03 产品展示', '游客端：一个入口，覆盖导览中的关键提问', 6, '真实项目界面：数字人讲解、文字或语音提问、地图和游览服务入口集中呈现。');
  addScreenshot(slide, assets.home, 0.55, 1.52, 6.45, 3.55, '游客端首页');
  const labels = [
    ['01', '数字人讲解', '以数字人形象与语音输出承载导览内容。', C.gold],
    ['02', '文字 / 语音提问', '游客可用自然语言提出景点与服务问题。', C.teal],
    ['03', '地图与服务入口', '快速进入地图、演出和周边服务查询。', C.gold],
  ];
  labels.forEach((v, i) => {
    const y = 1.67 + i * 1.08;
    rect(slide, 7.32, y, 2.12, 0.82, C.paper, C.line, false);
    smallTag(slide, v[0], 7.48, y + 0.16, 0.43, v[3], C.white);
    addText(slide, v[1], 8.02, y + 0.15, 1.25, 0.20, { fontSize: 14.2, color: C.ink, bold: true });
    addText(slide, v[2], 7.48, y + 0.43, 1.74, 0.24, { fontSize: 10.6, color: C.muted, valign: 'top' });
  });
}

// 7. Answer with evidence
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '03 产品展示', '回答不仅给出内容，也呈现依据与去向', 7, '以真实问答详情为例：回答、资料来源、可靠状态、继续追问和服务跳转位于同一链路。');
  addScreenshot(slide, assets.answer, 0.55, 1.52, 6.45, 3.55, '问答详情');
  const blocks = [
    ['回答正文', '围绕景区知识生成结构化、易读的导览解释。', C.gold],
    ['资料来源与状态', '展示检索来源与可靠状态，让游客知道回答从哪里来。', C.teal],
    ['反馈与服务跳转', '支持继续追问、提交反馈或进入关联游览服务。', C.gold],
  ];
  blocks.forEach((v, i) => {
    const y = 1.67 + i * 1.08;
    rect(slide, 7.32, y, 2.12, 0.82, C.paper, C.line, false);
    dot(slide, 7.52, y + 0.18, v[2], 0.11);
    addText(slide, v[0], 7.72, y + 0.13, 1.34, 0.21, { fontSize: 14, color: C.ink, bold: true });
    addText(slide, v[1], 7.52, y + 0.42, 1.69, 0.25, { fontSize: 10.6, color: C.muted, valign: 'top' });
  });
}

// 8. Admin overview
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '03 产品展示', '景区管理后台：从“看得到”到“能处理”', 8, '真实项目后台将运行概览、游客反馈、问答质检与知识维护集中到管理员视图。');
  addScreenshot(slide, assets.admin, 0.55, 1.52, 6.45, 3.55, '管理员总览');
  const blocks = [
    ['运行总览', '查看系统服务与关键运营状态。'],
    ['游客洞察', '汇集反馈和高频问题，了解真实服务需求。'],
    ['问答质检', '围绕回答记录、可靠状态与异常问题开展复核。'],
    ['知识维护', '将发现的问题落到景区资料与内容管理。'],
  ];
  blocks.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 7.32 + col * 1.07;
    const y = 1.67 + row * 1.40;
    rect(slide, x, y, 0.98, 1.16, i === 1 ? C.tealPale : C.paper, C.line, false);
    addText(slide, v[0], x + 0.12, y + 0.16, 0.74, 0.34, { fontSize: 13.2, color: C.ink, bold: true, align: 'center' });
    addText(slide, v[1], x + 0.10, y + 0.53, 0.78, 0.42, { fontSize: 9.8, color: C.muted, align: 'center', valign: 'top' });
  });
}

// 9. Low confidence governance
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '03 产品展示', '低置信度问题治理：先分流，再处理', 9, '不是所有低置信度记录都应被当作“缺知识”；系统按问题类型帮助管理员选择对应动作。');
  addScreenshot(slide, assets.low, 0.55, 1.65, 3.52, 2.44, '低置信度治理（历史结构）');
  smallTag(slide, '当前记录：0', 1.58, 4.28, 1.38, C.tealPale, C.deep);
  addText(slide, '当前后台低置信度记录已清空；历史页面仅用于说明治理入口和记录结构。', 0.60, 4.68, 3.42, 0.22, { fontSize: 10.2, color: C.muted, align: 'center' });
  const types = [
    ['资料缺口', '补充或修订景区资料', C.gold, '进入知识维护'],
    ['无关问题', '不作为景区知识缺口', C.red, '过滤并标注'],
    ['表达不清', '引导游客补充关键信息', C.teal, '转为澄清交互'],
    ['服务异常', '检查外部服务或连接状态', C.ink, '转为技术排查'],
  ];
  types.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 4.47 + col * 2.43;
    const y = 1.62 + row * 1.42;
    rect(slide, x, y, 2.16, 1.11, C.paper, C.line, false);
    circle(slide, x + 0.20, y + 0.20, 0.28, v[2], v[2]);
    addText(slide, v[0], x + 0.60, y + 0.18, 1.30, 0.22, { fontSize: 15, color: C.ink, bold: true });
    addText(slide, v[1], x + 0.20, y + 0.55, 1.76, 0.21, { fontSize: 10.9, color: C.muted });
    addText(slide, v[3], x + 0.20, y + 0.80, 1.76, 0.16, { fontSize: 10.2, color: v[2], bold: true });
  });
}

// 10. Core technology
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '04 核心技术与模型', '核心技术：以“导览服务链”组织能力', 10, '前端、服务编排、知识检索、模型与数字人能力解耦协同，兼顾体验、维护与后续替换。');
  addScreenshot(slide, assets.architecture, 0.55, 1.53, 5.34, 3.42, '运行架构');
  const tech = [
    ['界面层', 'React / Vite', C.gold],
    ['服务层', 'FastAPI', C.teal],
    ['知识与推理', '景区知识检索 + DeepSeek', C.gold],
    ['语音与数字人', 'ASR / TTS + LiveTalking / Wav2Lip / WebRTC', C.teal],
    ['数据与位置', 'SQLite + 地图服务', C.ink],
  ];
  tech.forEach((v, i) => {
    const y = 1.53 + i * 0.66;
    rect(slide, 6.24, y, 3.20, 0.48, C.paper, C.line, false);
    rect(slide, 6.24, y, 1.05, 0.48, v[2], v[2], false);
    addText(slide, v[0], 6.33, y + 0.12, 0.85, 0.18, { fontSize: 11.4, color: C.white, bold: true, align: 'center' });
    addText(slide, v[1], 7.47, y + 0.09, 1.78, 0.20, { fontSize: 12.4, color: C.ink, bold: true });
  });
}

// 11. Trusted QA process
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '04 核心技术与模型', '可信问答机制：让每次回答都可追溯', 11, '系统把“回答得出”与“回答是否有据”放在同一流程中处理。');
  addScreenshot(slide, assets.answerFlow, 0.55, 1.58, 8.90, 2.42, '问答处理流程');
  const steps = ['问题处理', '知识检索', '上下文组织', '模型生成', '可靠判断', '结果展示', '记录反馈'];
  steps.forEach((s, i) => {
    const x = 0.66 + i * 1.26;
    circle(slide, x, 4.24, 0.26, i === 4 ? C.gold : C.teal, i === 4 ? C.gold : C.teal);
    addText(slide, String(i + 1), x, 4.29, 0.26, 0.14, { fontSize: 9.5, color: C.white, bold: true, align: 'center' });
    addText(slide, s, x - 0.26, 4.59, 0.79, 0.18, { fontSize: 10.1, color: C.muted, bold: i === 4, align: 'center' });
  });
  rect(slide, 0.55, 4.94, 8.90, 0.20, C.tealPale, C.tealPale, false);
  addText(slide, '当资料不足、问题超出景区范围或服务发生异常时，系统不把它们混同为“资料缺失”，而是进入相应的记录和治理路径。', 0.73, 4.95, 8.53, 0.14, { fontSize: 10.6, color: C.deep, bold: true, align: 'center' });
}

// 12. Multimodal & degradation
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '04 核心技术与模型', '多模态协同，异常情况下仍保持服务连续', 12, '文本、语音与数字人共同承担表达；外部能力异常时，核心导览流程可自动回落到可用通道。');
  const media = [
    ['文本问答', '适合安静场景与信息回看', C.gold],
    ['语音交互', '适合边走边问与听讲', C.teal],
    ['数字人讲解', '增强内容表达与沉浸感', C.ink],
  ];
  media.forEach((v, i) => {
    const x = 0.65 + i * 2.15;
    circle(slide, x + 0.58, 1.66, 0.58, v[2], v[2]);
    addText(slide, String(i + 1), x + 0.58, 1.82, 0.58, 0.18, { fontSize: 17, color: C.white, bold: true, align: 'center' });
    addText(slide, v[0], x, 2.45, 1.72, 0.24, { fontSize: 16.2, color: C.ink, bold: true, align: 'center' });
    addText(slide, v[1], x, 2.78, 1.72, 0.32, { fontSize: 11.1, color: C.muted, align: 'center', valign: 'top' });
    if (i < 2) line(slide, x + 1.52, 1.95, x + 2.06, 1.95, C.line, 1.4);
  });
  rect(slide, 7.08, 1.56, 2.34, 1.89, C.paper, C.line, false);
  addText(slide, '协同原则', 7.32, 1.78, 1.84, 0.22, { fontSize: 17, color: C.ink, bold: true, align: 'center' });
  addText(slide, '同一份导览内容，可按游客偏好和网络条件切换表达方式。', 7.35, 2.24, 1.78, 0.53, { fontSize: 12, color: C.muted, align: 'center', valign: 'top' });
  rect(slide, 0.56, 3.74, 8.86, 1.08, C.deep, C.deep, false);
  addText(slide, '服务降级策略', 0.83, 3.95, 1.72, 0.24, { fontSize: 16.5, color: C.goldPale, bold: true });
  line(slide, 2.63, 3.91, 2.63, 4.57, '5C8F86', 0.8);
  addText(slide, '数字人或语音服务异常', 2.92, 3.89, 1.94, 0.20, { fontSize: 13.6, color: C.white, bold: true });
  addText(slide, '文字问答、资料来源、反馈与游览服务入口仍然可用。', 2.92, 4.17, 2.96, 0.22, { fontSize: 11.1, color: 'D6E8E2' });
  line(slide, 6.08, 3.91, 6.08, 4.57, '5C8F86', 0.8);
  addText(slide, '模型或外部能力异常', 6.35, 3.89, 1.94, 0.20, { fontSize: 13.6, color: C.white, bold: true });
  addText(slide, '后台标识实际调用、Mock 与 Fallback 状态，避免误判为正常服务。', 6.35, 4.17, 2.65, 0.27, { fontSize: 11.1, color: 'D6E8E2', valign: 'top' });
}

// 13. Innovation technology/function
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '05 系统创新特性', '创新要点（一）：把技术能力落到景区服务动作', 13, '创新不在于堆叠概念，而在于让知识、模型、数字人与后台工作在同一条导览服务链上。');
  const inv = [
    ['01', '知识增强的可信对话', '将景区资料检索、来源展示和可靠状态纳入问答流程，回答有依据、问题可回溯。', C.gold],
    ['02', '多模态数字人协同', '文字、语音与数字人共同服务；数字人是表达层，而非脱离导览内容的展示层。', C.teal],
    ['03', '一体化智能导览', '景点讲解、路线、演出和现场服务在连续对话中衔接，减少游客在入口间切换。', C.ink],
    ['04', '低置信度分类治理', '将资料缺口、无关提问、表达不清和服务异常分别进入对应处理路径。', C.red],
  ];
  inv.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.56 + col * 4.55;
    const y = 1.66 + row * 1.55;
    rect(slide, x, y, 4.32, 1.29, C.paper, C.line, false);
    addText(slide, v[0], x + 0.24, y + 0.20, 0.55, 0.28, { fontSize: 20.5, color: v[3], bold: true });
    addText(slide, v[1], x + 0.92, y + 0.19, 2.98, 0.25, { fontSize: 18.2, color: C.ink, bold: true });
    addText(slide, v[2], x + 0.24, y + 0.63, 3.78, 0.42, { fontSize: 12.1, color: C.muted, valign: 'top' });
  });
}

// 14. Innovation experience / extensibility
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '05 系统创新特性', '创新要点（二）：让体验自然，让运营持续', 14, '从游客可感知的交互体验，到管理员可持续的维护能力，形成前台与后台的双向循环。');
  addScreenshot(slide, assets.operations, 0.55, 1.65, 3.82, 2.93, '运营闭环');
  const inv = [
    ['自然交互', '以自然语言组织问答，配合文字、语音与数字人输出。', C.gold],
    ['依据可见', '将资料来源与可靠状态呈现给游客，降低“答得像但不一定准”的疑虑。', C.teal],
    ['反馈联动', '游客反馈、问答记录和低置信问题进入后台，支撑内容复核与改进。', C.ink],
    ['能力接口化', '前后端分离，模型、数字人和地图等能力可按实际部署条件替换与扩展。', C.gold],
  ];
  inv.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 4.78 + col * 2.33;
    const y = 1.68 + row * 1.42;
    rect(slide, x, y, 2.12, 1.14, C.paper, C.line, false);
    dot(slide, x + 0.20, y + 0.19, v[2], 0.11);
    addText(slide, v[0], x + 0.42, y + 0.15, 1.42, 0.20, { fontSize: 14.5, color: C.ink, bold: true });
    addText(slide, v[1], x + 0.20, y + 0.50, 1.72, 0.43, { fontSize: 10.9, color: C.muted, valign: 'top' });
  });
  rect(slide, 4.78, 4.34, 4.54, 0.31, C.tealPale, C.tealPale, false);
  addText(slide, '前台服务持续产生真实问题，后台维护持续提升下一次服务。', 4.91, 4.39, 4.25, 0.18, { fontSize: 11.4, color: C.deep, bold: true, align: 'center' });
}

// 15. Test data
{
  const slide = pptx.addSlide();
  addLightTitle(slide, '06 测试数据与验证', '测试验证：关键链路具备可追溯的验证记录', 15, '测试指标按批次呈现：真实模型对照与当前代码自动化验证不混合为同一口径。');
  const stats = [
    ['20 / 20', '真实模型调用与官方资料命中', '2026.07.11｜20题对照', C.gold],
    ['3 条', '每题返回检索来源', '2026.07.11｜来源可追溯', C.teal],
    ['5.314 秒', '平均响应时间', '2026.07.11｜范围 2.657–7.316 秒', C.ink],
    ['67 项', '后端自动化测试通过', '2026.07.15｜前端生产构建通过', C.gold],
  ];
  stats.forEach((v, i) => {
    const x = 0.55 + i * 2.27;
    rect(slide, x, 1.72, 2.08, 2.23, C.paper, C.line, false);
    rect(slide, x, 1.72, 2.08, 0.10, v[3], v[3], false);
    addText(slide, v[0], x + 0.17, 2.06, 1.74, 0.46, { fontSize: i === 2 ? 26.5 : 30.5, color: C.ink, bold: true, align: 'center' });
    addText(slide, v[1], x + 0.20, 2.72, 1.68, 0.44, { fontSize: 13.1, color: C.ink, bold: true, align: 'center', valign: 'top' });
    addText(slide, v[2], x + 0.12, 3.42, 1.84, 0.20, { fontSize: 9.7, color: C.muted, align: 'center' });
  });
  rect(slide, 0.55, 4.28, 8.90, 0.47, C.tealPale, C.tealPale, false);
  addText(slide, '数据说明：前 3 项来自 2026 年 7 月 11 日的 DeepSeek（deepseek-v4-pro）真实模型对照；第 4 项来自 2026 年 7 月 15 日当前代码回归验证。', 0.77, 4.40, 8.46, 0.21, { fontSize: 10.8, color: C.deep, bold: true, align: 'center' });
}

// 16. Closing
{
  const slide = pptx.addSlide();
  addDarkBase(slide, 16, '总结');
  addText(slide, '形成可落地的景区智能导览服务方案', 0.62, 0.63, 7.70, 0.46, { fontSize: 30, color: C.white, bold: true });
  addText(slide, '让“会说话”的数字人，成为一项有依据、能衔接、可维护的景区服务能力。', 0.65, 1.23, 7.55, 0.30, { fontSize: 16, color: 'D5E7E1' });
  const end = [
    ['可信', '资料来源与可靠状态可见', C.gold],
    ['连贯', '讲解、问路、演出与服务连续衔接', C.teal],
    ['可维护', '反馈与低置信度记录进入治理闭环', C.gold],
    ['可扩展', '模型、数字人与服务能力接口化', C.teal],
  ];
  end.forEach((v, i) => {
    const x = 0.65 + (i % 2) * 3.55;
    const y = 2.05 + Math.floor(i / 2) * 1.23;
    rect(slide, x, y, 3.16, 0.90, i === 1 ? '17635D' : '165B55', '4D897F', false);
    circle(slide, x + 0.22, y + 0.23, 0.42, v[2], v[2]);
    addText(slide, v[0], x + 0.82, y + 0.17, 1.78, 0.23, { fontSize: 18.2, color: C.white, bold: true });
    addText(slide, v[1], x + 0.82, y + 0.48, 2.04, 0.20, { fontSize: 11.1, color: 'D8E8E3' });
  });
  rect(slide, 8.05, 1.86, 1.34, 2.55, 'EAF0EB', '5D8D83', false);
  slide.addImage(contain(assets.home, 8.12, 1.93, 1.20, 2.39));
  addText(slide, '灵山胜境\n景区导览 AI 数字人', 7.55, 4.58, 2.25, 0.40, { fontSize: 11.2, color: C.goldPale, bold: true, align: 'center' });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
pptx.writeFile({ fileName: OUT });
console.log(`Created ${OUT}`);
