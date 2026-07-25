import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = 'D:/Projects/ai-man/tmp/live-product-screenshots';
const debugUrl = 'http://127.0.0.1:9226/json/list';
const skipQuestion = process.env.SKIP_QUESTION === '1';
await fs.mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForDebugger(timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const pages = await (await fetch(debugUrl)).json();
      const page = pages.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

const ws = new WebSocket(await waitForDebugger());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id);
  if (message.error) job.reject(new Error(`${job.method}: ${message.error.message}`));
  else job.resolve(message.result);
});
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
  return result.result.value;
}
async function waitFor(expression, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await evaluate(expression)) return true;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
async function capture(fileName) {
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, fileName), Buffer.from(result.data, 'base64'));
}
async function clickText(label) {
  return evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim().includes(${JSON.stringify(label)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:5173' });
await waitFor("document.readyState === 'complete' && !!document.querySelector('textarea')");
await evaluate('document.fonts.status');
await sleep(700);
await capture('01-live-visitor-home.png');

if (!skipQuestion) {
  // Trigger the supplied quick question so this capture follows the real React interaction path.
  if (!(await clickText('\u7075\u5c71\u5927\u4f5b\u6709\u4ec0\u4e48\u770b\u70b9\uff1f'))) {
    throw new Error('Quick-question button not found');
  }
  await sleep(250);
  if (!(await clickText('\u5f00\u59cb\u8bb2\u89e3'))) throw new Error('Submit button not found');
  await waitFor("!!document.querySelector('.answer-preview-card .status-chip') || document.body.innerText.includes('\\u56de\\u7b54\\u5931\\u8d25')", 55000);
  await sleep(700);
  await capture('02-live-visitor-answer.png');
}

if (!(await clickText('\u7ba1\u7406\u540e\u53f0'))) throw new Error('Admin button not found');
await waitFor("document.body.innerText.includes('AI \\u5bfc\\u6e38\\u7ba1\\u7406\\u540e\\u53f0')", 20000);
await sleep(900);
await capture('03-live-admin-overview.png');

if (!(await clickText('\u95ee\u7b54\u8d28\u68c0'))) throw new Error('QA tab not found');
await sleep(800);
await capture('04-live-admin-qa.png');

if (!(await clickText('\u77e5\u8bc6\u5e93'))) throw new Error('Knowledge tab not found');
await sleep(800);
await capture('05-live-admin-knowledge.png');

if (!(await clickText('\u6e38\u5ba2\u6d1e\u5bdf'))) throw new Error('Insights tab not found');
await sleep(800);
await capture('06-live-admin-insights.png');

ws.close();
console.log(`Captured live screenshots in ${outDir}`);
