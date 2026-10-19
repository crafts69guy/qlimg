import { useEffect, useRef, useState } from "react";
import { useModal } from "inkdrop";
import type {
  Dialog as DialogType,
  Environment,
  NoteQueryResultIncludingDocs,
} from "@inkdropapp/types";
import { getEnv } from "./env.js";
import { buildUsageMap, markdownFor, type NoteRef, type UsageNote } from "./usage.js";

type ImageFile = Awaited<ReturnType<Environment["localDB"]["files"]["all"]>>[number];
type UsageMap = Map<string, NoteRef[]>;

const DELETE_DETAIL =
  "No note in the local database references this image. Notes not yet synced " +
  "from other devices and older note revisions are not checked and may still " +
  "use it. This cannot be undone.";

async function scanUsage(env: Environment): Promise<UsageMap> {
  const opts = { limit: false as const, includeDocs: true };
  const results = await Promise.all([
    env.localDB.notes.all(opts),
    env.localDB.notes.findInBook("trash", opts),
  ]);
  const notes: UsageNote[] = [];
  for (const res of results) {
    // includeDocs: true guarantees rows carry `doc`; the union type can't express that
    for (const row of (res as NoteQueryResultIncludingDocs).rows) {
      // A shape mismatch must fail loudly: silently scanning nothing marks every image unused.
      if (typeof row.doc?.body !== "string") throw new Error("note query returned no bodies");
      notes.push(row.doc);
    }
  }
  if (notes.length === 0) throw new Error("note query returned no notes");
  // store is typed Store<any, any>; editingNote is the open (possibly unsaved) Note or null
  const editing = env.store.getState().editingNote as UsageNote | null | undefined;
  if (editing) notes.push(editing);
  return buildUsageMap(notes);
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// `inkdrop://file:` URLs only resolve inside the preview renderer, so load the
// attachment the same way Inkdrop does.
// ponytail: data: URLs held while the dialog is open; switch to blob URLs if memory matters
async function loadDataUrl(fileId: string): Promise<string> {
  const doc = await getEnv().localDB.files.get(fileId, { attachments: true });
  const index = doc._attachments?.index;
  if (typeof index?.data !== "string") throw new Error(`no base64 attachment for ${fileId}`);
  return `data:${index.content_type};base64,${index.data}`;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** An image attachment that loads once it scrolls into view. */
function FileImage({ file }: { file: ImageFile }) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      loadDataUrl(file._id).then(
        (url) => !cancelled && setSrc(url),
        (err: unknown) => console.error(`qlimg: failed to load ${file._id}`, err),
      );
    });
    // The ref is attached before effects run.
    io.observe(ref.current as HTMLImageElement);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [file._id]);
  return <img ref={ref} src={src} alt={file.name} />;
}

export function GalleryDialog() {
  const modal = useModal();
  const [files, setFiles] = useState<ImageFile[]>([]);
  // null = usage unknown (scan failed): nothing counts as unused and delete stays disabled
  const [usage, setUsage] = useState<UsageMap | null>(new Map());
  const [query, setQuery] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    const env = getEnv();
    try {
      const all = await env.localDB.files.all();
      setFiles([...all].sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      env.notifications.addError("qlimg: failed to load images", {
        detail: errorDetail(err),
        dismissable: true,
      });
    }
    try {
      setUsage(await scanUsage(env));
    } catch (err) {
      setUsage(null);
      env.notifications.addError("qlimg: failed to scan notes, delete is disabled", {
        detail: errorDetail(err),
        dismissable: true,
      });
    }
  };

  const toggle = () => {
    if (modal.state.visible) return modal.close();
    setSelectedId(null);
    modal.show();
    void load();
  };
  // Latest toggle handler, so the command is registered once.
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    const sub = getEnv().commands.add(document.body, {
      "qlimg:toggle": () => toggleRef.current(),
    });
    return () => sub.dispose();
  }, []);

  const env = getEnv();
  const Dialog = env.components.getComponentClass("Dialog") as DialogType;

  const q = query.toLowerCase();
  const shown = files.filter(
    (f) =>
      f.name.toLowerCase().includes(q) && (!unusedOnly || (usage !== null && !usage.has(f._id))),
  );
  const selected = files.find((f) => f._id === selectedId);
  const usedIn = selected && usage ? (usage.get(selected._id) ?? []) : [];

  // Inkdrop keeps non-dismissable notifications on screen forever, even after its
  // 10s auto-dismiss timer fires, so every toast must opt in to `dismissable`.
  const copy = (file: ImageFile) => {
    env.clipboard.writeText(markdownFor(file));
    env.notifications.addInfo("Image markdown copied", { dismissable: true });
  };

  const insert = (file: ImageFile) => {
    const view = env.getActiveEditor();
    modal.close();
    if (!view) {
      env.clipboard.writeText(markdownFor(file));
      env.notifications.addInfo("No active editor: image markdown copied to clipboard", {
        dismissable: true,
      });
      return;
    }
    const md = markdownFor(file);
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: md }, selection: { anchor: from + md.length } });
    view.focus();
  };

  const openNote = (noteId: string) => {
    modal.close();
    env.commands.dispatch(document.body, "core:open-note", { noteId });
  };

  const remove = async (file: ImageFile) => {
    try {
      const { response } = await env.dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Delete"],
        cancelId: 0,
        defaultId: 0,
        message: `Delete "${file.name}"?`,
        detail: DELETE_DETAIL,
      });
      if (response !== 1) return;
      const fresh = await scanUsage(env);
      setUsage(fresh);
      if (fresh.has(file._id)) {
        env.notifications.addWarning("qlimg: image is now used by a note, not deleted", {
          dismissable: true,
        });
        return;
      }
      await env.localDB.files.remove(file._id);
      setFiles((fs) => fs.filter((f) => f._id !== file._id));
      setSelectedId(null);
    } catch (err) {
      env.notifications.addError("qlimg: failed to delete image", {
        detail: errorDetail(err),
        dismissable: true,
      });
    }
  };

  return (
    <Dialog
      {...modal.state}
      className="qlimg-dialog"
      large
      onBackdropClick={modal.close}
      onEscKeyDown={modal.close}
    >
      <Dialog.Title>Image Gallery ({shown.length})</Dialog.Title>
      <Dialog.Content className="qlimg-content">
        <div className="qlimg-toolbar">
          <label className="qlimg-search">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" />
              <path d="m11 11 3.5 3.5" />
            </svg>
            <input
              type="search"
              placeholder="Search images"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="ui toggle checkbox">
            <input
              id="qlimg-unused-only"
              type="checkbox"
              checked={unusedOnly}
              onChange={(e) => setUnusedOnly(e.target.checked)}
            />
            <label htmlFor="qlimg-unused-only">Unused only</label>
          </div>
        </div>
        <div className="qlimg-body">
          <div className="qlimg-grid">
            {shown.map((f) => (
              <button
                key={f._id}
                type="button"
                title={f.name}
                className={`qlimg-thumb${f._id === selectedId ? " selected" : ""}`}
                onClick={() => setSelectedId(f._id)}
                onDoubleClick={() => insert(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insert(f);
                  }
                }}
              >
                <FileImage file={f} />
                <span className="qlimg-caption">{f.name}</span>
                {usage && !usage.has(f._id) && <span className="qlimg-badge">Unused</span>}
              </button>
            ))}
            {shown.length === 0 && <div className="qlimg-empty">No images found</div>}
          </div>
          {selected ? (
            <aside className="qlimg-detail">
              <div className="qlimg-preview">
                <FileImage key={selected._id} file={selected} />
              </div>
              <div className="qlimg-name">{selected.name}</div>
              <div className="qlimg-chips">
                <span className="qlimg-chip">
                  {selected.contentType
                    .replace(/^image\//, "")
                    .replace("+xml", "")
                    .toUpperCase()}
                </span>
                <span className="qlimg-chip">{formatSize(selected.contentLength)}</span>
                <span className="qlimg-chip">
                  {new Date(selected.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="qlimg-section-title">
                {usage
                  ? `Used in ${usedIn.length} note${usedIn.length === 1 ? "" : "s"}`
                  : "Usage unknown"}
              </div>
              <ul className="qlimg-notes">
                {usedIn.map((n) => (
                  <li key={n.id}>
                    <a href="#" onClick={(e) => (e.preventDefault(), openNote(n.id))}>
                      {n.title || "Untitled"}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="qlimg-actions">
                <button
                  type="button"
                  className="ui primary button"
                  onClick={() => insert(selected)}
                >
                  Insert
                </button>
                <button type="button" className="ui button" onClick={() => copy(selected)}>
                  Copy markdown
                </button>
                <button
                  type="button"
                  className="ui basic negative button"
                  disabled={!usage || usedIn.length > 0}
                  onClick={() => void remove(selected)}
                >
                  Delete
                </button>
              </div>
            </aside>
          ) : (
            <aside className="qlimg-detail qlimg-placeholder">Select an image to preview</aside>
          )}
        </div>
      </Dialog.Content>
      <Dialog.Actions>
        <button type="button" className="ui button" onClick={modal.close}>
          Close
        </button>
      </Dialog.Actions>
    </Dialog>
  );
}
