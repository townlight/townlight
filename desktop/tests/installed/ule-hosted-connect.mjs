import { chromium } from '@playwright/test';

export async function connectUleDesktop() {
  const deadline = Date.now() + 120000;
  for (;;) {
    try {
      return await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 5000 });
    } catch {
      if (Date.now() >= deadline) {
        throw new Error('Owned installed WebView did not reopen');
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}