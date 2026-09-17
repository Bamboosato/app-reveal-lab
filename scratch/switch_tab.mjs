const jsonRes = await fetch('http://localhost:9222/json');
const pages = await jsonRes.json();
const targetPage = pages.find(p => p.url.includes(':5173'));

const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

ws.onopen = async () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('公式ビルトイン'));
        if (btn) btn.click();
      })()`
    }
  }));
  await new Promise(r => setTimeout(r, 600));
  ws.close();
};
