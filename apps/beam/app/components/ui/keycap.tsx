/**
 * Subtle keycaps for shortcut hints. Labels come from the shortcut registry so
 * macOS sees ⌘ / ⌥ and everyone else sees Ctrl / Alt.
 */
import { useEffect, useState } from "react";

import { isApplePlatform, keyLabels } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** Resolved after mount so the server and the first paint always agree. */
function useApplePlatform(): boolean {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(isApplePlatform()), []);
  return apple;
}

export function Keycap({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      {...props}
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted/60 px-1 font-sans text-[10px] font-medium leading-none text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Renders a handler token such as `Mod+k` as keycaps.
 * `srLabel` keeps the combination readable for screen readers.
 */
export function KeyHint({
  token,
  className,
  capClassName,
  srLabel,
}: {
  token: string;
  className?: string;
  /** For hints sitting on a filled surface, where a bordered cap looks bolted on. */
  capClassName?: string;
  srLabel?: string;
}) {
  const apple = useApplePlatform();
  const parts = keyLabels(token, apple);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <span className="sr-only">{srLabel ?? `Shortcut: ${parts.join(" ")}`}</span>
      {parts.map((part, index) => (
        <Keycap key={`${part}-${index}`} aria-hidden className={capClassName}>
          {part}
        </Keycap>
      ))}
    </span>
  );
}
