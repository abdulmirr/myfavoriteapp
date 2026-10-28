import { getTodayCommunityPicks } from "@/lib/data";
import HomeView from "@/components/home/HomeView";
import HomeSwitch from "@/components/home/HomeSwitch";
import Landing from "@/components/landing/Landing";

/** Visitors get the landing page; members get Home (today's picks). Both are in the static shell. */
export default async function Home() {
  const { picks } = await getTodayCommunityPicks();
  return <HomeSwitch landing={<Landing />} home={<HomeView community={picks} />} />;
}
