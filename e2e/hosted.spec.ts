import { test, expect } from "@playwright/test";

// Smoke test against the HOSTED Supabase project (ngapchaxevbrfhfyscgx).
// Proves the full stack works end-to-end on the real backend, not just local.
const HOSTED_URL = "https://ngapchaxevbrfhfyscgx.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nYXBjaGF4ZXZicmZoZnlzY2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTIwNzAsImV4cCI6MjEwMzYyODA3MH0.5oanNXDKyv3-iFLcmsl5ESeI8Ul0piNDU8tx0lOEuXg";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nYXBjaGF4ZXZicmZoZnlzY2d4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODA1MjA3MCwiZXhwIjoyMTAzNjI4MDcwfQ.1X09RGWi6-8O_7-62L8wANvQtyVH4jjgxC7jMC0tGsw";

test.describe.serial("Hosted Supabase smoke", () => {
  const createdDealId: string[] = [];
  const createdUserId: string[] = [];

  test.afterAll(async () => {
    // Self-cleanup only — never wipe the whole project.
    const h = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
    if (createdDealId.length) {
      await fetch(`${HOSTED_URL}/rest/v1/deals?id=eq.${createdDealId[0]}`, { method: "DELETE", headers: h }).catch(() => {});
    }
    if (createdUserId.length) {
      await fetch(`${HOSTED_URL}/auth/v1/admin/users/${createdUserId[0]}`, { method: "DELETE", headers: h }).catch(() => {});
    }
  });

  test("sign up via hosted auth, then app creates a deal through the Next.js API route", async ({ page }) => {
    // 1. Create a user via hosted auth admin API
    const h = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
    const stamp = Date.now();
    const email = `hosted_${stamp}@test.local`;
    const ures = await fetch(`${HOSTED_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ email, password: "testpass123", email_confirm: true, user_metadata: { display_name: "Hosted Tester" } }),
    });
    expect([200, 201]).toContain(ures.status);
    const newUser = await ures.json();
    createdUserId.push(newUser.id);
    console.log("created hosted user:", email);

    // 3. Sign in through the UI (against hosted auth)
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();

    // 4. Create a deal through the app's API route (uses hosted Supabase via .env.local)
    const res = await page.request.post("/api/deals", {
      data: { address: "Hosted Test Street", city: "Charlotte", state: "NC", asking_price: 210000, source: "manual" },
    });
    expect(res.status()).toBe(201);
    const { deal } = await res.json();
    expect(deal.address).toBe("Hosted Test Street");
    createdDealId.push(deal.id);
    console.log("deal created on hosted DB:", deal.id);

    // 5. Confirm the org trigger assigned an org
    const profile = await fetch(`${HOSTED_URL}/rest/v1/profiles?select=id,org_id,display_name`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    const profiles = await profile.json();
    const testProfile = profiles.find((p) => p.display_name === "Hosted Tester");
    expect(testProfile?.org_id).toBeTruthy();
    console.log("profile org assigned:", testProfile?.org_id);
  });
});
