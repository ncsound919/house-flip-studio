import { createClient } from "@/src/lib/supabase/server";
import { redirect } from "next/navigation";
import { login } from "@/src/app/(auth)/actions";

export const metadata = { title: "Sign in | NC House Flip Studio" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; check?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  const params = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          NC House Flip Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in to manage leads, rehab, and paperwork.
        </p>

        {params.check === "email" && (
          <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            Check your email to confirm your account, then sign in.
          </p>
        )}
        {params.error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <form action={login} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          New partner?{" "}
          <a className="font-medium text-blue-600 hover:text-blue-700" href="/signup">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
