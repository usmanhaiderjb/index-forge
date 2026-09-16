import { AdvertisingTabView } from "./advertising-tab-view";

export default async function AppAdvertisingPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <AdvertisingTabView appId={appId} />;
}
