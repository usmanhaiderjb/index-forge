import { MonetizationView } from "./monetization-view";

export default async function MonetizationPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <MonetizationView appId={appId} />;
}
