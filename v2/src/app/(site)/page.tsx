import { getLandingWalls, getTodayCommunityPicks } from "@/lib/data";
import HomeView from "@/components/home/HomeView";
import HomeSwitch from "@/components/home/HomeSwitch";
import Landing from "@/components/landing/Landing";

/**
 * Visitors get the landing page; members get Home (today's picks). Both are
 * prerendered from the same cached data — the community's five, and three
 * pages for the landing's "walls already up".
 */
export default async function Home() {
  const [{ picks }, walls] = await Promise.all([getTodayCommunityPicks(), getLandingWalls()]);
  return <HomeSwitch landing={<Landing picks={picks} walls={walls} />} home={<HomeView community={picks} />} />;
}
