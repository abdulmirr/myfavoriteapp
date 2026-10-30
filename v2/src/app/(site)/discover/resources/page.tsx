import type { Metadata } from "next";
import { getResources } from "@/lib/resources";
import ResourcesView from "@/components/discover/ResourcesView";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Essays, talks and videos worth your time, for founders and for getting better at life. Picked by antislop.",
};

/** Discover → Resources: antislop's archive, cached into the static shell and refreshed hourly. */
export default async function ResourcesPage() {
  const resources = await getResources();
  return <ResourcesView resources={resources} />;
}
