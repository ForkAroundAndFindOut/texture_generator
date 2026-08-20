import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

export function AppBootstrap() {
  return <App />;
}

function getRootElement(): HTMLElement {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Texture Lab mount element #root is missing');
  }
  return root;
}

function mountTextureLab(root: HTMLElement = getRootElement()): void {
  createRoot(root).render(createElement(StrictMode, null, <AppBootstrap />));
}

mountTextureLab();
