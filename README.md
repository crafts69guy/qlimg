# qlimg

**An image gallery for [Inkdrop](https://www.inkdrop.app/).** Browse every image in your notes, drop one into the note you're editing, and safely clean up the ones nothing uses anymore.

![The qlimg image gallery in Inkdrop (thumbnails blurred)](https://raw.githubusercontent.com/crafts69guy/qlimg/production/docs/showcase.png)

- **Browse** all images in one grid, newest first, with thumbnails that load lazily as you scroll
- **Search** by file name, or filter to **unused** images only
- **Insert** into the current note with a double-click or <kbd>Enter</kbd>
- **Trace usage**: see which notes reference an image and jump to them
- **Clean up**: delete orphaned images, guarded by a fresh usage check

> Requires Inkdrop **v6** or later.

## Install

```fish
ipm install qlimg
```

<details>
<summary>From source</summary>

```fish
git clone https://github.com/crafts69guy/qlimg.git
cd qlimg
npm install
npm run build
ipm link
```

Then reload Inkdrop (**Developer → Reload**, or run `window:reload`).

</details>

## Usage

Open the gallery with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd> or **Plugins → Image Gallery**.

| Action                   | How                                           |
| ------------------------ | --------------------------------------------- |
| Preview an image         | Click it                                      |
| Insert at the cursor     | Double-click, <kbd>Enter</kbd>, or **Insert** |
| Copy as Markdown         | **Copy markdown**                             |
| Open a note that uses it | Click the note under **Used in N notes**      |
| Delete it                | **Delete** (only for unused images)           |

Images are inserted as `![name](inkdrop://file:…)`. If no editor is active, for example in preview mode, the Markdown is copied to the clipboard instead.

### Custom shortcut

The gallery is bound to the `qlimg:toggle` command. To rebind it, add this to your `keymap.json`:

```json
{
  "body": {
    "cmd-shift-i": "qlimg:toggle"
  }
}
```

## Deleting images safely

**Delete** only works on images that no note references. Before deleting, qlimg asks you to confirm and then rescans every note, so an image that became used while the gallery was open is kept.

> [!WARNING]
> The usage scan only covers your **local** database: current notes, trashed notes, and the note you're editing. It can't see notes from other devices that haven't synced yet, or older note revisions. An image referenced only there will look unused, and deleting it breaks those references. **Deletion can't be undone.**

If qlimg can't scan your notes, it shows an error and disables deletion entirely rather than guessing.

## Development

```fish
npm run build      # compile TypeScript to lib/
npm test           # vitest with v8 coverage (98% threshold)
npm run lint       # oxlint
npm run fmt:check  # oxfmt
```

Source lives in `src/`. The gallery UI is `src/gallery-dialog.tsx`, and the usage scan is `src/usage.ts`.

## License

MIT
