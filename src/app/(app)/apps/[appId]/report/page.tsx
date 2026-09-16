import { notFound } from "next/navigation";

import { ReportView } from "@/app/(app)/apps/[appId]/report/report-view";
import { api } from "@/trpc/server";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const app = await api.apps.byId({ appId }).catch(() => null);
  if (!app) notFound();

  return <ReportView appId={appId} />;
}
