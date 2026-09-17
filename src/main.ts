import { mount } from 'svelte';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';

// PWA Service Worker 自動登録 & 更新イベントディスパッチ
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('pwa-need-refresh', {
        detail: {
          updateSW: (reloadPage?: boolean) => updateSW(reloadPage),
        },
      })
    );
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
  },
});

const appElement = document.getElementById('app');

if (appElement) {
  mount(App, {
    target: appElement,
  });
}
