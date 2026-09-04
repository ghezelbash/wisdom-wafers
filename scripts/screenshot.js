const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  console.log('Navigating to app explore...');
  // Since we use expo router, we can navigate directly to /explore
  await page.goto('http://localhost:8081/explore', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-explore.png') });
  
  await browser.close();
  console.log('Done!');
})();
