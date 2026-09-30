const { test, expect } = require('@playwright/test');

test('health check reports ok', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test('unknown routes return 404 JSON', async ({ request }) => {
  const res = await request.get('/does-not-exist');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'Not found' });
});
