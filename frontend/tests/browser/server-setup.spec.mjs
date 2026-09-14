import { test, expect } from '@playwright/test';

const profile = (host) => ({version:1,serverUrl:`https://${host}`,apiUrl:`https://${host}/api/v1`,incomeApiUrl:`https://${host}/api/v1`,turnstileEnabled:false,ssoEnabled:false});
const mockHealth = (page, host, status = 'ok') => page.route(`https://${host}/health`, (route) => route.fulfill({ json: { status }, headers: { 'access-control-allow-origin': '*' } }));

test('first launch sends no API requests before server selection; successful setup persists and opens login', async ({page}) => {
  const external = [];
  page.on('request', (request) => { if (request.url().startsWith('https://')) external.push(request); });
  await mockHealth(page, 'finance.example.com');
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'Hubungkan ke server'})).toBeVisible();
  expect(external).toHaveLength(0);
  await page.getByLabel('Alamat server', {exact:true}).fill('finance.example.com/api/v1/');
  await page.getByRole('button', {name:'Hubungkan & lanjutkan'}).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Server: finance.example.com · Ubah')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('finance.server.v1')).apiUrl)).toBe('https://finance.example.com/api/v1');
  expect(external.every((request) => new URL(request.url()).host === 'finance.example.com')).toBe(true);
  expect(external.every((request) => !request.headers().authorization)).toBe(true);
  await page.reload();
  await expect(page.getByText('Server: finance.example.com · Ubah')).toBeVisible();
  await page.screenshot({path:'test-results/server-login.png', fullPage:true});
});

test('unhealthy server preserves old configuration and session; successful switch clears session', async ({page}) => {
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('finance.server.v1', JSON.stringify(saved));
      localStorage.setItem('token','old-session');
      localStorage.setItem('username','old-user');
      localStorage.setItem('seeded','true');
    }
  }, profile('old.example.com'));
  await mockHealth(page,'new.example.com','down');
  await page.goto('/server');
  await page.getByLabel('Alamat server', {exact:true}).fill('https://new.example.com');
  await page.getByRole('button', {name:'Hubungkan & lanjutkan'}).click();
  await expect(page.getByRole('alert')).toContainText('Server belum dapat dihubungi');
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('old-session');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('finance.server.v1')).serverUrl)).toBe('https://old.example.com');
  await page.unroute('https://new.example.com/health');
  await mockHealth(page,'new.example.com');
  await page.getByRole('button', {name:'Hubungkan & lanjutkan'}).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('username'))).toBeNull();
});

test('blocks insecure addresses and accepts an explicitly configured separate income server', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Alamat server', {exact:true}).fill('http://finance.example.com');
  await page.getByRole('button', {name:'Hubungkan & lanjutkan'}).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS');
  await page.getByLabel('Alamat server', {exact:true}).fill('https://finance.example.com');
  await page.getByText('Pengaturan lanjutan').click();
  await mockHealth(page, 'finance.example.com');
  await page.getByLabel('Alamat API pendapatan', {exact:true}).fill('https://income.example.com:8443/api/v1');
  await page.getByRole('button', {name:'Hubungkan & lanjutkan'}).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('finance.server.v1')).incomeApiUrl)).toBe('https://income.example.com:8443/api/v1');
});

test('income requests use configured path and never retry built-in fallback', async ({page}) => {
  await page.addInitScript((saved) => {
    localStorage.setItem('finance.server.v1', JSON.stringify(saved));
    localStorage.setItem('token','selected-server-token');
    localStorage.setItem('username','income-user');
  }, {...profile('chosen.example.com'),incomeApiUrl:'https://chosen.example.com/reports'});
  await mockHealth(page,'chosen.example.com');
  const requests = [];
  await page.route('https://chosen.example.com/reports/**', async (route) => {
    requests.push({url:route.request().url(),auth:route.request().headers().authorization});
    await route.fulfill({status:503,json:{detail:'Unavailable'},headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/income');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((r) => r.auth === 'Token selected-server-token')).toBe(true);
  expect(requests.every((r) => r.url.startsWith('https://chosen.example.com/reports/'))).toBe(true);
});

test('401 expires the session but preserves selected server and returns to its login', async ({page}) => {
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('finance.server.v1', JSON.stringify(saved));
      localStorage.setItem('token','expired-token');
      localStorage.setItem('seeded','true');
    }
  }, profile('session.example.com'));
  await mockHealth(page,'session.example.com');
  await page.route('https://session.example.com/api/v1/**', (route) => route.fulfill({status:401,json:{message:'Sesi tidak valid.'},headers:{'access-control-allow-origin':'*'}}));
  await page.goto('/income');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Server: session.example.com · Ubah')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('finance.server.v1')).serverUrl)).toBe('https://session.example.com');
});

test('production defaults preserve the four distinct configured hosts', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Gunakan konfigurasi production'}).click();
  await expect(page.getByLabel('Alamat server',{exact:true})).toHaveValue('https://api-finance.asas.id');
  await page.getByText('Pengaturan lanjutan').click();
  await expect(page.getByLabel('Alamat API pendapatan',{exact:true})).toHaveValue('https://api-income.asas.id/api/v1');
  await expect(page.getByLabel('API utama cadangan',{exact:true})).toHaveValue('https://finance.asas.id/api/v1');
  await expect(page.getByLabel('API pendapatan cadangan',{exact:true})).toHaveValue('https://invoice.asas.id/api/v1');
});

test('setup and startup use configured fallback after primary DNS failure', async ({page}) => {
  const apiRequests=[];
  await page.route('https://primary.example.com/health', (route)=>route.abort('namenotresolved'));
  await mockHealth(page,'backup.example.com');
  await page.route('https://backup.example.com/api/v1/**', (route)=>{apiRequests.push(route.request().url());return route.fulfill({json:{count:0,next:null,results:[]}});});
  await page.goto('/');
  await page.getByLabel('Alamat server',{exact:true}).fill('https://primary.example.com');
  await page.getByText('Pengaturan lanjutan').click();
  await page.getByLabel('API utama cadangan',{exact:true}).fill('https://backup.example.com/api/v1');
  await page.getByLabel('Health check cadangan',{exact:true}).fill('https://backup.example.com/health');
  await page.getByRole('button',{name:'Hubungkan & lanjutkan'}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(()=>{
    localStorage.setItem('token','test-session');
    localStorage.setItem('username','fallback-user');
  });
  await page.goto('/');
  await expect.poll(()=>apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every(url=>url.startsWith('https://backup.example.com/api/v1/'))).toBe(true);
});

test('configured income fallback receives the request after primary failure', async ({page}) => {
  await page.addInitScript((saved)=>{
    localStorage.setItem('finance.server.v1',JSON.stringify(saved));
    localStorage.setItem('token','test-session');
    localStorage.setItem('username','fallback-user');
  },{...profile('main.example.com'),incomeApiUrl:'https://income.example.com/api/v1',incomeFallbackApiUrl:'https://invoice.example.com/api/v1'});
  await mockHealth(page,'main.example.com');
  await page.route('https://income.example.com/api/v1/**',(route)=>route.fulfill({status:503,json:{detail:'Unavailable'}}));
  const fallback=[];
  await page.route('https://invoice.example.com/api/v1/**',(route)=>{fallback.push(route.request().headers().authorization);return route.fulfill({json:{results:[],count:0}});});
  await page.goto('/income');
  await expect.poll(()=>fallback.length).toBeGreaterThan(0);
  expect(fallback.every(token=>token==='Token test-session')).toBe(true);
});

test('failed connection names each attempted endpoint and HTTP error', async ({page})=>{
  await page.route('https://blocked.example.com/health',(route)=>route.fulfill({status:403,json:{cloudflare_error:true}}));
  await page.goto('/');
  await page.getByLabel('Alamat server',{exact:true}).fill('https://blocked.example.com');
  await page.getByRole('button',{name:'Hubungkan & lanjutkan'}).click();
  await expect(page.getByRole('alert')).toContainText('https://blocked.example.com/health');
  await expect(page.getByRole('alert')).toContainText('HTTP 403');
  await expect(page.getByRole('alert')).toContainText('Cloudflare');
  expect(await page.evaluate(()=>localStorage.getItem('finance.server.v1'))).toBeNull();
});
