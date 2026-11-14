import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardRoute, dashboardPath } from '../src/routes.ts';

test('dashboard routes support direct links and reject unrelated paths', () => {
  assert.equal(dashboardRoute('/dashboard'), 'overview');
  assert.equal(dashboardRoute('/dashboard/news/'), 'news');
  assert.equal(dashboardRoute('/dashboard/wallets'), 'wallets');
  assert.equal(dashboardRoute('/dashboard/unknown'), null);
  assert.equal(dashboardRoute('/'), null);
  assert.equal(dashboardPath('trades'), '/dashboard/trades');
});
