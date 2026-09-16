import { AppOverview } from "@/app/(app)/apps/[appId]/overview-view";

export default async function AppOverviewPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <AppOverview appId={appId} />;
}
