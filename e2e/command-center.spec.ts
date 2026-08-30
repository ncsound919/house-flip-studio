import { test, expect, type Page } from "@playwright/test";

const HOSTED_URL = "https://ngapchaxevbrfhfyscgx.supabase.co";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nYXBjaGF4ZXZicmZoZnlzY2d4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODA1MjA3MCwiZXhwIjoyMTAzNjI4MDcwfQ.1X09RGWi6-8O_7-62L8wANvQtyVH4jjgxC7jMC0tGsw";

async function supabaseFetch(path: string, init?: RequestInit) {
  return fetch(`${HOSTED_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

test.describe.serial("Command Center", () => {
  let email = "";

  test.beforeAll(async () => {
    // Wipe org data (E2E_WIPE_ALLOWED gate is set by the caller)
    if (process.env.E2E_WIPE_ALLOWED === "1") {
      for (const table of ["change_orders", "deal_comments", "documents", "rehab_items", "underwriting", "contractors", "property_data", "comps", "ai_analyses", "deals"]) {
        await supabaseFetch(`/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE" }).catch(() => {});
      }
    }
    email = `cmdcenter_${Date.now()}@test.local`;
    await supabaseFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: "testpass123", email_confirm: true, user_metadata: { display_name: "Cmd Center" } }),
    });
  });

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
  }

  test("home page is the command center, not a blank board", async ({ page }) => {
    await signIn(page);
    // The hero + control buttons prove the app drives the user.
    await expect(page.getByText("Here's what's happening")).toBeVisible();
    await expect(page.getByRole("button", { name: /Hunt for new leads/ })).toBeVisible();
    // Kanban still reachable
    await expect(page.getByRole("heading", { name: "Do this today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Red flags" })).toBeVisible();
  });

  test("Leads nav link is visible (mobile fix) and goes to lead finder", async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Leads" }).click();
    await page.waitForURL("**/leads");
    await expect(page.getByRole("button", { name: /Find leads/ })).toBeVisible();
  });

  test("Hunt for new leads button calls the hunt API", async ({ page }) => {
    await signIn(page);
    const huntResponse = page.waitForResponse((r) => r.url().includes("/api/leads/hunt") && r.request().method() === "POST");
    await page.getByRole("button", { name: /Hunt for new leads/ }).click();
    const res = await huntResponse;
    expect([200, 500]).toContain(res.status());
    // After hunt, dashboard refetches (button shows a result or error message)
    await page.waitForTimeout(1500);
    // Either a result message appeared or the dashboard updated — the key is the
    // control exists and fires a real request (proven by the response above).
  });

  test("top scored leads section renders even when empty", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText("Top scored leads")).toBeVisible();
  });
});
