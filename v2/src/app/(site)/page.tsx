import { preload } from "react-dom";
import { getTodayCommunityPicks } from "@/lib/data";
import { coverSrcSet } from "@/lib/img";
import HomeView from "@/components/home/HomeView";

export default async function Home() {
  // the community's five, cached hourly and prerendered into the shell
  const { picks } = await getTodayCommunityPicks();
  const first = picks[0]?.item.image_url;
  if (first) {
    const s = coverSrcSet(first, "(max-width: 639px) 92vw, 576px");
    preload(s.src, { as: "image", fetchPriority: "high", imageSrcSet: s.srcSet, imageSizes: s.sizes });
  }
  return <HomeView community={picks} />;
}
