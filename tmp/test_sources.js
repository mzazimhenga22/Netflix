const puppeteer = require('puppeteer');

const tmdbId = '24428'; 
const url = `https://vidlink.pro/movie/${tmdbId}`;

async function analyzeVidlinkApi() {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  page.on('request', request => {
    const reqUrl = request.url();
    if (reqUrl.includes('/api/b/')) {
      console.log(`\n============== EXACT /api/b/ REQUEST ==============`);
      console.log(`Full URL: ${reqUrl}`);
      console.log(`Method: ${request.method()}`);
      console.log(`===================================================\n`);
    }
  });

  page.on('response', async response => {
    const reqUrl = response.url();
    if (reqUrl.includes('/api/b/')) {
        console.log(`\n[Response from /api/b/ Received]`);
        setTimeout(() => { browser.close(); process.exit(0); }, 500);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
}

analyzeVidlinkApi().catch(console.error);
