import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryDialog } from "./gallery-dialog.js";
import { setEnv } from "./env.js";
import { makeEnv } from "../test/fake-env.js";

const files = [
  { _id: "file:old", name: "Old.png", contentType: "image/png", contentLength: 2048, createdAt: 1 },
  {
    _id: "file:new",
    name: "new.jpg",
    contentType: "image/jpeg",
    contentLength: 1024,
    createdAt: 3,
  },
  {
    _id: "file:orphan",
    name: "orphan.gif",
    contentType: "image/gif",
    contentLength: 512,
    createdAt: 2,
  },
  {
    _id: "file:trashed",
    name: "trashed.png",
    contentType: "image/png",
    contentLength: 10,
    createdAt: 0,
  },
];
const notes = [{ _id: "note:a", title: "Alpha", body: "![x](inkdrop://file:old)" }];
const trash = [{ _id: "note:t", title: "", body: "![x](inkdrop://file:trashed)" }];

let ctx: ReturnType<typeof makeEnv>;

function setup(extra: Partial<Parameters<typeof makeEnv>[0]> = {}) {
  ctx = makeEnv({ files, notes, trash, ...extra });
  setEnv(ctx.env);
  render(<GalleryDialog />);
}

async function open() {
  act(() => ctx.fake.commandMaps[0]["qlimg:toggle"]());
  await screen.findByText("Image Gallery (4)");
}

const thumb = (name: string) => screen.getByTitle(name);
const names = () => screen.getAllByRole("img").map((i) => i.getAttribute("alt"));

// Fires synchronously on observe(), as if the element were (or weren't) on screen.
let onScreen = true;
class FakeIntersectionObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.cb([{ isIntersecting: onScreen }]);
  }
  disconnect() {}
}

beforeEach(() => {
  onScreen = true;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  setup();
});
afterEach(() => {
  cleanup();
  setEnv(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GalleryDialog", () => {
  it("opens via command, sorts newest first, and toggles closed", async () => {
    expect(screen.queryByRole("dialog")).toBeNull();
    await open();
    expect(names()).toEqual(["new.jpg", "orphan.gif", "Old.png", "trashed.png"]);
    await waitFor(() =>
      expect(thumb("new.jpg").querySelector("img")?.getAttribute("src")).toBe(
        "data:image/png;base64,b64-file:new",
      ),
    );
    expect(ctx.fake.localDB.files.get).toHaveBeenCalledWith("file:new", { attachments: true });
    act(() => ctx.fake.commandMaps[0]["qlimg:toggle"]());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports load errors", async () => {
    ctx.fake.localDB.files.all.mockRejectedValueOnce(new Error("boom"));
    act(() => ctx.fake.commandMaps[0]["qlimg:toggle"]());
    await waitFor(() =>
      expect(ctx.fake.notifications.addError).toHaveBeenCalledWith("qlimg: failed to load images", {
        detail: "boom",
        dismissable: true,
      }),
    );
  });

  describe("image loading", () => {
    it("waits until the image is on screen", async () => {
      onScreen = false;
      await open();
      expect(ctx.fake.localDB.files.get).not.toHaveBeenCalled();
    });

    it("logs attachments that fail to load", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      ctx.fake.localDB.files.get.mockResolvedValue({ _attachments: { index: { data: {} } } });
      ctx.fake.localDB.files.get.mockResolvedValueOnce({});
      await open();
      await waitFor(() => expect(log).toHaveBeenCalledTimes(4));
      expect(String(log.mock.calls[0][1])).toMatch(/no base64 attachment/);
      expect(thumb("new.jpg").querySelector("img")?.getAttribute("src")).toBeNull();
    });

    it("ignores loads that finish after unmount", async () => {
      let resolve = (_v: { _attachments?: unknown }) => {};
      ctx.fake.localDB.files.get.mockReturnValue(new Promise((r) => (resolve = r)));
      await open();
      cleanup();
      resolve({ _attachments: { index: { content_type: "image/png", data: "late" } } });
      await Promise.resolve();
    });
  });

  describe("usage scan failures disable delete", () => {
    async function openWithBadScan() {
      await open();
      await waitFor(() =>
        expect(ctx.fake.notifications.addError).toHaveBeenCalledWith(
          "qlimg: failed to scan notes, delete is disabled",
          expect.objectContaining({ dismissable: true }),
        ),
      );
      fireEvent.click(thumb("orphan.gif"));
      expect(screen.getByText("Usage unknown")).toBeTruthy();
      expect(screen.getByText("Delete")).toHaveProperty("disabled", true);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(names()).toEqual(["orphan.gif"]); // only the detail pane image remains
    }

    it("when notes come back without bodies", async () => {
      ctx.fake.localDB.notes.all.mockResolvedValueOnce({ includeDocs: true, rows: [{}] } as never);
      await openWithBadScan();
    });

    it("when no notes come back at all", async () => {
      cleanup();
      setup({ notes: [], trash: [] });
      await openWithBadScan();
    });
  });

  it("filters by search (case-insensitive) and unused only", async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText("Search images"), { target: { value: "OLD" } });
    expect(names()).toEqual(["Old.png"]);
    fireEvent.change(screen.getByPlaceholderText("Search images"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(names()).toEqual(["new.jpg", "orphan.gif"]);
  });

  it("shows placeholder, empty state, badges, plural counts and MB sizes", async () => {
    cleanup();
    setup({
      files: [
        { ...files[2], name: "big.svg", contentType: "image/svg+xml", contentLength: 3 << 20 },
      ],
    });
    act(() => ctx.fake.commandMaps[0]["qlimg:toggle"]());
    await screen.findByText("Image Gallery (1)");
    expect(screen.getByText("Select an image to preview")).toBeTruthy();
    await screen.findByText("Unused");
    fireEvent.click(thumb("big.svg"));
    expect(screen.getByText("SVG")).toBeTruthy();
    expect(screen.getByText("3.0 MB")).toBeTruthy();
    expect(screen.getByText("Used in 0 notes")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search images"), { target: { value: "zzz" } });
    expect(screen.getByText("No images found")).toBeTruthy();
  });

  it("counts the unsaved editing note as usage", async () => {
    cleanup();
    setup({ editingNote: { _id: "note:e", title: "Editing", body: "inkdrop://file:new" } });
    await open();
    fireEvent.click(thumb("new.jpg"));
    expect(screen.getByText("Used in 1 note")).toBeTruthy();
  });

  it("selects an image and shows details and used-in notes", async () => {
    await open();
    fireEvent.click(thumb("Old.png"));
    expect(thumb("Old.png").className).toContain("selected");
    expect(screen.getByText("Used in 1 note")).toBeTruthy();
    expect(screen.getByText("PNG")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.getByText("Delete")).toHaveProperty("disabled", true);

    fireEvent.click(thumb("trashed.png"));
    expect(screen.getByText("Untitled")).toBeTruthy();
  });

  it("opens a note from the used-in list and closes", async () => {
    await open();
    fireEvent.click(thumb("Old.png"));
    fireEvent.click(screen.getByText("Alpha"));
    expect(ctx.fake.commands.dispatch).toHaveBeenCalledWith(document.body, "core:open-note", {
      noteId: "note:a",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("inserts at the cursor via button, double-click, and Enter", async () => {
    await open();
    fireEvent.click(thumb("new.jpg"));
    fireEvent.click(screen.getByText("Insert"));
    const md = "![new.jpg](inkdrop://file:new)";
    expect(ctx.fake.editor.dispatch).toHaveBeenCalledWith({
      changes: { from: 2, to: 4, insert: md },
      selection: { anchor: 2 + md.length },
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await open();
    fireEvent.doubleClick(thumb("new.jpg"));
    await open();
    fireEvent.keyDown(thumb("new.jpg"), { key: "a" });
    fireEvent.keyDown(thumb("new.jpg"), { key: "Enter" });
    expect(ctx.fake.editor.dispatch).toHaveBeenCalledTimes(3);
    expect(ctx.fake.editor.focus).toHaveBeenCalledTimes(3);
  });

  it("copies markdown when there is no editor", async () => {
    ctx.fake.getActiveEditor.mockReturnValue(null);
    await open();
    fireEvent.click(thumb("new.jpg"));
    fireEvent.click(screen.getByText("Insert"));
    expect(ctx.fake.clipboard.writeText).toHaveBeenCalledWith("![new.jpg](inkdrop://file:new)");
    expect(ctx.fake.notifications.addInfo).toHaveBeenCalledWith(
      "No active editor: image markdown copied to clipboard",
      { dismissable: true },
    );
  });

  it("copies markdown", async () => {
    await open();
    fireEvent.click(thumb("new.jpg"));
    fireEvent.click(screen.getByText("Copy markdown"));
    expect(ctx.fake.clipboard.writeText).toHaveBeenCalledWith("![new.jpg](inkdrop://file:new)");
    expect(ctx.fake.notifications.addInfo).toHaveBeenCalledWith("Image markdown copied", {
      dismissable: true,
    });
  });

  it("closes from the Close button", async () => {
    await open();
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("delete", () => {
    async function clickDelete(beforeClick = () => {}) {
      await open();
      fireEvent.click(thumb("orphan.gif"));
      beforeClick();
      fireEvent.click(screen.getByText("Delete"));
    }

    it("does nothing when cancelled", async () => {
      ctx.fake.dialog.showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
      await clickDelete();
      await waitFor(() => expect(ctx.fake.dialog.showMessageBox).toHaveBeenCalled());
      const call = ctx.fake.dialog.showMessageBox.mock.calls[0] as unknown as [{ detail: string }];
      expect(call[0].detail).toMatch(/not yet synced/);
      expect(ctx.fake.localDB.files.remove).not.toHaveBeenCalled();
    });

    it("re-scans and removes when confirmed", async () => {
      await clickDelete();
      await waitFor(() =>
        expect(ctx.fake.localDB.files.remove).toHaveBeenCalledWith("file:orphan"),
      );
      await waitFor(() => expect(screen.queryByTitle("orphan.gif")).toBeNull());
      expect(ctx.fake.localDB.notes.all).toHaveBeenCalledTimes(2);
    });

    it("aborts when the fresh scan finds a usage", async () => {
      // the map shown is stale; the fresh re-scan sees a new reference
      await clickDelete(() =>
        ctx.fake.localDB.notes.all.mockResolvedValueOnce({
          includeDocs: true,
          rows: [{ doc: { _id: "note:z", title: "Z", body: "inkdrop://file:orphan" } }],
        }),
      );
      await waitFor(() =>
        expect(ctx.fake.notifications.addWarning).toHaveBeenCalledWith(
          "qlimg: image is now used by a note, not deleted",
          { dismissable: true },
        ),
      );
      expect(ctx.fake.localDB.files.remove).not.toHaveBeenCalled();
      expect(screen.getByText("Used in 1 note")).toBeTruthy();
    });

    it("reports remove() errors", async () => {
      ctx.fake.localDB.files.remove.mockRejectedValueOnce("locked");
      await clickDelete();
      await waitFor(() =>
        expect(ctx.fake.notifications.addError).toHaveBeenCalledWith(
          "qlimg: failed to delete image",
          {
            detail: "locked",
            dismissable: true,
          },
        ),
      );
    });
  });

  it("disposes the command on unmount", () => {
    const sub = ctx.fake.commands.add.mock.results[0].value as { dispose: () => void };
    cleanup();
    expect(sub.dispose).toHaveBeenCalled();
  });
});
