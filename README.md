# Open Image Viewer

![Preview](./preview.gif)

Web component image viewer used on my personal website [danlegt.com](https://danlegt.com/art). Built as a single script that registers the `<open-image-viewer>` custom element.

## Source layout

- **`src/`** – component source only (no build tooling)
  - `styles.css` – component styles
  - `template.html` – shadow DOM markup (placeholders: `{{DEFAULT_VIEWER_TITLE}}`, `{{DEFAULT_RAW_LABEL}}`)
  - `index.js` – IIFE entry, constants, early return
  - `utils.js` – pure helpers (clamp, formatDateDisplay, normalizeItem, etc.), with JSDoc where useful
  - `OpenImageViewerElement.js` – `OpenImageViewerElement` class
  - `bootstrap.js` – template creation and `customElements.define`
- **`build/`** – build scripts and tooling
  - `build.js` – concatenates `src/`, injects CSS/HTML, writes and minifies to `dist/`
- **`dist/`** – build output (generated)
  - `open-image-viewer.js` – concatenated bundle
  - `open-image-viewer.min.js` – minified bundle (use this in production)

## Build

```bash
npm install
npm run build
```

Use `dist/open-image-viewer.min.js` on your site (single script, no separate CSS/HTML).

---

## Usage (wiki)

### Quick start

Include the script and add one viewer to the page. Open it by setting the `open` attribute or calling `show()`.

```html
<script src="dist/open-image-viewer.min.js"></script>

<open-image-viewer id="viewer"></open-image-viewer>

<script>
  const viewer = document.getElementById('viewer');
  viewer.items = [
    { src: '/images/photo.jpg', title: 'My photo', description: 'A nice shot.' }
  ];
  viewer.show(0);
</script>
```

---

### 1. Single image via attributes

When you don’t set the `items` property, the viewer builds a single item from attributes. Useful for one-off viewers or server-rendered content.

**Required:** at least one of `src` or `raw-src` (the “raw” or original file URL).

**Optional (metadata / display):**

| Attribute        | Purpose |
|-----------------|--------|
| `viewer-src`    | URL shown in the viewer (defaults to raw URL if omitted) |
| `thumb-src`     | Thumbnail in the sidebar |
| `title` / `item-title` | Title in header and sidebar |
| `name` / `raw-name`    | File name in meta |
| `display-name`  | Display filename when different from raw |
| `description`   | Comments / caption (sidebar) |
| `group` / `album` | Album / collection label |
| `date`          | Date string (formatted in sidebar) |
| `views`         | View count |
| `kind`          | `"image"` or `"video"` (otherwise inferred from URL) |
| `alt`           | Alt text for the main image |

**Example: image with full metadata**

```html
<open-image-viewer
  id="v1"
  src="/downloads/sunset.png"
  viewer-src="/thumbs/sunset-1200.jpg"
  thumb-src="/thumbs/sunset-400.jpg"
  item-title="Sunset at the pier"
  description="Taken last summer."
  group="Landscapes"
  date="2024-07-15"
  views="42"
></open-image-viewer>

<script>
  document.getElementById('v1').setAttribute('open', '');
</script>
```

**Example: video**

```html
<open-image-viewer
  src="/media/demo.mp4"
  kind="video"
  item-title="Demo video"
  thumb-src="/media/demo-poster.jpg"
></open-image-viewer>
```

---

### 2. Gallery via the `items` property

Set `items` to an array of objects. Each item can use many property names; the viewer normalizes them internally.

**Minimum:** each item must have a source URL. You can use any of: `src`, `raw`, `rawSrc`, `original`, `originalSrc`, or (inside `sources`) `raw`, `original`, `base`.

**Optional per item:** `viewer` / `viewerSrc` / `display` / `displaySrc` / `preview`, `thumb` / `thumbSrc` / `thumbnail` / `thumbnailSrc` / `poster`, `title` / `label`, `name` / `rawName`, `displayName` / `viewerName` / `previewName`, `description` / `caption` / `notes`, `group` / `album` / `collection` / `folder`, `date` / `createdAt` / `timestamp`, `views`, `kind`, `alt`, `id` / `key`.

**Flat shape:**

```javascript
viewer.items = [
  { src: '/a.jpg', title: 'First', description: 'Caption A' },
  { src: '/b.jpg', title: 'Second', description: 'Caption B' },
  { src: '/c.mp4', kind: 'video', title: 'Clip' }
];
viewer.show(1);
```

**With `sources` (e.g. from an API):**

```javascript
viewer.items = [
  {
    title: 'High-res scan',
    sources: {
      raw: 'https://cdn.example.com/original.png',
      viewer: 'https://cdn.example.com/preview-1200.jpg',
      thumb: 'https://cdn.example.com/thumb-400.jpg'
    },
    description: 'Scanned at 600 DPI',
    group: 'Archives',
    date: '2024-01-10',
    views: 128
  }
];
```

**Single item via `item` (convenience):**

```javascript
viewer.item = { src: '/only.jpg', title: 'Solo' };
viewer.show();
```

---

### 3. Opening and closing

- **Attribute:** set or remove the `open` attribute to show or hide the dialog.
- **Property:** `viewer.open = true` or `viewer.open = false`.
- **Methods:** `viewer.show(index?)` opens (and optionally jumps to `index`); `viewer.close(reason?)` closes.

`show(index, options)` can take a source label for events:

```javascript
viewer.show(2, { source: 'gallery_click' });
```

Closing with a reason (e.g. for analytics):

```javascript
viewer.close('escape');   // user pressed Escape
viewer.close('backdrop'); // clicked overlay
viewer.close('close_button');
viewer.close('history_back');
viewer.close('api');      // default
```

**Example: open from thumbnails**

```html
<div class="gallery">
  <img src="/thumb1.jpg" data-index="0" alt="Image 1">
  <img src="/thumb2.jpg" data-index="1" alt="Image 2">
</div>
<open-image-viewer id="viewer"></open-image-viewer>

<script>
  const viewer = document.getElementById('viewer');
  viewer.items = [ { src: '/img1.jpg', title: '1' }, { src: '/img2.jpg', title: '2' } ];

  document.querySelectorAll('.gallery img').forEach(img => {
    img.addEventListener('click', () => viewer.show(parseInt(img.dataset.index, 10)));
  });
</script>
```

---

### 4. Navigation (prev/next)

- **Methods:** `viewer.next(source?)` and `viewer.previous(source?)` move by one. Optional `source` is passed in events (e.g. `'button'`, `'keyboard'`, `'wheel'`).
- **Property:** `viewer.index` gets or sets the current index (0-based). Setting it updates the view; if the viewer is open, it also emits `viewer-change`.
- **No loop:** add the `no-loop` attribute so prev/next don’t wrap at the ends.

```html
<open-image-viewer id="v" no-loop>
  <!-- first item: previous disabled; last item: next disabled -->
</open-image-viewer>
```

```javascript
viewer.index = 3;
viewer.next('button');
viewer.previous('keyboard');
```

---

### 5. Events

All events bubble and are composed (so they cross shadow DOM). Listen on the `<open-image-viewer>` node.

| Event                 | When | `detail` |
|-----------------------|------|----------|
| `viewer-open`         | Viewer becomes visible | `{ index, item, source }` |
| `viewer-close`         | Viewer is hidden       | `{ index, item, reason }` |
| `viewer-change`       | Current item changed (nav or index set) | `{ index, item, source }` |
| `viewer-raw-request`  | User chose “Open Raw”  | `{ index, item, source, url }` — **cancelable** |
| `viewer-media-error`  | Image/video or thumbnail failed to load | `{ index, item, target }` (`'display'` or `'thumbnail'`) |

**Example: analytics**

```javascript
viewer.addEventListener('viewer-open', (e) => {
  console.log('Opened', e.detail.index, e.detail.item.title, 'via', e.detail.source);
});
viewer.addEventListener('viewer-close', (e) => {
  console.log('Closed', e.detail.reason);
});
viewer.addEventListener('viewer-change', (e) => {
  console.log('Now at', e.detail.index, e.detail.item.title);
});
```

**Example: handle “Open Raw” yourself (e.g. download)**

```javascript
viewer.addEventListener('viewer-raw-request', (e) => {
  e.preventDefault();
  const a = document.createElement('a');
  a.href = e.detail.url;
  a.download = e.detail.item.rawName || 'download';
  a.click();
});
```

If you don’t call `preventDefault()`, the viewer opens the raw URL according to `raw-target` (see below).

---

### 6. Slots: extra actions

The sidebar has a slot `name="actions"` for your own buttons (before the built-in “Open Raw” button).

```html
<open-image-viewer id="v">
  <button slot="actions" type="button">Download</button>
  <button slot="actions" type="button">Share</button>
</open-image-viewer>
```

Slotted content is included in the focus trap (Tab cycles through viewer controls and your buttons).

---

### 7. Viewer title and raw button

- **`viewer-title`** – Window title and aria-label (default: “Image Viewer”).
- **`raw-label`** – Label of the “Open Raw” button (default: “Open Raw”).
- **`raw-target`** – Where the raw URL opens when the user doesn’t prevent `viewer-raw-request`:
  - `_blank` (default) – new tab
  - `_self` – same window
  - Any other string – window name for `window.open(url, name)`

```html
<open-image-viewer
  viewer-title="Gallery"
  raw-label="Download original"
  raw-target="_blank"
></open-image-viewer>
```

---

### 8. History (back button closes viewer)

Add the `history` attribute so that opening the viewer pushes a history entry; when the user presses the browser back button, the viewer closes and state is popped.

```html
<open-image-viewer id="v" history></open-image-viewer>
```

```javascript
viewer.items = myItems;
viewer.show(0);
// User hits Back → viewer closes and history entry is removed
```

---

### 9. Themes

- **Default (no theme)** or **`theme="win98"`** – Windows 98–style chrome (no radius, silver/gray, pixel fonts if available).
- **`theme="base"`** – Modern look (rounded, teal accent, default styles).

```html
<open-image-viewer theme="base"></open-image-viewer>
<open-image-viewer theme="win98"></open-image-viewer>
```

---

### 10. Keyboard and focus

- **Escape** – closes the viewer.
- **Arrow Left / Right** – previous / next item (no effect when focus is in an editable field or the video controls).
- **Tab** – cycles focus within the viewer (title bar, prev/next, tabs, raw button, and any slotted actions). Focus is trapped while open; restoring focus on close goes back to the element that had it before open.

---

### 11. Minimal and full examples

**Minimal: one image, open on load**

```html
<script src="dist/open-image-viewer.min.js"></script>
<open-image-viewer id="v" src="/photo.jpg" open></open-image-viewer>
```

**Full: gallery, history, custom title and raw button, custom action, events**

```html
<script src="dist/open-image-viewer.min.js"></script>

<open-image-viewer
  id="viewer"
  viewer-title="Art gallery"
  raw-label="Original file"
  raw-target="_blank"
  history
  theme="base"
>
  <button slot="actions" type="button">Copy link</button>
</open-image-viewer>

<script>
  const viewer = document.getElementById('viewer');
  viewer.items = [
    { src: '/art/a.png', title: 'Piece A', group: '2024', description: 'First piece.' },
    { src: '/art/b.png', title: 'Piece B', group: '2024', description: 'Second piece.' }
  ];

  viewer.addEventListener('viewer-open', (e) => console.log('Opened', e.detail.index));
  viewer.addEventListener('viewer-close', (e) => console.log('Closed', e.detail.reason));

  viewer.querySelector('[slot="actions"]').addEventListener('click', () => {
    const item = viewer.items[viewer.index];
    if (item) navigator.clipboard.writeText(item.rawSrc || item.viewerSrc || item.src);
  });

  viewer.show(0);
</script>
```

---

## Versioning with Git tags

1. Bump version and create a tag (choose one):
   - **Patch:** `npm version patch`
   - **Minor:** `npm version minor`
   - **Major:** `npm version major`

2. Or create a tag manually:
   ```bash
   npm run build
   git add dist && git add -u
   git commit -m "Release v1.0.1"
   git tag v1.0.1
   ```

3. Push commits and tags:
   ```bash
   git push && git push --tags
   ```

The `npm version` script runs `npm run build` and stages `dist/` and any modified files before the version commit, so the tag always points at a commit that includes the built files.

# Disclaimer

The build process was vibe coded as I am not too familiar with packaging JS/CSS/HTML like this, and I really wanted to play with Web Components.