import CapitalControl from "@/components/capital/CapitalControl";

export const metadata = { title: "Capital | NC House Flip Studio" };

export default function CapitalPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Capital</h1>
        <p className="text-sm text-zinc-500">
          The capital stack: how deals are funded and what each layer earns on exit.
        </p>
      </div>
      <CapitalControl />
    </div>
  );
}
