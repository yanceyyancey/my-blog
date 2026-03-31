const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));
  
  await page.goto('http://localhost:3000/reading');
  await page.waitForTimeout(1500);
  
  if (await page.$('input[type="password"]')) {
      await page.fill('input[type="password"]', 'yancey');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
  }
  
  await page.click('button:has-text("地球")');
  await page.waitForTimeout(6000); // 留足时间加载纹理

  // Drag the globe to see different countries
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(200, 400);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '/Users/yangxi/.gemini/antigravity/brain/fcb5347d-12cc-4d5e-9091-0d44e58c793a/pop_art_globe_verify_script.png' });
  
  await browser.close();
  console.log('Done');
})();
