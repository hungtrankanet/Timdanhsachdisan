import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function snap() {
  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800 });
  
  console.log('Navigating to chat.zalo.me...');
  await page.goto('https://chat.zalo.me', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  
  const snapPath = join(__dirname, 'public/zalo_screenshot.png');
  console.log(`Taking screenshot, saving to: ${snapPath}`);
  await page.screenshot({ path: snapPath });
  
  console.log('Screenshot saved!');
  await browser.close();
}

snap().catch(console.error);
