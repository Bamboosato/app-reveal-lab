import { mount } from 'svelte';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';

// PWA Service Worker 自動登録
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New content available, please refresh.');
  },
  onOfflineReady() {
    console.log('App ready to work offline.');
  },
});

const appElement = document.getElementById('app');

if (appElement) {
  mount(App, {
    target: appElement,
  });
}
