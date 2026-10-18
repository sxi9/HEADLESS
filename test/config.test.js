import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getConfig, PROJECT_ROOT } from '../src/config.js';

test('getConfig applies defaults and overrides', () => {
  const saved = { ...process.env };
  try {
    delete process.env.IG_DEVICE;
    delete process.env.IG_PROXY;
    process.env.HTTPS_PROXY = 'http://proxy.local:3128';
    process.env.IG_HEADLESS = 'false';

    const config = getConfig({ timeoutMs: '1234' });
    assert.equal(config.device, 'iPhone 13');
    assert.equal(config.headless, false);
    assert.equal(config.proxy, 'http://proxy.local:3128');
    assert.equal(config.timeoutMs, 1234);
    assert.equal(config.sessionFile, path.join(PROJECT_ROOT, '.session', 'state.json'));

    const overridden = getConfig({ device: 'Pixel 7', headless: true, proxy: 'none' });
    assert.equal(overridden.device, 'Pixel 7');
    assert.equal(overridden.headless, true);
    assert.equal(overridden.proxy, null);
  } finally {
    process.env = saved;
  }
});
