import { LocalizationView } from "@/app/(app)/apps/[appId]/localization/localization-view";

export default async function LocalizationPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <LocalizationView appId={appId} />;
}
