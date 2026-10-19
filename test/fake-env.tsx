import type { ReactNode } from "react";
import { vi } from "vitest";
import type { Environment } from "@inkdropapp/types";

type Note = { _id: string; title: string; body: string };
type File = {
  _id: string;
  name: string;
  contentType: string;
  contentLength: number;
  createdAt: number;
};

const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const Dialog = Object.assign(
  ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
    visible ? <div role="dialog">{children}</div> : null,
  { Title: Passthrough, Content: Passthrough, Actions: Passthrough },
);

export function makeEnv(opts: {
  files: File[];
  notes: Note[];
  trash?: Note[];
  editingNote?: Note | null;
}) {
  const commandMaps: Record<string, () => void>[] = [];
  const editor = {
    state: { selection: { main: { from: 2, to: 4 } } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  };
  const rows = (notes: Note[]) => ({ includeDocs: true, rows: notes.map((doc) => ({ doc })) });
  const fake = {
    commandMaps,
    editor,
    localDB: {
      files: {
        all: vi.fn(async () => opts.files),
        get: vi.fn(async (id: string): Promise<{ _attachments?: unknown }> => ({
          _attachments: { index: { content_type: "image/png", data: `b64-${id}` } },
        })),
        remove: vi.fn(async () => ({ ok: true })),
      },
      notes: {
        all: vi.fn(async () => rows(opts.notes)),
        findInBook: vi.fn(async () => rows(opts.trash ?? [])),
      },
    },
    store: { getState: () => ({ editingNote: opts.editingNote ?? null }) },
    getActiveEditor: vi.fn((): typeof editor | null => editor),
    clipboard: { writeText: vi.fn() },
    dialog: { showMessageBox: vi.fn(async () => ({ response: 1, checkboxChecked: false })) },
    notifications: { addInfo: vi.fn(), addWarning: vi.fn(), addError: vi.fn() },
    commands: {
      add: vi.fn((_target: Element, map: Record<string, () => void>) => {
        commandMaps.push(map);
        return { dispose: vi.fn() };
      }),
      dispatch: vi.fn(),
    },
    components: {
      getComponentClass: vi.fn(() => Dialog),
      registerClass: vi.fn(),
      deleteClass: vi.fn(),
    },
    layouts: { addComponentToLayout: vi.fn(), removeComponentFromLayout: vi.fn() },
  };
  // Only the members the plugin touches are faked; the rest of Environment is unused.
  return { fake, env: fake as unknown as Environment };
}
