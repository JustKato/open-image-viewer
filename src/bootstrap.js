const TEMPLATE = document.createElement(`template`);
TEMPLATE.innerHTML = `<style>${STYLES}</style>\n` + HTML
    .replace(/\{\{DEFAULT_VIEWER_TITLE\}\}/g, DEFAULT_VIEWER_TITLE)
    .replace(/\{\{DEFAULT_RAW_LABEL\}\}/g, DEFAULT_RAW_LABEL);

window.customElements.define(ELEMENT_NAME, OpenImageViewerElement);
window.OpenImageViewerElement = OpenImageViewerElement;
})();
