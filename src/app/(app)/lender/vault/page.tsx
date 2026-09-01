import LenderNav from "@/components/lender/LenderNav";
import EntityVault from "@/components/lender/EntityVault";

export const metadata = { title: "Entity Vault | NC House Flip Studio" };

export default function VaultPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Entity Vault</h1>
        <p className="text-sm text-zinc-500">The corporate file a lender asks for — build it while you build the track record.</p>
      </div>
      <LenderNav />
      <EntityVault />
    </div>
  );
}
