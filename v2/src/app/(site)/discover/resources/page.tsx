import type { Metadata } from "next";
import { getResources } from "@/lib/resources";
import ResourcesView from "@/components/discover/ResourcesView";

export const metadata: Metadata = {
  title: "Resources",
  description: "Some of the greatest resources on the internet: essays, talks, videos and tweets worth your time.",
};

/** Discover → Resources: antislop's archive, cached into the static shell and refreshed hourly. */
export default async function ResourcesPage() {
  const resources = await getResources();
  return <ResourcesView resources={resources} />;
}
