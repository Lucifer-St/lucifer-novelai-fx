// 把 poster.html 导出成图片：node render.js [输出文件] [倍率]
// 需要 Playwright（npm i -D playwright 或全局安装后设置 NODE_PATH）。
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, 'poster.jpg'));
  const scale = Number(process.argv[3] || 2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(path.join(__dirname, 'poster.html')).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const jpeg = /\.jpe?g$/i.test(out);
  await page.screenshot({ path: out, fullPage: true, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 90 : undefined });
  await browser.close();
  console.log(out);
})();
