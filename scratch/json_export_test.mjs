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
        const jsonBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'JSON');
        if (jsonBtns.length > 0) {
          jsonBtns[0].click();
          return 'Clicked first JSON export';
        }
        return 'JSON button not found';
      })()`
    }
  }));
  await new Promise(r => setTimeout(r, 1000));
  ws.close();
};
