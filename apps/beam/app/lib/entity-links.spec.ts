import { describe, expect, it } from "vitest";

import { hostnameOf, linkDisplayTitle, normalizeUrl } from "./entity-links";

describe("normalizeUrl", () => {
  it("accepts an https URL unchanged", () => {
    expect(normalizeUrl("https://figma.com/file/abc")).toEqual({
      url: "https://figma.com/file/abc",
      hostname: "figma.com",
    });
  });

  it("accepts http", () => {
    expect(normalizeUrl("http://internal.example.com/dash")?.url).toBe(
      "http://internal.example.com/dash",
    );
  });

  it("assumes https for a bare host", () => {
    expect(normalizeUrl("example.com/spec")?.url).toBe(
      "https://example.com/spec",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://example.com  ")?.url).toBe(
      "https://example.com",
    );
  });

  it("drops a bare trailing slash but keeps a real path", () => {
    expect(normalizeUrl("https://example.com/")?.url).toBe(
      "https://example.com",
    );
    expect(normalizeUrl("https://example.com/docs/")?.url).toBe(
      "https://example.com/docs/",
    );
  });

  it("keeps the query and fragment", () => {
    expect(normalizeUrl("https://example.com/a?b=1#c")?.url).toBe(
      "https://example.com/a?b=1#c",
    );
  });

  it("rejects a javascript URL", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data URL", () => {
    expect(normalizeUrl("data:text/html;base64,PHN2Zz4=")).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeUrl("ftp://example.com")).toBeNull();
  });

  it("rejects empty and unparseable input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("rejects a host with no dot, which is never an external resource", () => {
    expect(normalizeUrl("https://localhost")).toBeNull();
  });
});

describe("hostnameOf", () => {
  it("strips www", () => {
    expect(hostnameOf("https://www.github.com/a/b")).toBe("github.com");
  });

  it("returns the input when it cannot be parsed", () => {
    expect(hostnameOf("nonsense")).toBe("nonsense");
  });
});

describe("linkDisplayTitle", () => {
  it("prefers an explicit title", () => {
    expect(
      linkDisplayTitle({ title: "Design spec", url: "https://figma.com/x" }),
    ).toBe("Design spec");
  });

  it("ignores a blank title", () => {
    expect(linkDisplayTitle({ title: "  ", url: "https://figma.com/x" })).toBe(
      "figma.com/x",
    );
  });

  it("falls back to host and path so sibling links stay distinguishable", () => {
    expect(linkDisplayTitle({ url: "https://www.figma.com/file/abc" })).toBe(
      "figma.com/file/abc",
    );
  });

  it("falls back to the host alone when there is no path", () => {
    expect(linkDisplayTitle({ url: "https://example.com" })).toBe(
      "example.com",
    );
  });
});
