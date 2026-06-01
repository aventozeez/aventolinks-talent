import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlFile = process.argv[2] || 'grand-finale-poster.html';
const outFile  = process.argv[3] || htmlFile.replace('.html', '.png');

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

const filePath = path.join(__dirname, 'public', htmlFile);
const fileUrl  = 'file:///' + filePath.split(path.sep).join('/');
await page.goto(fileUrl, { waitUntil: 'networkidle0' });

await new Promise(r => setTimeout(r, 1200));

const poster = await page.$('.poster');
const box    = await poster.boundingBox();

const outPath = path.join(__dirname, 'public', outFile);
await page.screenshot({
  path: outPath,
  clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 }
});

await browser.close();
console.log('Saved to:', outPath);
