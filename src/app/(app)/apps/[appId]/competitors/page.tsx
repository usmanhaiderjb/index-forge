import { CompetitorsView } from "@/app/(app)/apps/[appId]/competitors/competitors-view";

export default async function CompetitorsPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <CompetitorsView appId={appId} />;
}
