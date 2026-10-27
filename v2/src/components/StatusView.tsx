import Star from "./ui/Star";

/** The quiet full-page message behind 404s and error boundaries. */
export default function StatusView({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[64vh] w-full max-w-sm flex-col items-center justify-center px-4 pb-20 text-center">
      <Star className="size-8 text-star" />
      <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight text-gray-900 dark:text-neutral-100">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">{body}</p>
      {children && <div className="mt-6 flex gap-2">{children}</div>}
    </main>
  );
}
