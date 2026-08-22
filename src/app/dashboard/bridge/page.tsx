import { getVendorSession } from "@/lib/vendor-session";
import { BridgePanel } from "./bridge-panel";

export default async function BridgePage() {
  const { user } = await getVendorSession();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Printer bridge</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Turn on Bridge mode on the Android device next to your printer, then
        pair it.
      </p>
      <div className="mt-6">
        <BridgePanel vendorId={user.id} />
      </div>
    </div>
  );
}
