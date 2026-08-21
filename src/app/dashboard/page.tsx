import { getVendorSession } from "@/lib/vendor-session";

export default async function DashboardPage() {
  await getVendorSession();
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-display text-2xl">printkit dashboard</h1>
        <p className="text-muted-foreground mt-2">Coming soon.</p>
      </div>
    </main>
  );
}
