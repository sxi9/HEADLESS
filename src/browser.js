import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { BadInputError } from './errors.js';

/** Names of every portrait phone/tablet preset Playwright ships. */
export function listPhoneDevices() {
  return Object.keys(devices).filter((name) => devices[name].isMobile && !/landscape/i.test(name));
}

export function resolveDevice(name) {
  const device = devices[name];
  if (!device) {
    throw new BadInputError(
      `Unknown device preset "${name}". Run \`ig devices\` for the list; examples: ${listPhoneDevices().slice(0, 6).join(', ')}.`,
    );
  }
  return device;
}

/**
 * Launch Chromium (headless by default) with a phone emulated: viewport, device
 * scale factor, touch, mobile user agent. Restores a saved session when present.
 */
export async function launchPhoneBrowser(config) {
  const device = resolveDevice(config.device);

  const launchOptions = {
    headless: config.headless,
    slowMo: config.slowMo || 0,
  };
  if (config.proxy) launchOptions.proxy = { server: config.proxy };
  if (config.executablePath) launchOptions.executablePath = config.executablePath;

  const browser = await chromium.launch(launchOptions);

  const contextOptions = {
    ...device,
    locale: config.locale,
    timezoneId: config.timezone,
    colorScheme: 'light',
    acceptDownloads: false,
  };
  if (config.sessionFile && fs.existsSync(config.sessionFile)) {
    contextOptions.storageState = config.sessionFile;
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(config.timeoutMs);
  context.setDefaultNavigationTimeout(Math.max(config.timeoutMs, 60000));

  const page = await context.newPage();
  return { browser, context, page, device };
}

/** Persist cookies + storage so the next run starts logged in. */
export async function saveSession(context, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await context.storageState({ path: file });
  return file;
}
