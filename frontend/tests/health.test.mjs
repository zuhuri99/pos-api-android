import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHealth, selectHealthyEndpoint, healthTransport } from '../src/platform/health.js';

test('native health requests use native HTTP and retain Cloudflare failure details', async (t) => {
  t.mock.method(healthTransport, 'isNative', () => true);
  const get = t.mock.method(healthTransport, 'get', async () => ({status:403,data:{cloudflare_error:true},headers:{},url:'https://example.com/health'}));
  const fetch = t.mock.method(globalThis, 'fetch', () => {throw new Error('WebView fetch must not be used');});
  const result = await probeHealth('https://example.com/health');
  assert.equal(result.ok,false);
  assert.match(result.message,/HTTP 403.*Cloudflare/);
  assert.equal(fetch.mock.callCount(),0);
  assert.equal(get.mock.calls[0].arguments[0].headers.Authorization,undefined);
  assert.equal(get.mock.calls[0].arguments[0].connectTimeout,8000);
});
test('native DNS and TLS errors are actionable', async (t) => {
  t.mock.method(healthTransport, 'isNative', () => true);
  const get = t.mock.method(healthTransport, 'get', async () => {throw new Error('Unable to resolve host');});
  assert.match((await probeHealth('https://example.com/health')).message,/DNS/);
  get.mock.mockImplementation(async () => {throw new Error('SSLHandshakeException');});
  assert.match((await probeHealth('https://example.com/health')).message,/Sertifikat/);
});
test('web health accepts JSON, rejects HTML, and supports ordinary endpoint redirects', async (t) => {
  t.mock.method(healthTransport, 'isNative', () => false);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({status:'ok'}),{status:200}));
  assert.equal((await probeHealth('https://example.com/health')).ok,true);
  assert.notEqual(fetch.mock.calls[0].arguments[1].redirect,'error');
  fetch.mock.mockImplementation(async () => new Response('<html>Sign in</html>',{status:200}));
  assert.match((await probeHealth('https://example.com/health')).message,/Respons health check/);
});
test('failed primary health selects paired fallback API and stops there', async () => {
  const calls=[];
  const endpoints=[{apiUrl:'https://primary/api/v1',healthUrl:'https://primary/health'},{apiUrl:'https://backup/api/v1',healthUrl:'https://backup/health'}];
  const result=await selectHealthyEndpoint(endpoints,async(url)=>{calls.push(url);return {url,ok:url.includes('backup'),message:'DNS'};});
  assert.equal(result.endpoint.apiUrl,'https://backup/api/v1');
  assert.deepEqual(calls,endpoints.map(e=>e.healthUrl));
  assert.equal(result.checks.length,2);
});
