/**
 * One window-level keydown listener for the whole app.
 *
 * Consumers register a handler map with a priority; the highest priority
 * handler that claims a key wins. This is what makes Escape behave in the
 * required order (picker → overlay → selection) without every issue row
 * attaching its own listener.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/** Return true to claim the key and stop lower-priority handlers running. */
export type ShortcutHandler = (event: KeyboardEvent) => boolean | void;
export type ShortcutMap = Record<string, ShortcutHandler>;

export const SHORTCUT_PRIORITY = {
  /** Modal surfaces that must swallow keys first. */
  dialog: 400,
  overlay: 300,
  /** Focus/selection inside a list or board. */
  view: 200,
  /** App-wide defaults such as Create Issue. */
  global: 100,
} as const;

type Entry = {
  id: number;
  priority: number;
  map: ShortcutMap;
  allowWhileTyping: boolean;
};

type Registry = {
  register: (entry: Entry) => () => void;
};

const ShortcutContext = createContext<Registry | null>(null);

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (TYPING_TAGS.has(element.tagName)) return true;
  return Boolean(element.closest?.('[contenteditable="true"], [role="textbox"]'));
}

/** Radix renders open popovers/dropdowns into this wrapper. */
export function hasOpenPopover(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-radix-popper-content-wrapper]"));
}

export function shortcutKey(event: KeyboardEvent): string {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (mod && key === "Enter") return "Mod+Enter";
  if (mod) return `Mod+${key}`;
  if (event.shiftKey && key.length === 1) return `Shift+${key}`;
  return key;
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const entries = useRef<Entry[]>([]);

  const register = useCallback((entry: Entry) => {
    entries.current = [...entries.current, entry].sort(
      (a, b) => b.priority - a.priority || b.id - a.id,
    );
    return () => {
      entries.current = entries.current.filter((item) => item.id !== entry.id);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = shortcutKey(event);
      const typing = isTypingTarget(event.target);

      for (const entry of entries.current) {
        if (typing && !entry.allowWhileTyping) continue;
        const handler = entry.map[key];
        if (!handler) continue;
        if (handler(event) === true) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ register }), [register]);
  return (
    <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>
  );
}

let nextId = 1;

export function useShortcuts(
  map: ShortcutMap,
  options: {
    priority?: number;
    enabled?: boolean;
    /** Set for submit keys such as Mod+Enter that must work inside inputs. */
    allowWhileTyping?: boolean;
  } = {},
) {
  const registry = useContext(ShortcutContext);
  const {
    priority = SHORTCUT_PRIORITY.global,
    enabled = true,
    allowWhileTyping = false,
  } = options;

  // Keep the latest closures without re-registering on every render.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!registry || !enabled) return;
    const proxy: ShortcutMap = {};
    for (const key of Object.keys(mapRef.current)) {
      proxy[key] = (event) => mapRef.current[key]?.(event);
    }
    return registry.register({
      id: nextId++,
      priority,
      map: proxy,
      allowWhileTyping,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, enabled, priority, allowWhileTyping, Object.keys(map).join("|")]);
}
