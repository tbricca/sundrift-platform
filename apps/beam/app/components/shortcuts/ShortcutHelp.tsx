/**
 * The one shortcut reference in the app. Everything it shows is derived from
 * the shortcut registry, so a new binding documents itself.
 *
 * Opened with `?`, from the command palette, or via `openShortcutHelp()`.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyHint } from "@/components/ui/keycap";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import {
  INTERACTION_TIPS,
  REQUIREMENT_LABEL,
  keyTokens,
  keys as shortcutKeys,
  shortcutsByCategory,
} from "@/lib/shortcuts";

const OPEN_EVENT = "beam:shortcut-help";
const HINT_KEY = "beam.shortcut-hint-seen";

export function openShortcutHelp() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handle);
    return () => window.removeEventListener(OPEN_EVENT, handle);
  }, []);

  // One-time nudge so the `?` sheet is discoverable without a tour.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HINT_KEY)) return;
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    const timer = setTimeout(
      () =>
        toast("Press ? to view keyboard shortcuts", {
          action: { label: "Show", onClick: () => setOpen(true) },
        }),
      1500,
    );
    return () => clearTimeout(timer);
  }, []);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
    return true;
  }, []);

  // `?` arrives as different tokens across layouts; the registry knows them.
  useShortcuts(
    Object.fromEntries(keyTokens("app.help").map((token) => [token, toggle])),
    { priority: SHORTCUT_PRIORITY.global },
  );

  useShortcuts(
    {
      [shortcutKeys("nav.escape")]: () => {
        setOpen(false);
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, enabled: open, allowWhileTyping: true },
  );

  const groups = shortcutsByCategory();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-[13px] font-semibold">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">
          A reference of Beam's keyboard shortcuts, grouped by category.
        </DialogDescription>

        <div className="grid max-h-[70vh] gap-x-6 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.category} aria-label={group.category}>
              <h2 className="beam-meta mb-1.5 uppercase tracking-wide">
                {group.category}
              </h2>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[13px] text-foreground">
                      {item.label}
                      {item.requires ? (
                        <span className="beam-meta ms-2">
                          {REQUIREMENT_LABEL[item.requires]}
                        </span>
                      ) : null}
                    </span>
                    <KeyHint token={item.keys} className="shrink-0" />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section aria-label="Mouse interactions">
            <h2 className="beam-meta mb-1.5 uppercase tracking-wide">
              Interaction tips
            </h2>
            <ul className="flex flex-col">
              {INTERACTION_TIPS.map((tip) => (
                <li
                  key={tip.keys}
                  className="flex items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[13px] text-foreground">
                    {tip.label}
                  </span>
                  <KeyHint token={tip.keys} className="shrink-0" />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="beam-meta border-t border-border px-4 py-2.5">
          Shortcuts are ignored while you are typing. Press Escape to close.
        </p>
      </DialogContent>
    </Dialog>
  );
}
