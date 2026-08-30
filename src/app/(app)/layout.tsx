import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signout } from "@/app/(auth)/actions";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/board", label: "Deals" },
  { href: "/leads", label: "Leads" },
  { href: "/contractors", label: "Contractors" },
  { href: "/documents", label: "Documents" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-zinc-900">
              NC House Flip Studio
            </Link>
            <div className="flex gap-0.5 overflow-x-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 sm:px-3"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/settings"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              Settings
            </Link>
            <form action={signout}>
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
