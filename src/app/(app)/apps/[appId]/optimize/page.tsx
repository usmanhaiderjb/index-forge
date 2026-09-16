import { OptimizeView } from "@/app/(app)/apps/[appId]/optimize/optimize-view";

export default async function OptimizePage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <OptimizeView appId={appId} />;
}
