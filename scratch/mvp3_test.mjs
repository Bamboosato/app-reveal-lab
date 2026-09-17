const jsonRes = await fetch('http://localhost:9222/json');
const pages = await jsonRes.json();
const targetPage = pages.find(p => p.url.includes(':5173'));

if (!targetPage) {
  console.error('Target page not found');
  process.exit(1);
}

const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

let id = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const reqId = id++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === reqId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });
}

ws.addEventListener('open', async () => {
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('--- Step 1: Reload Page to load MVP-3 ---');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2500));

  console.log('--- Step 2: Check Service Worker Registration ---');
  const swRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (!('serviceWorker' in navigator)) return 'No SW support';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active } : 'No active registration yet';
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Service Worker status:', swRes.result.value);

  console.log('--- Step 3: Open Preset Modal ---');
  const openPresetRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('btn-open-preset');
      if (!btn) return 'Error: btn-open-preset not found';
      btn.click();
      return 'Clicked btn-open-preset';
    })()`,
    returnByValue: true
  });
  console.log(openPresetRes.result.value);
  await new Promise(r => setTimeout(r, 600));

  console.log('--- Step 4: Verify Preset Modal & Apply Cinematic Scan ---');
  const applyRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.getElementById('preset-modal-title')?.textContent;
      const allDivs = Array.from(document.querySelectorAll('div'));
      const card = allDivs.find(d => d.textContent.includes('シネマティック・スキャン'));
      if (!card) return { error: 'Cinematic card not found' };
      const applyBtn = card.querySelector('button:last-child');
      if (applyBtn) {
        applyBtn.click();
        return { success: true, title, applied: 'Cinematic Scan' };
      }
      return { error: 'Apply button not found' };
    })()`,
    returnByValue: true
  });
  console.log('Apply Preset Result:', applyRes.result.value);
  await new Promise(r => setTimeout(r, 600));

  console.log('--- Step 5: Save as Custom Preset to IndexedDB ---');
  // 再びモーダルを開いて保存
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-open-preset')?.click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  const saveRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      if (inputs.length < 2) return { error: 'Inputs not found' };
      inputs[0].value = 'Pixel 10a 特製プリセット';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '実機テスト用カスタム設定';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));

      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('保存'));
      if (saveBtn) {
        saveBtn.click();
        return { success: true };
      }
      return { error: 'Save button not found' };
    })()`,
    returnByValue: true
  });
  console.log('Save Custom Preset:', saveRes.result.value);
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- Step 6: Verify My Presets tab ---');
  const listRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const body = document.body.innerText;
      const hasSaved = body.includes('Pixel 10a 特製プリセット');
      return { hasSaved };
    })()`,
    returnByValue: true
  });
  console.log('Custom Preset in list:', listRes.result.value);

  console.log('--- Step 7: Test Keyboard Shortcut (Space for Play/Pause) ---');
  // モーダルを閉じる
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '✕');
      if (closeBtn) closeBtn.click();
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // Spaceキーイベント発火
  const keyRes = await send('Runtime.evaluate', {
    expression: `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      return 'Dispatched Space';
    })()`,
    returnByValue: true
  });
  console.log(keyRes.result.value);
  await new Promise(r => setTimeout(r, 1000));

  // 再生状態確認
  const playCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const pauseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('一時停止'));
      return { isPlayingNow: !!pauseBtn };
    })()`,
    returnByValue: true
  });
  console.log('Playback after Space key:', playCheck.result.value);

  // 再びSpaceキーで一時停止
  await send('Runtime.evaluate', {
    expression: `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    })()`,
    returnByValue: true
  });

  console.log('--- Step 8: Reopen Preset Modal for Screenshot ---');
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-open-preset')?.click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('MVP-3 automated verification on Pixel 10a complete!');
  ws.close();
});
