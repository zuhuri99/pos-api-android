import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerProfile, normalizeUrl, readServerProfile, saveServerProfile, environmentServerProfile, profileEndpoints } from '../src/config/serverProfile.js';
import { buildSsoLoginUrl, MOBILE_AUTH_CALLBACK } from '../src/platform/native.js';

test('normalizes server addresses and accepts pasted API base without duplicating paths', () => {
  for (const input of ['finance.example.com/', ' https://finance.example.com ', 'https://finance.example.com/api/v1/']) {
    const profile = createServerProfile({ serverUrl: input });
    assert.equal(profile.serverUrl, 'https://finance.example.com');
    assert.equal(profile.apiUrl, 'https://finance.example.com/api/v1');
    assert.equal(profile.incomeApiUrl, profile.apiUrl);
    assert.equal(profile.healthUrl, 'https://finance.example.com/health');
  }
});
test('preserves installation subpaths and custom same-origin income API', () => {
  const profile = createServerProfile({ serverUrl: 'https://example.com/finance/', incomeApiUrl: 'https://example.com/reports' });
  assert.equal(profile.healthUrl, 'https://example.com/finance/health');
  assert.equal(profile.apiUrl, 'https://example.com/finance/api/v1');
  assert.equal(profile.incomeApiUrl, 'https://example.com/reports');
});
test('rejects insecure protocols, credentials and URL parameters', () => {
  for (const value of ['', 'http://example.com', 'file:///tmp/api', 'javascript://alert', 'https://user:pass@example.com', 'https://example.com/?token=x', 'https://example.com/#x']) {
    assert.throws(() => normalizeUrl(value), Error, value);
  }
});
test('accepts explicitly configured API domains and ports with paired fallbacks', () => {
  const profile = createServerProfile({ serverUrl: 'https://main.example.com', apiUrl: 'https://api.example.com:8443/api/v1', incomeApiUrl: 'https://income.example.com/api/v1', healthUrl: 'https://health.example.com/status', fallbackApiUrl: 'https://backup.example.com/api/v1', fallbackHealthUrl: 'https://backup.example.com/health', incomeFallbackApiUrl: 'https://invoice.example.com/api/v1' });
  assert.equal(profile.incomeApiUrl, 'https://income.example.com/api/v1');
  assert.equal(profile.healthUrl, 'https://health.example.com/status');
  assert.equal(profileEndpoints(profile)[1].apiUrl, 'https://backup.example.com/api/v1');
  assert.equal(profile.incomeFallbackApiUrl, 'https://invoice.example.com/api/v1');
  assert.throws(() => createServerProfile({serverUrl:'main.example.com',fallbackApiUrl:'https://backup.example.com/api/v1'}), /diisi bersama/);
});
test('production public endpoints populate defaults without including secrets', () => {
  const profile = environmentServerProfile({ VITE_API_BASE_URL:'https://api-finance.example.com/api/v1', VITE_HEALTH_URL:'https://api-finance.example.com/health', VITE_API_BASE_URL_2:'https://finance.example.com/api/v1', VITE_HEALTH_URL_2:'https://finance.example.com/health', VITE_INCOME_API_BASE:'https://api-income.example.com/api/v1', VITE_INCOME_API_BASE_2:'https://invoice.example.com/api/v1', VITE_INCOME_API_KEY:'private-value' });
  assert.equal(profile.serverUrl, 'https://api-finance.example.com');
  assert.equal(profile.incomeApiUrl, 'https://api-income.example.com/api/v1');
  assert.equal(profile.incomeFallbackApiUrl, 'https://invoice.example.com/api/v1');
  assert.equal(profileEndpoints(profile).length,2);
  assert.ok(!JSON.stringify(profile).includes('private-value'));
});
test('requires a public site key when Turnstile is enabled', () => {
  assert.throws(() => createServerProfile({ serverUrl: 'finance.example.com', turnstileEnabled: true }), /Site key/);
});
test('saves only normalized settings and recovers from corrupt stored configuration', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  saveServerProfile({ serverUrl: 'finance.example.com', token: 'must-not-persist' });
  assert.equal(readServerProfile().apiUrl, 'https://finance.example.com/api/v1');
  assert.ok(!values.get('pos.server.v1').includes('must-not-persist'));
  values.set('pos.server.v1', '{invalid');
  assert.equal(readServerProfile(), null);
  values.set('pos.server.v1', JSON.stringify({version:1,serverUrl:'http://example.com'}));
  assert.equal(readServerProfile(), null);
  delete globalThis.localStorage;
});

test('native SSO login requests the registered Android callback', () => {
  const url = new URL(buildSsoLoginUrl('https://api-finance.asas.id/api/v1/', true));
  assert.equal(url.pathname, '/api/v1/auth/sso/login/');
  assert.equal(url.searchParams.get('app_redirect_uri'), MOBILE_AUTH_CALLBACK);
  assert.equal(new URL(buildSsoLoginUrl('https://api-finance.asas.id/api/v1', false)).search, '');
});
