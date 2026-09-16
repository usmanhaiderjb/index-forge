import { CreativesView } from "@/app/(app)/apps/[appId]/creatives/creatives-view";

export default async function CreativesPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <CreativesView appId={appId} />;
}
