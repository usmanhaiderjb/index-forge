import { ReviewsView } from "@/app/(app)/apps/[appId]/reviews/reviews-view";

export default async function ReviewsPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <ReviewsView appId={appId} />;
}
