import Header from "@/components/Header";
import FeedbackBubble from "@/components/FeedbackBubble";

/** The app: antislop's header on top, the message bubble in the corner. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <FeedbackBubble />
    </>
  );
}
