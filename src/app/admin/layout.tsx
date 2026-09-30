import { requireAdmin } from "@/lib/auth/server";
import { AdminNav } from "@/components/AdminNav";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  return (
    <div className="container-pro py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-jade-600">
            {arabic ? "عمليات Get Gold" : "Get Gold operations"}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-jade-950">
            {arabic ? "لوحة الإدارة" : "Administration"}
          </h1>
        </div>
      </div>
      <div className="mt-4">
        <AdminNav arabic={arabic} />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
