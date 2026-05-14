import { requireAdmin } from "@/lib/auth/server";
import { AdminNav } from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="container-pro py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Admin</h1>
      </div>
      <div className="mt-4"><AdminNav /></div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
