"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/lender", label: "Track Record" },
  { href: "/lender/balance-sheet", label: "Balance Sheet" },
  { href: "/lender/debts", label: "Debt Schedule" },
  { href: "/lender/vault", label: "Entity Vault" },
  { href: "/lender/calibration", label: "Calibration" },
];

export default function LenderNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto border-b border-zinc-200 pb-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            pathname === link.href
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-100"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
