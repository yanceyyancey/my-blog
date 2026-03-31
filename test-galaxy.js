const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => fs.appendFileSync('browser_log.txt', msg.text() + '\n'));
  page.on('pageerror', err => fs.appendFileSync('browser_log.txt', 'ERROR: ' + err.message + '\n'));
  
  try {
      await page.goto('http://localhost:3000/reading', { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      
      const pwd = await page.$('input[type="password"]');
      if (pwd) {
          await page.fill('input[type="password"]', 'yancey');
          await page.click('button[type="submit"]');
          await page.waitForTimeout(3000);
      }
      
      console.log('Waiting for galaxy...');
      await page.waitForTimeout(2000);
      
      // Simulate clicking the first book in GalaxyScene by evaluating
      console.log('Evaluate book click...');
      // We don't have a direct button for clicking a specific book easily from playwright because it's rendering on Canvas, 
      // but we can try to click near the middle or we can emit an event or find a DOM element if it's there.
      // Wait, GalaxyScene uses 3D canvas raycaster. Let's just click the center of the canvas!
      await page.mouse.click(600, 400); 
      
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'after_click.png' });
      console.log('Saved after_click.png');
      
  } catch(e) {
      console.error(e);
  } finally {
      await browser.close();
  }
})();
