const jsonRes = await fetch('http://localhost:9222/json');
const pages = await jsonRes.json();
const targetPage = pages.find(p => p.url.includes(':5173'));

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
  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('--- Step 1: Emulate OFFLINE Network (Airplane Mode) ---');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });

  console.log('--- Step 2: Reload under 100% Offline condition ---');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- Step 3: Check if page loaded from Service Worker Cache ---');
  const titleRes = await send('Runtime.evaluate', {
    expression: `document.title`,
    returnByValue: true
  });
  console.log('Page Title in Offline mode:', titleRes.result.value);

  const canvasRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      return { hasCanvas: !!canvas, width: canvas?.width, height: canvas?.height };
    })()`,
    returnByValue: true
  });
  console.log('Canvas in Offline mode:', canvasRes.result.value);

  // オフライン状態を解除
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  console.log('Offline test complete!');
  ws.close();
});
