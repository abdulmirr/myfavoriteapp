import { card, cn } from "./ui/styles";

/** Shell + typography for the legal pages (/privacy, /terms): one white card of prose. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-20 sm:px-6 sm:pt-10">
      <article className={cn(card, "px-5 py-8 sm:px-10 sm:py-12")}>
        <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">{eyebrow}</p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight text-gray-900 sm:text-[32px] dark:text-neutral-100">
          {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">Last updated {updated}</p>
        <div className="mt-8 flex flex-col gap-4">{children}</div>
      </article>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100">{children}</h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-gray-600 dark:text-neutral-300">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-gray-400">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-[15px] leading-relaxed text-gray-600 dark:text-neutral-300">{children}</li>;
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-gray-900 dark:text-neutral-100">{children}</strong>;
}

export function Mail() {
  return (
    <a
      href="mailto:builtbyabdul@gmail.com"
      className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-600 dark:text-neutral-100 dark:hover:text-neutral-300"
    >
      builtbyabdul@gmail.com
    </a>
  );
}
