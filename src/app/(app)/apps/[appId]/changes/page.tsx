import { ChangesView } from "@/app/(app)/apps/[appId]/changes/changes-view";

export default async function ChangesPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <ChangesView appId={appId} />;
}
