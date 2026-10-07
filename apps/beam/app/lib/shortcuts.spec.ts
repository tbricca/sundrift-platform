import { describe, expect, it } from "vitest";

import {
  SHORTCUTS,
  keyLabels,
  keyTokens,
  keys,
  shortcutsByCategory,
} from "./shortcuts";

describe("shortcut registry", () => {
  it("has unique ids", () => {
    const ids = SHORTCUTS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes handler tokens including aliases", () => {
    expect(keys("app.palette")).toBe("Mod+k");
    expect(keyTokens("app.help")).toContain("Shift+?");
  });

  it("keeps search and the command palette on separate keys", () => {
    expect(keys("app.search")).toBe("/");
    expect(keys("app.palette")).toBe("Mod+k");
    // `?` is Shift+/, so the unshifted slash stays free for search.
    expect(keyTokens("app.help")).not.toContain("/");
  });

  it("labels modifiers per platform", () => {
    expect(keyLabels("Mod+k", true)).toEqual(["⌘", "K"]);
    expect(keyLabels("Mod+k", false)).toEqual(["Ctrl", "K"]);
    expect(keyLabels("Escape", false)).toEqual(["Esc"]);
  });

  it("groups every documented shortcut exactly once", () => {
    const grouped = shortcutsByCategory().flatMap((group) => group.items);
    expect(grouped).toHaveLength(
      SHORTCUTS.filter((def) => def.inHelp !== false).length,
    );
  });
});
