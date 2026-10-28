"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  ArrowUpToLine,
  Bookmark,
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import type { ListItem, ListSummary, ProfileLite, Work } from "@/lib/types";
import {
  favorite,
  isFavorited,
  listsHolding,
  removeListItem,
  restoreListItem,
  unfavorite,
  updateListItem,
  useViewer,
  viewer,
} from "@/lib/viewer";
import { useReorder } from "@/lib/use-reorder";
import { dayStamp, itemHref } from "@/lib/work";
import { playUi } from "@/lib/sfx";
import WorkRow from "../WorkRow";
import ListCover from "../ListCover";
import CoverGlow from "../CoverGlow";
import FavoriteButton from "../FavoriteButton";
import Avatar from "../ui/Avatar";
import Star from "../ui/Star";
import { ShareLinkButton } from "../profile/ProfileActions";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { cn, iconButton, primaryButton } from "../ui/styles";

const EditListDialog = dynamic(() => import("./EditListDialog"));
const NoteDialog = dynamic(() => import("./NoteDialog"));
const AddDialog = dynamic(() => import("../add/AddDialog"));
const SaveDialog = dynamic(() => import("../SaveDialog"));
const ThoughtDialog = dynamic(() => import("../ThoughtDialog"));

function toWork(it: ListItem): Work {
  return {
    media_type: it.media_type,
    title: it.title,
    creator: it.creator,
    image_url: it.image_url,
    view_url: it.view_url,
    year: it.metadata?.year != null ? String(it.metadata.year) : null,
    canonical_id: it.canonical_id,
    work_key: it.work_key,
    metadata: it.metadata,
  };
}

const byPosition = (a: ListItem, b: ListItem) => a.position - b.position;

/** round glass buttons over the cover's glow */
const heroIcon =
  "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-900/10 bg-white/60 text-gray-700 outline-none backdrop-blur transition-colors hover:bg-white hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-neutral-400";

/** the rank, quiet — a list is an order */
function Rank({ n }: { n: number }) {
  return <span className="text-sm font-medium text-gray-400 tabular-nums dark:text-neutral-500">{n}</span>;
}

/**
 * The owner's gutter: the rank, swapped for a drag handle on hover (always a
 * handle on touch screens). Arrow keys move the row when the handle has focus.
 */
function Handle({ n, title, props }: { n: number; title: string; props: ReturnType<ReturnType<typeof useReorder>["handleProps"]> }) {
  return (
    <>
      <span
        aria-hidden
        className="text-sm font-medium text-gray-400 tabular-nums transition-opacity group-focus-within/row:opacity-0 group-hover/row:opacity-0 [@media(hover:none)]:opacity-0 dark:text-neutral-500"
      >
        {n}
      </span>
      <button
        type="button"
        aria-label={`Reorder ${title} — drag, or use the arrow keys`}
        title="Drag to reorder"
        {...props}
        className="absolute inset-0 flex cursor-grab items-center justify-center rounded-md text-gray-400 opacity-0 outline-none transition-opacity group-hover/row:opacity-100 hover:text-gray-900 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gray-900 active:cursor-grabbing [@media(hover:none)]:opacity-100 dark:text-neutral-500 dark:hover:text-neutral-100"
      >
        <GripVertical className="size-4" />
      </button>
    </>
  );
}

/**
 * A list, playlist-style: the cover and its color up top, then the works as
 * numbered rows — nothing between a visitor and the things in it. The owner
 * gets the tools in place: drag to reorder, ○ to mark something finished
 * (finished things sink into their own section, with "Loved it?" waiting),
 * ⋯ for the note, another list, or removal, and + Add to build it here.
 */
export default function ListView({
  list: initialList,
  owner,
  items: initialItems,
}: {
  list: ListSummary;
  owner: ProfileLite;
  items: ListItem[];
}) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === owner.id;
  const [list, setList] = useState(initialList);
  const [items, setItems] = useState(() => [...initialItems].sort(byPosition));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState<Work | null>(null);
  const [noteFor, setNoteFor] = useState<ListItem | null>(null);
  const [thoughtFor, setThoughtFor] = useState<{ id: string; title: string } | null>(null);
  const [finishedOpen, setFinishedOpen] = useState<boolean | null>(null);

  // the owner's own removals elsewhere (the save dialog) take effect here at
  // once — only once the store has fully loaded this list, so an empty store
  // never hides everything
  const live = own && !v.stale && v.lists.some((l) => l.id === list.id);
  const shown = useMemo(
    () => (live ? items.filter((it) => listsHolding(v, toWork(it)).has(list.id)) : items),
    [live, items, v, list.id]
  );
  const active = shown.filter((it) => !it.done_at);
  const finished = shown
    .filter((it) => it.done_at)
    .sort((a, b) => (a.done_at! < b.done_at! ? 1 : a.done_at! > b.done_at! ? -1 : 0));
  const showFinished = finishedOpen ?? (active.length === 0 && finished.length > 0);

  /* ── owner actions ──────────────────────────────────────────────────────── */

  const fail = (e: unknown, fallback: string) => toast(e instanceof Error ? e.message : fallback);

  const moveTo = async (id: string, to: number) => {
    const moving = active.find((x) => x.id === id);
    if (!moving) return;
    const rest = active.filter((x) => x.id !== id);
    const prev = rest[to - 1]?.position;
    const next = rest[to]?.position;
    const before = items;
    // fractional positions: one row written per move. If two neighbors ever
    // get too close to split, renumber the whole list once.
    if (prev !== undefined && next !== undefined && next - prev < 1e-6) {
      const order = [...rest.slice(0, to), moving, ...rest.slice(to), ...finished.slice().sort(byPosition)];
      const renumbered = order.map((it, i) => ({ ...it, position: i }));
      setItems(renumbered.concat(items.filter((x) => !order.some((o) => o.id === x.id))).sort(byPosition));
      try {
        await Promise.all(renumbered.map((it) => updateListItem(it, { position: it.position })));
      } catch (e) {
        setItems(before);
        fail(e, "Couldn't save the new order — try again.");
      }
      return;
    }
    const position = prev === undefined ? (next ?? 0) - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, position } : x)).sort(byPosition));
    try {
      await updateListItem(moving, { position });
    } catch (e) {
      setItems(before);
      fail(e, "Couldn't save the new order — try again.");
    }
  };

  const reorder = useReorder(
    active.map((it) => it.id),
    (id, to) => void moveTo(id, to)
  );

  const lovedIt = async (work: Work) => {
    try {
      playUi("confirm");
      const id = await favorite(work);
      toast("Added to your favorites", { label: "Add a thought", run: () => setThoughtFor({ id, title: work.title }) });
    } catch (e) {
      fail(e, "Couldn't favorite it — try again.");
    }
  };

  const setFinished = async (it: ListItem, done: boolean) => {
    const done_at = done ? new Date().toISOString() : null;
    const before = items;
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done_at } : x)));
    try {
      await updateListItem(it, { done_at });
    } catch (e) {
      setItems(before);
      fail(e, "Couldn't update — try again.");
      return;
    }
    if (!done) return;
    playUi("confirm");
    const work = toWork(it);
    if (isFavorited(viewer(), work)) {
      toast("Marked as finished", { label: "Undo", run: () => void setFinished({ ...it, done_at }, false) });
    } else {
      toast("Marked as finished", { label: "Loved it", run: () => void lovedIt(work) });
    }
  };

  const restore = async (it: ListItem) => {
    try {
      await restoreListItem(it);
      setItems((xs) => [...xs.filter((x) => x.id !== it.id), it].sort(byPosition));
    } catch (e) {
      fail(e, "Couldn't put it back — try again.");
    }
  };

  const remove = async (it: ListItem) => {
    const before = items;
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    try {
      await removeListItem(it);
      toast(`Removed from ${list.title}`, { label: "Undo", run: () => void restore(it) });
    } catch (e) {
      setItems(before);
      fail(e, "Couldn't remove it — try again.");
    }
  };

  // dialogs open after the menu has closed, so focus lands in the dialog
  const later = (fn: () => void) => setTimeout(fn, 0);

  // a render helper, not a component: a component defined in here would be a
  // new type every render and remount (closing an open menu) on any update
  const rowMenu = (it: ListItem, index: number) => {
    const work = toWork(it);
    const fav = isFavorited(v, work);
    return (
      <Menu>
        <MenuTrigger aria-label={`More for ${it.title}`} title="More" className={cn(iconButton, "max-sm:size-8")}>
          <MoreHorizontal className="size-4" />
        </MenuTrigger>
        <MenuContent>
          {/* phones hide the row's ★ for room; it lives here instead */}
          <MenuItem
            className="sm:hidden"
            onSelect={() =>
              void (fav
                ? unfavorite(work).then(() => toast("Removed from your favorites")).catch((e) => fail(e, "Couldn't update."))
                : lovedIt(work))
            }
          >
            <Star className={cn("size-4", fav && "text-star")} /> {fav ? "In your favorites" : "Favorite"}
          </MenuItem>
          <MenuItem onSelect={() => later(() => setNoteFor(it))}>
            <Quote /> {it.note?.trim() ? "Edit note" : "Add a note"}
          </MenuItem>
          {!it.done_at && index > 0 && (
            <MenuItem onSelect={() => void moveTo(it.id, 0)}>
              <ArrowUpToLine /> Move to top
            </MenuItem>
          )}
          <MenuItem onSelect={() => later(() => setSaving(work))}>
            <Bookmark /> Save to another list
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onSelect={() => void remove(it)}>
            <Trash2 /> Remove from list
          </MenuItem>
        </MenuContent>
      </Menu>
    );
  };

  /* ── rows ───────────────────────────────────────────────────────────────── */

  const rowLink = (it: ListItem) => {
    const internal = it.canonical_id ? itemHref({ canonical_id: it.canonical_id }) : null;
    return { href: internal ?? it.view_url, external: !internal };
  };

  const covers = list.covers.length ? list.covers : items.map((i) => i.image_url).filter((u): u is string => !!u);
  const total = shown.length;
  const path = `/${owner.username}/lists/${list.slug}`;

  return (
    <div className="relative">
      <CoverGlow covers={list.cover_image_url ? [list.cover_image_url, ...covers] : covers} />

      <div className="relative mx-auto max-w-3xl px-4 pt-4 sm:px-6 sm:pt-10">
        <header>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <div className="w-full shrink-0 sm:w-72">
              <ListCover
                coverImage={list.cover_image_url}
                covers={covers}
                title={list.title}
                priority
                className="shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
              />
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-neutral-300">
                {list.is_public ? (
                  "List"
                ) : (
                  <>
                    <Lock className="size-3" aria-hidden /> Private list
                  </>
                )}
              </p>
              <h1 className="mt-1.5 text-[32px] font-bold leading-[1.05] tracking-[-0.035em] break-words text-gray-950 sm:text-[44px] dark:text-white">
                {list.title}
              </h1>
              {list.description?.trim() && (
                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-gray-600 dark:text-neutral-300">
                  {list.description.trim()}
                </p>
              )}
              <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-500 dark:text-neutral-400">
                <Link
                  href={`/${owner.username}`}
                  className="flex items-center gap-1.5 font-semibold text-gray-900 hover:underline dark:text-neutral-100"
                >
                  <Avatar p={owner} className="size-5" />
                  {owner.display_name || `@${owner.username}`}
                </Link>
                <span aria-hidden>·</span>
                <span>
                  {total} {total === 1 ? "item" : "items"}
                </span>
                {finished.length > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{finished.length} finished</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>
                  Updated <time dateTime={list.updated_at}>{dayStamp(list.updated_at)}</time>
                </span>
              </p>
              {(own || list.is_public) && (
                <div className="mt-5 flex items-center gap-2">
                  {own && (
                    <button type="button" onClick={() => setAdding(true)} className={cn(primaryButton, "h-9 px-4")}>
                      <Plus className="size-4" strokeWidth={2.4} /> Add
                    </button>
                  )}
                  {list.is_public && <ShareLinkButton icon path={path} label="Share list" className={heroIcon} />}
                  {own && (
                    <button type="button" onClick={() => setEditing(true)} aria-label="Edit list" title="Edit list" className={heroIcon}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <section aria-label="In this list" className="mt-8 sm:mt-10">
          {active.length > 0 && (
            <ol className="-mx-2 flex flex-col sm:-mx-3">
              {active.map((it, i) => {
                const work = toWork(it);
                const { href, external } = rowLink(it);
                const lifted = reorder.drag?.id === it.id;
                return (
                  <li
                    key={it.id}
                    ref={reorder.register(it.id)}
                    style={reorder.drag ? { transform: `translateY(${reorder.offset(i)}px)` } : undefined}
                    className={cn(
                      "relative",
                      reorder.drag && !lifted && "transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                      lifted && "z-30"
                    )}
                  >
                    <WorkRow
                      work={work}
                      href={href}
                      external={external}
                      note={it.note}
                      priority={i < 6}
                      lead={own ? <Handle n={i + 1} title={it.title} props={reorder.handleProps(it.id)} /> : <Rank n={i + 1} />}
                      aside={list.show_added ? dayStamp(it.created_at) : undefined}
                      className={cn(lifted && "bg-white shadow-[0_10px_30px_rgba(0,0,0,0.14)] dark:bg-neutral-800")}
                      actions={
                        own ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void setFinished(it, true)}
                              aria-label={`Mark ${it.title} as finished`}
                              title="Finished it?"
                              className={cn(iconButton, "group/finish max-sm:size-8")}
                            >
                              <Circle className="size-[18px] group-hover/finish:hidden" strokeWidth={1.8} />
                              <CircleCheck className="hidden size-[18px] group-hover/finish:block" strokeWidth={1.8} />
                            </button>
                            <FavoriteButton work={work} className="max-sm:hidden" />
                            {rowMenu(it, i)}
                          </>
                        ) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ol>
          )}

          {total === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-neutral-700">
              <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">Nothing here yet.</p>
              {own ? (
                <>
                  <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
                    Add something now, or tap 🔖 on anything you find.
                  </p>
                  <button type="button" onClick={() => setAdding(true)} className={cn(primaryButton, "mt-5 h-9 px-4")}>
                    <Plus className="size-4" strokeWidth={2.4} /> Add something
                  </button>
                </>
              ) : (
                <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">Check back later.</p>
              )}
            </div>
          )}

          {active.length === 0 && finished.length > 0 && (
            <p className="px-1 pb-2 text-sm text-gray-500 dark:text-neutral-400">
              {own ? "All done — you've finished everything on this list." : "Everything here is finished."}
            </p>
          )}

          {finished.length > 0 && (
            <div className={cn(active.length > 0 && "mt-6 border-t border-gray-200 pt-4 dark:border-neutral-800")}>
              <button
                type="button"
                onClick={() => setFinishedOpen(!showFinished)}
                aria-expanded={showFinished}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-gray-900 outline-none hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-neutral-100 dark:hover:text-neutral-300"
              >
                Finished
                <span className="font-medium text-gray-500 tabular-nums dark:text-neutral-400">{finished.length}</span>
                <ChevronDown className={cn("size-4 text-gray-500 transition-transform", showFinished && "rotate-180")} />
              </button>
              {showFinished && (
                <ul className="-mx-2 mt-2 flex flex-col sm:-mx-3">
                  {finished.map((it, i) => {
                    const work = toWork(it);
                    const { href, external } = rowLink(it);
                    const fav = isFavorited(v, work);
                    return (
                      <li key={it.id}>
                        <WorkRow
                          work={work}
                          href={href}
                          external={external}
                          note={it.note}
                          dim
                          lead={
                            own ? (
                              <button
                                type="button"
                                onClick={() => void setFinished(it, false)}
                                aria-label={`Mark ${it.title} as not finished`}
                                title="Not finished"
                                className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-gray-900 text-white outline-none transition-colors hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                              >
                                <Check className="size-3.5" strokeWidth={3} />
                              </button>
                            ) : (
                              <Check className="size-4 text-gray-400 dark:text-neutral-500" strokeWidth={2.5} aria-label="Finished" />
                            )
                          }
                          aside={it.done_at ? dayStamp(it.done_at) : undefined}
                          actions={
                            own ? (
                              <>
                                {fav ? (
                                  <FavoriteButton work={work} className="max-sm:size-8" />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void lovedIt(work)}
                                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-gray-900/[0.06] px-2.5 text-xs font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-900/10 focus-visible:ring-2 focus-visible:ring-gray-900 dark:bg-white/10 dark:text-neutral-100 dark:hover:bg-white/15"
                                  >
                                    <Star className="size-3.5 text-star" /> Loved it?
                                  </button>
                                )}
                                {rowMenu(it, i)}
                              </>
                            ) : undefined
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {v.status === "signed-out" && total > 0 && (
          <p className="mt-14 text-center text-sm text-gray-500 dark:text-neutral-400">
            Made on Favorite.{" "}
            <Link href="/signin" className="font-semibold text-gray-900 underline underline-offset-4 dark:text-neutral-100">
              Make your own lists
            </Link>
          </p>
        )}
      </div>

      {editing && (
        <EditListDialog
          list={list}
          open={editing}
          onOpenChange={setEditing}
          onSaved={(patch) => setList((l) => ({ ...l, ...patch }))}
        />
      )}
      {adding && (
        <AddDialog
          open={adding}
          onOpenChange={setAdding}
          list={{ id: list.id, title: list.title }}
          onAdded={(row) => setItems((xs) => [row, ...xs.filter((x) => x.id !== row.id)].sort(byPosition))}
        />
      )}
      {noteFor && (
        <NoteDialog
          item={noteFor}
          open={!!noteFor}
          onOpenChange={(o) => !o && setNoteFor(null)}
          onSaved={(note) => setItems((xs) => xs.map((x) => (x.id === noteFor.id ? { ...x, note } : x)))}
        />
      )}
      {saving && <SaveDialog work={saving} open={!!saving} onOpenChange={(o) => !o && setSaving(null)} />}
      {thoughtFor && (
        <ThoughtDialog
          itemId={thoughtFor.id}
          title={thoughtFor.title}
          open={!!thoughtFor}
          onOpenChange={(o) => !o && setThoughtFor(null)}
        />
      )}
    </div>
  );
}
