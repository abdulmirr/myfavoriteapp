/** The title block every onboarding beat opens with — the landing page's type, a size down. */
export default function BeatHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-[32px] font-bold leading-[1.08] tracking-[-0.035em] text-balance text-gray-950 sm:text-[44px] dark:text-white">
        {title}
      </h1>
      {sub && (
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-balance text-gray-500 sm:text-base dark:text-neutral-400">
          {sub}
        </p>
      )}
    </div>
  );
}
