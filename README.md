# qlimg

An Inkdrop v6 plugin that opens an image gallery modal for every image stored in your Inkdrop database. From the gallery you can:

- search images and preview them
- insert an image into the current note, or copy its markdown
- see which notes use an image
- delete images that no note uses

## Install

```sh
npm install
npm run build
ln -s (pwd) ~/Library/Application\ Support/inkdrop/packages/qlimg   # fish
# or: ipm link
```

Reload Inkdrop afterwards (`window:reload`).

## Usage

Press `ctrl-alt-i`, or choose **Plugins → Image Gallery**. Either one runs the `qlimg:toggle` command.

- **Search:** case-insensitive match on the file name. **Unused only** hides images that any note references.
- **Click** an image to select it. **Double-click** it or press **Enter** to insert `![name](inkdrop://file:…)` at the cursor. If no editor is active (for example in preview mode), the markdown goes to the clipboard instead.
- **Used in N notes:** click a note to open it.
- **Copy markdown:** copies the image markdown to the clipboard.

## Keymap

The default binding is `ctrl-alt-i` on `body`. You can override it in `keymap.json`:

```json
{ "body": { "cmd-shift-i": "qlimg:toggle" } }
```

## Deleting images

The **Delete** button is only enabled for images that no note references. Before it deletes anything, the gallery asks for confirmation and scans every note again, so a usage added while the gallery was open still blocks the delete.

**Caveat:** the scan only covers the **local** database, meaning current notes, trashed notes, and the note you are editing. It cannot see notes from other devices that haven't synced yet, or old note revisions. If an image is referenced only there, it will look unused, and deleting it breaks those references. Deletion cannot be undone.

## Development

```sh
npm run build      # tsc -> lib/
npm test           # vitest + v8 coverage (98% threshold)
npm run lint       # oxlint
npm run fmt:check  # oxfmt
```
