import { test, expect } from "@playwright/test";

test("PWA manifest + icons resolve and app renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("requestfailed", (r) => errors.push(`failed: ${r.url()}`));

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Manifest link present in head
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();

  // Fetch manifest and validate
  const res = await page.request.get(manifestHref!);
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  // Every icon must resolve
  for (const icon of manifest.icons) {
    const iconRes = await page.request.get(icon.src);
    expect(iconRes.ok(), `icon ${icon.src}`).toBeTruthy();
    expect(iconRes.headers()["content-type"]).toContain("image/png");
  }

  // Service worker served
  const swRes = await page.request.get("/sw.js");
  expect(swRes.ok()).toBeTruthy();

  expect(errors).toEqual([]);
});
