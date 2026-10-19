import { describe, expect, it } from "vitest";
import { buildUsageMap, markdownFor } from "./usage.js";

describe("buildUsageMap", () => {
  it("collects multiple refs in one note, listing the note once per file", () => {
    const map = buildUsageMap([
      {
        _id: "note:a",
        title: "A",
        body: "![x](inkdrop://file:one) ![y](inkdrop://file:two_2-b) ![x](inkdrop://file:one)",
      },
    ]);
    expect(map.get("file:one")).toEqual([{ id: "note:a", title: "A" }]);
    expect(map.get("file:two_2-b")).toEqual([{ id: "note:a", title: "A" }]);
  });

  it("lists every note using the same file", () => {
    const map = buildUsageMap([
      { _id: "note:a", title: "A", body: "inkdrop://file:one" },
      { _id: "note:b", title: "B", body: "inkdrop://file:one" },
    ]);
    expect(map.get("file:one")?.map((n) => n.id)).toEqual(["note:a", "note:b"]);
  });

  it("dedupes a note that appears twice but unions its refs", () => {
    const map = buildUsageMap([
      { _id: "note:a", title: "A", body: "inkdrop://file:one" },
      { _id: "note:a", title: "A", body: "inkdrop://file:one inkdrop://file:two" },
    ]);
    expect(map.get("file:one")).toHaveLength(1);
    expect(map.get("file:two")).toHaveLength(1);
  });

  it("ignores file: text without the inkdrop:// prefix", () => {
    const map = buildUsageMap([
      { _id: "note:a", title: "A", body: "see file:one and http://file:two" },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("markdownFor", () => {
  it("builds image markdown", () => {
    expect(markdownFor({ _id: "file:abc", name: "cat.png" })).toBe(
      "![cat.png](inkdrop://file:abc)",
    );
  });
});
