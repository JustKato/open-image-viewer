(function() {
const ELEMENT_NAME = `open-image-viewer`;
const DEFAULT_VIEWER_TITLE = `Image Viewer`;
const DEFAULT_RAW_LABEL = `Open Raw`;

if (!window.customElements || window.customElements.get(ELEMENT_NAME)) {
    return;
}

/* BUILD:INJECT_STYLES */
/* BUILD:INJECT_HTML */
