import { test, expect, type Page } from "@playwright/test";

// Local dev Supabase credentials come from the environment (see .env.local).
// Never hardcode real keys. These default to the standard `supabase start`
// demo values so `npx playwright test` works out of the box against a local
// stack with no extra config.
const supabase = {
  url:
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:54321",
  anon:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  serviceRole:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

async function supabaseRequest(path: string, body: unknown, token: string, method = "POST") {
  const res = await fetch(`${supabase.url}${path}`, {
    method,
    headers: {
      apikey: supabase.serviceRole,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  return res.json();
}

// Sign up a user via the service role (no email confirmation needed locally).
async function createUser(email: string, password: string, displayName: string) {
  const data = await supabaseRequest(
    "/auth/v1/admin/users",
    { email, password, email_confirm: true, user_metadata: { display_name: displayName } },
    supabase.serviceRole
  );
  return data.id;
}

// Clean up a deal created during tests (by org).
async function cleanup() {
  const headers = { apikey: supabase.serviceRole, Authorization: `Bearer ${supabase.serviceRole}` };
  await fetch(`${supabase.url}/rest/v1/deals?select=id`, { headers });
}

// The profile trigger assigns every new user to the same (first) org, so test
// runs share one org. Wipe all app tables before a run for a clean slate.
//
// This is DESTRUCTIVE. Only runs when E2E_WIPE_ALLOWED=1 so the full suite can
// never accidentally erase real data on a shared/hosted project.
async function wipeOrgData() {
  if (process.env.E2E_WIPE_ALLOWED !== "1") {
    console.warn("E2E_WIPE_ALLOWED != 1 — skipping data wipe; tests expect a clean org.");
    return;
  }
  const headers = { apikey: supabase.serviceRole, Authorization: `Bearer ${supabase.serviceRole}`, "Content-Type": "application/json" };
  for (const table of ["change_orders", "deal_comments", "documents", "rehab_items", "underwriting", "contractors", "property_data", "comps", "ai_analyses", "deals"]) {
    try {
      await fetch(`${supabase.url}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
        method: "DELETE",
        headers,
      });
    } catch {
      // table may be empty or not exposed; ignore
    }
  }
}

test.describe.serial("NC House Flip Studio E2E", () => {
  let partnerA = "";
  let partnerB = "";

  test.beforeAll(async () => {
    await wipeOrgData();
    const stamp = Date.now();
    partnerA = `partnera_${stamp}@test.local`;
    partnerB = `partnerb_${stamp}@test.local`;
    await createUser(partnerA, "testpass123", "Partner A");
    await createUser(partnerB, "testpass123", "Partner B");
    console.log(`Created users: ${partnerA} / ${partnerB}`);
  });

  async function signIn(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/");
    // Home is the command center; board tests go to the Kanban explicitly.
    await page.goto("/board");
  }

  test("1. Partner A can sign in and land on the command center", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Here's what's happening" })).toBeVisible();
  });

  test("2. Create a deal via the Add Deal modal", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.getByRole("button", { name: "Add Deal" }).click();
    await page.getByRole("button", { name: "Enter property details manually" }).click();
    await page.getByLabel("Address *").fill("123 Test Street");
    await page.getByLabel("City").fill("Charlotte");
    await page.getByLabel("Asking price").fill("220000");
    await page.getByLabel("Sqft").fill("1800");
    await page.getByLabel("Beds").fill("3");
    await page.getByLabel("Baths").fill("2");
    await page.getByRole("button", { name: "Add to Pipeline" }).click();
    await expect(page.getByText("123 Test Street")).toBeVisible();
  });

  test("3. Move the deal through stages via the detail page", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.getByText("123 Test Street").click();
    const stageSelect = page.locator("select").first();
    await stageSelect.selectOption("Underwriting");
    await expect(page.getByText("123 Test Street")).toBeVisible();
    // Deal still present after reload (server persisted it)
    await page.reload();
    await expect(page.getByText("123 Test Street")).toBeVisible();
  });

  test("4. Add rehab items and a change order", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.getByText("123 Test Street").click();
    await page.getByRole("button", { name: "Rehab" }).click();
    await page.getByRole("button", { name: "+ Add Line Item" }).click();
    await page.getByLabel("Trade *").selectOption("Electrical");
    await page.getByLabel("Description *").first().fill("Rewire kitchen");
    await page.getByLabel("Estimated cost *").fill("4500");
    await page.getByRole("button", { name: "Add Item" }).click();
    await expect(page.getByText("Rewire kitchen")).toBeVisible();

    // Change order on that item
    await page.getByRole("button", { name: /COs/ }).click();
    await page.getByPlaceholder("Description").fill("Extra outlets");
    await page.getByPlaceholder("Cost impact").fill("500");
    await page.getByRole("button", { name: "Add CO" }).click();
    await expect(page.getByText("Extra outlets")).toBeVisible();
  });

  test("5. Add a contractor and link it to a rehab item", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.goto("/contractors");
    await page.getByRole("button", { name: "Add Contractor" }).click();
    const modal = page.locator("div.fixed.inset-0").last();
    await modal.getByRole("textbox").first().fill("Bob the Electrician");
    await modal.locator("select").first().selectOption("Electrical");
    await modal.getByRole("button", { name: "Add Contractor" }).click();
    await expect(page.getByText("Bob the Electrician")).toBeVisible();

    // Link to rehab item
    await page.goto("/board");
    await page.getByText("123 Test Street").click();
    await page.waitForURL("**/deals/**");
    const dealUrl = page.url();
    await page.goto(dealUrl); // full server render with fresh contractor list
    await page.getByRole("button", { name: "Rehab" }).click();
    await page.getByRole("button", { name: "Edit" }).first().click();
    const contractorSelect = page.getByLabel("Contractor");
    const bobValue = await contractorSelect.locator("option", { hasText: "Bob the Electrician" }).getAttribute("value");
    await contractorSelect.selectOption(bobValue!);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Bob the Electrician")).toBeVisible();
  });

  test("6. Underwriting calculator computes live results", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.getByText("123 Test Street").click();
    await page.getByRole("button", { name: "Underwriting" }).click();
    await page.getByLabel("ARV $").fill("300000");
    await page.getByLabel("Rehab estimate $").fill("40000");
    await page.getByLabel("Purchase price $").fill("120000");
    // 70% MAO = 300000*0.7 - 40000 = 170000
    await expect(page.getByText("170,000").first()).toBeVisible();
    await page.getByRole("button", { name: "Save to Deal" }).click();
    await expect(page.getByText("Saved to deal")).toBeVisible();
  });

  test("7. Lien waiver PDF downloads", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.getByText("123 Test Street").click();
    // The conditional lien waiver only shows once the rehab item is in progress.
    await page.getByRole("button", { name: "Rehab" }).click();
    await page.locator("select").filter({ has: page.locator("option", { hasText: "Estimated" }) }).first().selectOption("in_progress");
    await page.getByRole("button", { name: "Documents" }).click();
    // Create the conditional lien waiver document for the item (status is in_progress).
    const lienRow = page.locator("tr").filter({ hasText: "Conditional Lien Waiver" });
    await lienRow.getByRole("button", { name: "Add" }).click();
    // Find the conditional lien waiver row's PDF link
    const pdfLink = page.locator('a[href*="generate-lien-waiver"]').first();
    await expect(pdfLink).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      pdfLink.click(),
    ]);
    expect(download.suggestedFilename()).toContain("lien-waiver");
  });

  test("8. Partner B sees the same deal (multi-user realtime/shared org)", async ({ page }) => {
    await signIn(page, partnerB, "testpass123");
    await expect(page.getByText("123 Test Street")).toBeVisible();
    await page.getByText("123 Test Street").click();
    // Shared org data: Partner B sees Partner A's rehab item + contractor link.
    await page.getByRole("button", { name: "Rehab" }).click();
    await expect(page.getByText("Rewire kitchen")).toBeVisible();
    await expect(page.getByText("Bob the Electrician")).toBeVisible();
  });

  test("9. Export data downloads JSON", async ({ page }) => {
    await signIn(page, partnerA, "testpass123");
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export All Data" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain("house-flip-export");
  });
});
