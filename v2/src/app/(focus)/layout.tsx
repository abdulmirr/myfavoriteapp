import Logo from "@/components/Logo";

/** Focused flows (sign in, auth links, onboarding): no nav, just the way home. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
      </div>
      {children}
    </>
  );
}
