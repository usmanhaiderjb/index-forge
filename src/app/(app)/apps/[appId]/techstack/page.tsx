import { TechStackView } from "./techstack-view";

export default async function TechStackPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <TechStackView appId={appId} />;
}
