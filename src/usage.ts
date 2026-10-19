/** Matches `inkdrop://file:<id>` references and captures the file `_id`. */
export const FILE_REF_RE = /inkdrop:\/\/(file:[A-Za-z0-9_-]+)/g;

/** The minimal note shape the usage scan needs. */
export interface UsageNote {
  _id: string;
  title: string;
  body: string;
}

/** A note that references a file. */
export interface NoteRef {
  id: string;
  title: string;
}

/** The minimal file shape needed to build its markdown. */
export interface ImageRef {
  _id: string;
  name: string;
}

/**
 * Map every referenced file `_id` to the notes that reference it.
 *
 * Notes appearing more than once (e.g. saved copy plus the unsaved editing
 * copy) are merged by `_id`: refs from every copy count, the note is listed once.
 *
 * @param notes - Notes to scan; duplicates by `_id` are allowed.
 * @returns Map of file `_id` to the unique notes referencing it.
 */
export function buildUsageMap(notes: Iterable<UsageNote>): Map<string, NoteRef[]> {
  // ponytail: full scan of all note bodies on every open; cache keyed by db change events if it gets slow on large DBs
  const usage = new Map<string, NoteRef[]>();
  for (const note of notes) {
    for (const [, fileId] of note.body.matchAll(FILE_REF_RE)) {
      const refs = usage.get(fileId) ?? [];
      if (!refs.some((r) => r.id === note._id)) refs.push({ id: note._id, title: note.title });
      usage.set(fileId, refs);
    }
  }
  return usage;
}

/**
 * Markdown image syntax for a file.
 *
 * @param file - The file to reference.
 * @returns `![name](inkdrop://file:id)`.
 */
export function markdownFor(file: ImageRef): string {
  return `![${file.name}](inkdrop://${file._id})`;
}
