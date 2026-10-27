/** The title block every onboarding beat opens with — the sign-in card's type. */
export default function BeatHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-gray-900 sm:text-[32px] dark:text-neutral-100">
        {title}
      </h1>
      {sub && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-neutral-400">{sub}</p>
      )}
    </div>
  );
}
