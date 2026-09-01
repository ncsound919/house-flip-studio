import OutreachDashboard from "@/components/outreach/OutreachDashboard";

export const metadata = { title: "Outreach | NC House Flip Studio" };

export default function OutreachPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Outreach</h1>
        <p className="text-sm text-zinc-500">
          The acquisition loop: contact every lead on a cadence, track every response, and watch conversion.
        </p>
      </div>
      <OutreachDashboard />
    </div>
  );
}
