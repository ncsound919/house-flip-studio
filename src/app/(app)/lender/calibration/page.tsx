import LenderNav from "@/components/lender/LenderNav";
import Calibration from "@/components/lender/Calibration";

export const metadata = { title: "Calibration | NC House Flip Studio" };

export default function CalibrationPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Calibration</h1>
        <p className="text-sm text-zinc-500">How accurate the system's projections have been — the learning loop.</p>
      </div>
      <LenderNav />
      <Calibration />
    </div>
  );
}
