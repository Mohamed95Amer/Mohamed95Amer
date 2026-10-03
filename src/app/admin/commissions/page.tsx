import { cookies } from "next/headers";
import { getCommissionData } from "@/lib/admin/data";
import { CommissionManager } from "./CommissionManager";
export default async function CommissionsPage() {
  const data = await getCommissionData();
  return (
    <CommissionManager
      {...data}
      arabic={(await cookies()).get("gg_lang")?.value === "ar"}
    />
  );
}
