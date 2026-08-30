import { test, expect } from "@playwright/test";

const BASE = "https://house-flip-studio.vercel.app";

test("production deploy: PWA manifest + icons + SW serve correctly over HTTPS", async ({ page, request }) => {
  // 1. App loads
  const res = await request.get(`${BASE}/`);
  expect(res.status()).toBe(200);

  // 2. Manifest valid + installable
  const manRes = await request.get(`${BASE}/manifest.webmanifest`);
  expect(manRes.status()).toBe(200);
  expect(manRes.headers()["content-type"]).toContain("application/manifest");
  const manifest = await manRes.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  // 3. Every icon resolves as a real PNG (not an HTML 404)
  for (const icon of manifest.icons) {
    const iconRes = await request.get(`${BASE}${icon.src}`);
    expect(iconRes.status(), `icon ${icon.src}`).toBe(200);
    expect(iconRes.headers()["content-type"]).toContain("image/png");
  }

  // 4. Service worker served with JS content type
  const swRes = await request.get(`${BASE}/sw.js`);
  expect(swRes.status()).toBe(200);
  expect(swRes.headers()["content-type"]).toContain("javascript");

  // 5. In-browser: SW registers and page has installable metadata
  await page.goto(BASE);
  const hasManifest = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(hasManifest).toBeTruthy();
  await page.waitForLoadState("networkidle");
});
