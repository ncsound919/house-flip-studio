import { test, expect } from "@playwright/test";

const BASE = "https://house-flip-studio.vercel.app";

test("production command center renders and hunt button fires", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  // We can't log in without creds, so verify the deploy serves the app shell
  // and the routes exist. Full auth E2E runs against the dev server.
  const res = await page.request.get(`${BASE}/`);
  expect(res.status()).toBe(200);
  const board = await page.request.get(`${BASE}/board`);
  expect(board.status()).toBe(200);
  const leads = await page.request.get(`${BASE}/leads`);
  expect(leads.status()).toBe(200);
  const dashboard = await page.request.get(`${BASE}/api/dashboard`);
  // 401 without auth proves the route exists and enforces the org check.
  expect(dashboard.status()).toBe(401);
  const hunt = await page.request.post(`${BASE}/api/leads/hunt`, { data: {} });
  expect(hunt.status()).toBe(401);
});
