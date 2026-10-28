"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, LockOpen, Plus } from "lucide-react";
import type { Work } from "@/lib/types";
import {
  createList,
  fetchMyNotes,
  listsHolding,
  setListsForWork,
  useViewer,
  viewer,
  type MyList,
} from "@/lib/viewer";
import { playUi } from "@/lib/sfx";
import Dialog from "./ui/Dialog";
import ListCover from "./ListCover";
import { toast } from "./ui/Toast";
import { cn, field, primaryButton } from "./ui/styles";

const NOTE_MAX = 280;
/** a first-time saver's ready-made list, created on Done if kept ticked */
const STARTER = "__check_later__";

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function NoteBox({
  value,
  listTitle,
  onChange,
  autoFocus,
}: {
  value: string;
  listTitle: string;
  onChange: (v: string) => void;
  autoFocus: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (ref.current) autoGrow(ref.current);
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="relative z-10 mt-2 min-w-0">
      <div className={cn("rounded-lg bg-gray-200 dark:bg-neutral-700", focused && "pb-2")}>
        <textarea
          ref={ref}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            autoGrow(e.currentTarget);
            onChange(e.target.value);
          }}
          maxLength={NOTE_MAX}
          rows={2}
          placeholder="Add a note..."
          aria-label={`Note for ${listTitle}`}
          className={cn(
            "min-h-[52px] w-full resize-none overflow-hidden bg-transparent px-3 pt-2 text-base font-normal leading-5 sm:text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-neutral-100 dark:placeholder:text-neutral-400",
            focused ? "pb-1" : "pb-2"
          )}
        />
        {focused && (
          <p className="px-3 text-xs text-gray-400 dark:text-neutral-500">
            {value.length}/{NOTE_MAX}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  list,
  included,
  note,
  onToggle,
  onNote,
  disabled,
}: {
  list: Pick<MyList, "id" | "title" | "is_public" | "count" | "covers" | "cover_image_url">;
  included: boolean;
  note: string;
  onToggle: () => void;
  onNote: (v: string) => void;
  disabled: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = included && (noteOpen || note.length > 0);
  return (
    <div
      className={cn(
        "relative rounded-lg px-2 py-2",
        included
          ? "bg-gray-100 dark:bg-neutral-700/50"
          : "transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700/60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={included}
        aria-label={list.title}
        className="absolute inset-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-inset disabled:pointer-events-none dark:focus-visible:ring-neutral-400"
      />
      <div className="pointer-events-none relative z-10 flex items-center gap-3">
        <ListCover coverImage={list.cover_image_url} covers={list.covers} small />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{list.title}</span>
          <span className="min-w-0 truncate text-xs text-gray-500 dark:text-neutral-400">
            {`${list.count} ${list.count === 1 ? "item" : "items"} · ${list.is_public ? "Public" : "Private"}`}
            {included && " · "}
            {included && (
              <button
                type="button"
                disabled={disabled}
                aria-pressed={showNote}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setNoteOpen((o) => !o)}
                className={cn(
                  "pointer-events-auto inline cursor-pointer border-0 bg-transparent p-0 align-baseline underline outline-none focus-visible:ring-2 focus-visible:ring-gray-900",
                  showNote ? "text-gray-900 dark:text-neutral-100" : "hover:text-gray-900 dark:hover:text-neutral-100"
                )}
              >
                {note.length ? "Note" : "Add note"}
              </button>
            )}
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            included
              ? "border-gray-900 bg-gray-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-gray-300 dark:border-neutral-600"
          )}
        >
          {included && <Check className="size-3.5" />}
        </span>
      </div>
      {showNote && <NoteBox value={note} listTitle={list.title} onChange={onNote} autoFocus={noteOpen} />}
    </div>
  );
}

/** "+ New list" — inline name field, the public/private lock, create. */
function NewList({ onCreated, disabled }: { onCreated: (l: MyList) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 justify-self-start rounded-lg px-2 text-sm font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:text-neutral-100 dark:hover:bg-neutral-700/60"
      >
        <Plus className="size-4" /> New list
      </button>
    );
  }
  const iconBtn =
    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gray-200 text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600";
  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex items-center gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            const l = await createList({ title, isPublic });
            onCreated(l);
            setTitle("");
            setOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't create the list.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="List name"
          aria-label="List name"
          maxLength={80}
          autoFocus
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className={cn(field, "h-8 min-w-0 flex-1")}
        />
        <button
          type="button"
          onClick={() => setIsPublic((p) => !p)}
          aria-pressed={!isPublic}
          aria-label={isPublic ? "Public — tap to make private" : "Private — tap to make public"}
          title={isPublic ? "Public: shows on your profile" : "Private: only you"}
          className={iconBtn}
        >
          {isPublic ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
        </button>
        <button type="submit" disabled={busy || !title.trim()} aria-label="Create list" className={iconBtn}>
          <Plus className="size-4" />
        </button>
      </form>
      <p className="px-1 text-xs text-gray-500 dark:text-neutral-400">
        {isPublic ? "Public — anyone can see it on your profile." : "Private — only you can see it."}
      </p>
      {error && (
        <p role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function SaveDialog({
  work,
  open,
  onOpenChange,
}: {
  work: Work;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const v = useViewer();
  // order frozen at open, so rows don't jump under the pointer; new lists go on top
  const [order, setOrder] = useState<string[]>(() => viewer().lists.map((l) => l.id));
  const starter = order.length === 0;
  const [selected, setSelected] = useState<Set<string>>(() =>
    starter ? new Set([STARTER]) : listsHolding(viewer(), work)
  );
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [prevNotes, setPrevNotes] = useState<Map<string, string>>(new Map());
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;
    fetchMyNotes(work).then((m) => {
      if (stale) return;
      setNotes(new Map(m));
      setPrevNotes(m);
      setLoadingNotes(false);
    });
    return () => {
      stale = true;
    };
  }, [work]);

  const rows = useMemo(() => {
    const byId = new Map(v.lists.map((l) => [l.id, l]));
    const fresh = v.lists.filter((l) => !order.includes(l.id)).map((l) => l.id);
    return [...fresh, ...order].map((id) => byId.get(id)).filter((l): l is MyList => !!l);
  }, [v.lists, order]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const done = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const sel = new Set(selected);
      const n = new Map(notes);
      if (sel.has(STARTER)) {
        const l = await createList({ title: "Check later", isPublic: false });
        sel.delete(STARTER);
        sel.add(l.id);
        if (n.has(STARTER)) n.set(l.id, n.get(STARTER)!);
      }
      const before = listsHolding(viewer(), work);
      await setListsForWork(work, sel, n, prevNotes);
      const added = [...sel].filter((id) => !before.has(id));
      const removed = [...before].filter((id) => !sel.has(id));
      const name = (id: string) => viewer().lists.find((l) => l.id === id)?.title ?? "your list";
      if (added.length) {
        playUi("confirm");
        toast(added.length === 1 ? `Saved to ${name(added[0])}` : `Saved to ${added.length} lists`);
      } else if (removed.length) {
        toast(removed.length === 1 ? `Removed from ${name(removed[0])}` : `Removed from ${removed.length} lists`);
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  const title = work.title.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={
        <>
          Save ‘{title.length > 60 ? `${title.slice(0, 58)}…` : title}’ to…
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <NewList
          disabled={busy}
          onCreated={(l) => {
            setOrder((o) => [l.id, ...o.filter((x) => x !== l.id)]);
            setSelected((s) => {
              const next = new Set(s);
              next.delete(STARTER);
              next.add(l.id);
              return next;
            });
          }}
        />
        <div className="h-px bg-gray-200 dark:bg-neutral-700" role="separator" />
        <div className="-mx-2 flex flex-col gap-1">
          {starter && rows.length === 0 ? (
            <Row
              list={{ id: STARTER, title: "Check later", is_public: false, count: 0, covers: [], cover_image_url: null }}
              included={selected.has(STARTER)}
              note={notes.get(STARTER) ?? ""}
              onToggle={() => toggle(STARTER)}
              onNote={(val) => setNotes((m) => new Map(m).set(STARTER, val))}
              disabled={busy}
            />
          ) : (
            rows.map((l) => (
              <Row
                key={l.id}
                list={l}
                included={selected.has(l.id)}
                note={notes.get(l.id) ?? ""}
                onToggle={() => toggle(l.id)}
                onNote={(val) => setNotes((m) => new Map(m).set(l.id, val))}
                disabled={busy || loadingNotes}
              />
            ))
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="button" onClick={done} disabled={busy} className={cn(primaryButton, "w-full")}>
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </Dialog>
  );
}
