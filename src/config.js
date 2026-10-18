import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load KEY=VALUE pairs from a .env file into process.env without overriding
 * variables that are already set. Node >= 20.12 ships process.loadEnvFile;
 * a tiny parser covers older runtimes.
 */
export function loadEnv(file = path.join(PROJECT_ROOT, '.env')) {
  if (!fs.existsSync(file)) return false;
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(file);
      return true;
    } catch {
      /* fall through to the manual parser */
    }
  }
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
  return true;
}

const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value));
};

const asInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Build the runtime configuration from .env, the environment and explicit overrides
 * (overrides win, then environment variables, then defaults).
 */
export function getConfig(overrides = {}) {
  loadEnv();
  const env = process.env;
  const pick = (key, envName, fallback) => (overrides[key] !== undefined ? overrides[key] : (env[envName] ?? fallback));

  const proxy = pick('proxy', 'IG_PROXY', env.HTTPS_PROXY ?? env.https_proxy ?? null);

  return {
    device: pick('device', 'IG_DEVICE', 'iPhone 13'),
    headless: overrides.headless !== undefined ? Boolean(overrides.headless) : asBool(env.IG_HEADLESS, true),
    proxy: proxy && String(proxy).toLowerCase() !== 'none' ? String(proxy) : null,
    locale: pick('locale', 'IG_LOCALE', 'en-US'),
    timezone: pick('timezone', 'IG_TIMEZONE', 'America/New_York'),
    sessionFile: path.resolve(PROJECT_ROOT, pick('sessionFile', 'IG_SESSION_FILE', '.session/state.json')),
    username: pick('username', 'IG_USERNAME', ''),
    password: pick('password', 'IG_PASSWORD', ''),
    twoFactorCode: pick('twoFactorCode', 'IG_TOTP_CODE', '') || undefined,
    timeoutMs: asInt(pick('timeoutMs', 'IG_TIMEOUT_MS', 45000), 45000),
    uploadTimeoutMs: asInt(pick('uploadTimeoutMs', 'IG_UPLOAD_TIMEOUT_MS', 120000), 120000),
    slowMo: asInt(pick('slowMo', 'IG_SLOWMO_MS', 0), 0),
    executablePath: pick('executablePath', 'IG_CHROMIUM_PATH', '') || undefined,
    debug: overrides.debug !== undefined ? Boolean(overrides.debug) : asBool(env.IG_DEBUG, false),
    debugDir: path.resolve(PROJECT_ROOT, pick('debugDir', 'IG_DEBUG_DIR', 'debug')),
    verbose: overrides.verbose !== undefined ? Boolean(overrides.verbose) : asBool(env.IG_VERBOSE, true),
    logger: overrides.logger,
    root: PROJECT_ROOT,
  };
}
