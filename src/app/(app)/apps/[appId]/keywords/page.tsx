import { KeywordsView } from "@/app/(app)/apps/[appId]/keywords/keywords-view";

export default async function KeywordsPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <KeywordsView appId={appId} />;
}
