const { chromium } = require('playwright');
const fs = require('fs');

const batch = JSON.parse(fs.readFileSync('./scripts/batch_5.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const errors = [];
  const total = batch.length;

  for (let i = 0; i < total; i++) {
    const [gameName, appid] = batch[i];
    const url = `https://steamdb.info/app/${appid}/`;

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        console.log(`[${i + 1}/${total}] Checking: ${gameName} (${appid})`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait a bit for dynamic content
        await page.waitForTimeout(2000);

        // Check if we hit a Cloudflare challenge
        const content = await page.content();
        if (content.includes('challenge') || content.includes('Verify you are human') || content.includes('cf-')) {
          console.log(`  -> Cloudflare challenge detected, waiting 5s and retrying...`);
          await page.waitForTimeout(5000);
          retries--;
          continue;
        }

        // Get the page title - SteamDB uses the app name in the title
        const title = await page.title();
        // Also try to get the app name from the page
        let appName = '';
        try {
          appName = await page.$eval('.app-name', el => el.textContent.trim());
        } catch (e) {
          // fallback: try other selectors
          try {
            appName = await page.$eval('h1', el => el.textContent.trim());
          } catch (e2) {
            appName = title;
          }
        }

        const titleLower = title.toLowerCase();
        const appNameLower = appName.toLowerCase();
        const gameNameLower = gameName.toLowerCase();

        // Check if the game name appears in the title or app name
        // Use flexible matching - check if key words from game name appear
        const nameInTitle = titleLower.includes(gameNameLower);
        const nameInApp = appNameLower.includes(gameNameLower);
        const titleInName = gameNameLower.includes(titleLower.replace(' · steamdb', '').replace('steamdb', '').trim().toLowerCase());

        if (!nameInTitle && !nameInApp && !titleInName) {
          // More flexible: check individual significant words
          const words = gameNameLower.split(/\s+/).filter(w => w.length > 2);
          const matchCount = words.filter(w => titleLower.includes(w) || appNameLower.includes(w)).length;
          const matchRatio = matchCount / words.length;

          if (matchRatio < 0.5) {
            const actualName = appName || title.replace(' · SteamDB', '').trim();
            errors.push({ gameName, appid, actual: actualName, url });
            console.log(`  -> MISMATCH! Expected: "${gameName}", Got: "${actualName}"`);
          } else {
            console.log(`  -> OK (partial match: ${matchCount}/${words.length} words)`);
          }
        } else {
          console.log(`  -> OK`);
        }

        success = true;

        // Rate limit: wait 1-2 seconds between requests
        if (i < total - 1) {
          const delay = 1000 + Math.random() * 1000;
          await page.waitForTimeout(delay);
        }
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        retries--;
        if (retries > 0) {
          console.log(`  -> Retrying in 5s... (${retries} attempts left)`);
          await page.waitForTimeout(5000);
        } else {
          errors.push({ gameName, appid, actual: 'ERROR: ' + err.message, url });
        }
      }
    }
  }

  await browser.close();

  console.log('\n========== RESULTS ==========');
  if (errors.length === 0) {
    console.log('批次5: 全部正确');
  } else {
    console.log('错误列表：');
    for (const e of errors) {
      console.log(`- ${e.gameName}: 期望 ${e.gameName}，实际 ${e.actual} (${e.url})`);
    }
  }
})();
