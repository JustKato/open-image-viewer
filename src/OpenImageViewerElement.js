/**
 * Full-screen image/video viewer dialog: gallery navigation, metadata panel, optional history integration.
 * Items can be set via attributes (single item) or the `items` property (array). Use `open` attribute or
 * .show(index) to open; listen for viewer-open, viewer-close, viewer-change, viewer-raw-request, viewer-media-error.
 */
class OpenImageViewerElement extends HTMLElement {
    static get observedAttributes() {
        return [
            `album`,
            `alt`,
            `date`,
            `description`,
            `display-name`,
            `group`,
            `history`,
            `index`,
            `item-title`,
            `kind`,
            `name`,
            `open`,
            `raw-label`,
            `raw-name`,
            `raw-src`,
            `src`,
            `thumb-src`,
            `theme`,
            `title`,
            `viewer-src`,
            `viewer-title`,
            `views`
        ];
    }

    constructor() {
        super();

        this.attachShadow({ mode: `open` });
        this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

        this._items = [];
        this._index = 0;
        this._activeTab = `display`;
        this._meta = { display: null, raw: null, hasRawVariant: false };
        this._requestId = 0;
        this._usesPropertyItems = false;
        this._connected = false;
        this._historyActive = false;
        this._suppressNextPopState = false;
        this._pendingOpenSource = `api`;
        this._pendingCloseReason = `api`;
        this._currentOpenSource = `api`;
        this._lastFocusedElement = null;
        this._previousDocumentOverflow = ``;
        this._isResizing = false;
        this._panelWidth = null;
        this._resizerPointerId = null;
        this._lastWheelNavigationAt = 0;

        this._refs = {
            overlay: this.shadowRoot.querySelector(`.overlay`),
            shell: this.shadowRoot.querySelector(`.shell`),
            title: this.shadowRoot.querySelector(`.window-title`),
            titleMeta: this.shadowRoot.querySelector(`.title-meta`),
            closeButton: this.shadowRoot.querySelector(`.close-button`),
            stage: this.shadowRoot.querySelector(`.stage`),
            stageImage: this.shadowRoot.querySelector(`.stage-image`),
            stageVideo: this.shadowRoot.querySelector(`.stage-video`),
            loading: this.shadowRoot.querySelector(`.loading`),
            prevButton: this.shadowRoot.querySelector(`.nav-prev`),
            nextButton: this.shadowRoot.querySelector(`.nav-next`),
            resizer: this.shadowRoot.querySelector(`.resizer`),
            sidebar: this.shadowRoot.querySelector(`.sidebar`),
            thumbnailFrame: this.shadowRoot.querySelector(`.thumbnail-frame`),
            thumbnailImage: this.shadowRoot.querySelector(`.thumbnail-image`),
            itemTitle: this.shadowRoot.querySelector(`.item-title`),
            itemName: this.shadowRoot.querySelector(`.item-name`),
            tablist: this.shadowRoot.querySelector(`.tablist`),
            tabDisplay: this.shadowRoot.querySelector(`.tab-display`),
            tabRaw: this.shadowRoot.querySelector(`.tab-raw`),
            metaName: this.shadowRoot.querySelector(`.meta-name`),
            metaGroup: this.shadowRoot.querySelector(`.meta-group`),
            metaDate: this.shadowRoot.querySelector(`.meta-date`),
            metaViews: this.shadowRoot.querySelector(`.meta-views`),
            metaType: this.shadowRoot.querySelector(`.meta-type`),
            metaDimensions: this.shadowRoot.querySelector(`.meta-dimensions`),
            metaAspect: this.shadowRoot.querySelector(`.meta-aspect`),
            metaCount: this.shadowRoot.querySelector(`.meta-count`),
            descriptionBlock: this.shadowRoot.querySelector(`.description-block`),
            descriptionText: this.shadowRoot.querySelector(`.description-text`),
            actionsSlot: this.shadowRoot.querySelector(`slot[name="actions"]`),
            rawButton: this.shadowRoot.querySelector(`.raw-button`)
        };

        this._onBackdropClick = this._onBackdropClick.bind(this);
        this._onDocumentKeydown = this._onDocumentKeydown.bind(this);
        this._onWindowResize = this._onWindowResize.bind(this);
        this._onWindowPopState = this._onWindowPopState.bind(this);
        this._onViewerWheel = this._onViewerWheel.bind(this);
        this._onResizerPointerMove = this._onResizerPointerMove.bind(this);
        this._onResizerPointerUp = this._onResizerPointerUp.bind(this);
    }

    // --- Lifecycle & attributes ---

    connectedCallback() {
        if (this._connected) {
            return;
        }

        this._connected = true;

        this._upgradeProperty(`item`);
        this._upgradeProperty(`items`);
        this._upgradeProperty(`index`);

        this._refs.overlay.addEventListener(`click`, this._onBackdropClick);
        this._refs.overlay.addEventListener(`wheel`, this._onViewerWheel, { passive: false });
        this._refs.closeButton.addEventListener(`click`, () => this.close(`close_button`));
        this._refs.prevButton.addEventListener(`click`, () => this.previous(`button`));
        this._refs.nextButton.addEventListener(`click`, () => this.next(`button`));
        this._refs.tabDisplay.addEventListener(`click`, () => this._setActiveTab(`display`));
        this._refs.tabRaw.addEventListener(`click`, () => this._setActiveTab(`raw`));
        this._refs.rawButton.addEventListener(`click`, () => this._requestRawOpen(`button`));
        this._refs.resizer.addEventListener(`pointerdown`, (event) => this._onResizerPointerDown(event));

        document.addEventListener(`keydown`, this._onDocumentKeydown);
        window.addEventListener(`resize`, this._onWindowResize);
        window.addEventListener(`popstate`, this._onWindowPopState);

        if (!this._usesPropertyItems) {
            this._syncItemsFromAttributes();
        } else {
            this._clampIndex();
        }

        this._applyViewerTitle();
        this._applyRawButtonLabel();
        this._renderCurrent({ emitChange: false, source: `connect` });

        if (this.hasAttribute(`open`)) {
            this._handleOpenState();
        }
    }

    disconnectedCallback() {
        if (!this._connected) {
            return;
        }

        this._connected = false;

        this._refs.overlay.removeEventListener(`click`, this._onBackdropClick);
        this._refs.overlay.removeEventListener(`wheel`, this._onViewerWheel);
        document.removeEventListener(`keydown`, this._onDocumentKeydown);
        window.removeEventListener(`resize`, this._onWindowResize);
        window.removeEventListener(`popstate`, this._onWindowPopState);
        document.removeEventListener(`pointermove`, this._onResizerPointerMove);
        document.removeEventListener(`pointerup`, this._onResizerPointerUp);

        this._unlockDocumentScroll();
    }

    /** @param {string} name @param {string|null} previousValue @param {string|null} nextValue */
    attributeChangedCallback(name, previousValue, nextValue) {
        if (previousValue === nextValue) {
            return;
        }

        if (name === `open`) {
            if (!this.isConnected) {
                return;
            }

            if (this.hasAttribute(`open`)) {
                this._handleOpenState();
                return;
            }

            this._handleCloseState();
            return;
        }

        if (name === `index`) {
            const requested = toNumber(this.getAttribute(`index`), 0);
            this._index = requested;
            this._clampIndex();
            this._renderCurrent({ emitChange: this.open, source: `attribute_index` });
            return;
        }

        if (name === `viewer-title`) {
            this._applyViewerTitle();
            return;
        }

        if (name === `raw-label`) {
            this._applyRawButtonLabel();
            return;
        }

        if (!this._usesPropertyItems) {
            this._syncItemsFromAttributes();
            this._renderCurrent({ emitChange: false, source: `attribute_item` });
        }
    }

    // --- Public API (properties & methods) ---

    get open() {
        return this.hasAttribute(`open`);
    }

    set open(value) {
        if (value) {
            this._pendingOpenSource = `property`;
            this.setAttribute(`open`, ``);
            return;
        }

        this._pendingCloseReason = `property`;
        this.removeAttribute(`open`);
    }

    get index() {
        return this._index;
    }

    set index(value) {
        this._index = toNumber(value, 0);
        this._clampIndex();
        this._renderCurrent({ emitChange: this.open, source: `property_index` });
    }

    get item() {
        return this._items[0] || null;
    }

    set item(value) {
        if (value == null) {
            this.items = [];
            return;
        }

        this.items = [value];
    }

    get items() {
        return this._items.map((item) => ({ ...item }));
    }

    set items(value) {
        this._usesPropertyItems = true;
        this._items = normalizeItems(value);
        this._clampIndex();
        this._renderCurrent({ emitChange: false, source: `items_update` });
    }

    show(index = this._index, options = {}) {
        const nextIndex = typeof index === `number` ? index : this._index;
        this._index = toNumber(nextIndex, 0);
        this._clampIndex();
        this._pendingOpenSource = firstString(options.source, `api`);
        this._renderCurrent({ emitChange: this.open, source: this._pendingOpenSource });
        if (this.open) {
            return;
        }
        this.setAttribute(`open`, ``);
    }

    close(reason = `api`) {
        if (!this.open) {
            return;
        }

        this._pendingCloseReason = firstString(reason, `api`);
        this.removeAttribute(`open`);
    }

    next(source = `api`) {
        this._navigate(1, source);
    }

    previous(source = `api`) {
        this._navigate(-1, source);
    }

    _navigate(step, source) {
        if (this._items.length < 2) {
            return;
        }

        const noLoop = this.hasAttribute(`no-loop`);
        const requested = this._index + step;

        if (noLoop) {
            const bounded = clamp(requested, 0, this._items.length - 1);
            if (bounded === this._index) {
                return;
            }
            this._index = bounded;
        } else {
            this._index = ((requested % this._items.length) + this._items.length) % this._items.length;
        }

        this._renderCurrent({ emitChange: true, source: firstString(source, `api`) });
    }

    _upgradeProperty(name) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) {
            return;
        }

        const value = this[name];
        delete this[name];
        this[name] = value;
    }

    _syncItemsFromAttributes() {
        const singleItem = normalizeItem({
            kind: this.getAttribute(`kind`),
            raw: firstString(this.getAttribute(`raw-src`), this.getAttribute(`src`)),
            viewer: this.getAttribute(`viewer-src`),
            thumb: this.getAttribute(`thumb-src`),
            title: this.getAttribute(`item-title`) || this.getAttribute(`title`),
            alt: this.getAttribute(`alt`),
            name: this.getAttribute(`name`),
            rawName: this.getAttribute(`raw-name`),
            displayName: this.getAttribute(`display-name`),
            description: this.getAttribute(`description`),
            group: firstString(this.getAttribute(`group`), this.getAttribute(`album`)),
            date: this.getAttribute(`date`),
            views: this.getAttribute(`views`)
        }, 0);

        this._items = singleItem ? [singleItem] : [];
        this._clampIndex();
    }

    _clampIndex() {
        if (!this._items.length) {
            this._index = 0;
            return;
        }

        this._index = clamp(Math.round(this._index), 0, this._items.length - 1);
    }

    /** @returns {Object|null} Current normalized item or null */
    _getCurrentItem() {
        if (!this._items.length) {
            return null;
        }

        return this._items[this._index] || this._items[0] || null;
    }

    _applyViewerTitle() {
        const viewerTitle = firstString(this.getAttribute(`viewer-title`), DEFAULT_VIEWER_TITLE);
        this._refs.title.textContent = viewerTitle;
        this._refs.shell.setAttribute(`aria-label`, viewerTitle);
    }

    _applyRawButtonLabel() {
        this._refs.rawButton.textContent = firstString(this.getAttribute(`raw-label`), DEFAULT_RAW_LABEL);
    }

    /** Refresh UI for current index; optionally emit viewer-change. */
    _renderCurrent({ emitChange = true, source = `render` } = {}) {
        const item = this._getCurrentItem();

        this._refs.prevButton.disabled = this._items.length < 2;
        this._refs.nextButton.disabled = this._items.length < 2;

        if (!item) {
            this._clearViewer();
            return;
        }

        this._refs.titleMeta.textContent = `${this._index + 1} / ${this._items.length}`;
        this._refs.itemTitle.textContent = item.title;
        this._refs.itemName.textContent = item.name || item.rawName;
        this._refs.descriptionText.textContent = item.description || `No notes provided.`;
        this._refs.descriptionBlock.classList.toggle(`is-hidden`, !item.description);
        this._refs.rawButton.disabled = !item.rawSrc;

        const requestId = ++this._requestId;
        this._setupMeta(item, requestId);
        this._loadStage(item, requestId);
        this._loadThumbnail(item, requestId);

        if (emitChange) {
            this._dispatch(`viewer-change`, {
                index: this._index,
                item: item,
                source: source
            });
        }
    }

    _clearViewer() {
        this._refs.titleMeta.textContent = `0 / 0`;
        this._refs.itemTitle.textContent = `Nothing to display`;
        this._refs.itemName.textContent = `Provide a raw image through the API to use the viewer.`;
        this._refs.descriptionText.textContent = `No notes provided.`;
        this._refs.descriptionBlock.classList.add(`is-hidden`);
        this._refs.rawButton.disabled = true;
        this._refs.thumbnailImage.classList.add(`is-hidden`);
        this._refs.stageImage.classList.add(`is-hidden`);
        this._refs.stageImage.classList.remove(`is-loading`);
        this._refs.stageVideo.classList.add(`is-hidden`);
        this._hideLoading();
        this._refs.prevButton.disabled = true;
        this._refs.nextButton.disabled = true;
        this._meta = { display: null, raw: null, hasRawVariant: false };
        this._renderMeta();
    }

    _setupMeta(item, requestId) {
        const itemLabel = `${this._index + 1} / ${this._items.length}`;
        const displayMeta = {
            name: item.displayName || item.rawName,
            group: item.group || `-`,
            date: formatDateDisplay(item.date),
            views: String(item.views || 0),
            type: getTypeLabel(item.kind, item.viewerSrc),
            dimensions: item.kind === `video` ? `Loading...` : `Loading...`,
            aspect: item.kind === `video` ? `Loading...` : `Loading...`,
            item: itemLabel
        };
        const rawMeta = {
            name: item.rawName,
            group: item.group || `-`,
            date: formatDateDisplay(item.date),
            views: String(item.views || 0),
            type: getTypeLabel(item.kind, item.rawSrc),
            dimensions: `Loading...`,
            aspect: `Loading...`,
            item: itemLabel
        };

        const hasRawVariant = item.rawSrc !== item.viewerSrc || item.rawName !== item.displayName || rawMeta.type !== displayMeta.type;
        this._meta = {
            display: displayMeta,
            raw: rawMeta,
            hasRawVariant: hasRawVariant
        };

        if (!hasRawVariant) {
            this._activeTab = `display`;
        }

        this._refs.tablist.classList.toggle(`is-hidden`, !hasRawVariant);
        this._setActiveTab(this._activeTab, { silent: true });
        this._renderMeta();

        if (item.kind === `video`) {
            return;
        }

        this._probeImageMeta(`display`, item.viewerSrc, requestId);
        if (hasRawVariant) {
            this._probeImageMeta(`raw`, item.rawSrc, requestId);
            return;
        }

        this._meta.raw = { ...this._meta.display };
    }

    /** Push current display/raw meta into the sidebar meta grid. */
    _renderMeta() {
        const activeMeta = this._activeTab === `raw` && this._meta.hasRawVariant
            ? this._meta.raw
            : this._meta.display;

        if (!activeMeta) {
            this._refs.metaName.textContent = `-`;
            this._refs.metaGroup.textContent = `-`;
            this._refs.metaDate.textContent = `-`;
            this._refs.metaViews.textContent = `0`;
            this._refs.metaType.textContent = `Image`;
            this._refs.metaDimensions.textContent = `Unavailable`;
            this._refs.metaAspect.textContent = `Unavailable`;
            this._refs.metaCount.textContent = `0 / 0`;
            return;
        }

        this._refs.metaName.textContent = activeMeta.name || `-`;
        this._refs.metaGroup.textContent = activeMeta.group || `-`;
        this._refs.metaDate.textContent = activeMeta.date || `-`;
        this._refs.metaViews.textContent = activeMeta.views || `0`;
        this._refs.metaType.textContent = activeMeta.type || `Image`;
        this._refs.metaDimensions.textContent = activeMeta.dimensions || `Unavailable`;
        this._refs.metaAspect.textContent = activeMeta.aspect || `Unavailable`;
        this._refs.metaCount.textContent = activeMeta.item || `1 / 1`;
    }

    _setActiveTab(tab, options = {}) {
        const nextTab = tab === `raw` && this._meta.hasRawVariant ? `raw` : `display`;
        this._activeTab = nextTab;
        this._refs.tabDisplay.classList.toggle(`is-active`, nextTab === `display`);
        this._refs.tabRaw.classList.toggle(`is-active`, nextTab === `raw`);
        this._refs.tabDisplay.setAttribute(`aria-selected`, nextTab === `display` ? `true` : `false`);
        this._refs.tabRaw.setAttribute(`aria-selected`, nextTab === `raw` ? `true` : `false`);

        if (!options.silent) {
            this._renderMeta();
        }
    }

    _showLoading(message) {
        this._refs.loading.textContent = message;
        this._refs.loading.classList.remove(`is-hidden`);
    }

    _hideLoading() {
        this._refs.loading.classList.add(`is-hidden`);
    }

    _loadStage(item, requestId) {
        const isVideo = item.kind === `video`;

        this._refs.stageVideo.pause();
        this._refs.stageVideo.removeAttribute(`src`);
        this._refs.stageVideo.load();

        this._refs.stageImage.removeAttribute(`src`);
        this._refs.stageImage.classList.remove(`is-hidden`);
        this._refs.stageImage.classList.add(`is-loading`);
        this._refs.stageImage.setAttribute(`alt`, item.alt || item.title || item.name);

        if (isVideo) {
            this._loadStageVideo(item, requestId);
            return;
        }

        this._refs.stageVideo.classList.add(`is-hidden`);
        this._refs.stageImage.classList.remove(`is-hidden`);
        this._showLoading(`Loading image...`);

        const stageProbe = new Image();
        stageProbe.decoding = `async`;
        stageProbe.onload = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._refs.stageImage.setAttribute(`src`, item.viewerSrc);
            this._refs.stageImage.classList.remove(`is-loading`);
            this._hideLoading();
        };
        stageProbe.onerror = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._refs.stageImage.classList.remove(`is-loading`);
            this._showLoading(`Failed to load image`);
            this._dispatch(`viewer-media-error`, {
                index: this._index,
                item: item,
                target: `display`
            });
        };
        stageProbe.src = item.viewerSrc;
    }

    _loadStageVideo(item, requestId) {
        this._refs.stageImage.classList.add(`is-hidden`);
        this._refs.stageVideo.classList.remove(`is-hidden`);
        this._showLoading(`Loading video...`);

        this._refs.stageVideo.poster = item.thumbnailSrc || ``;
        this._refs.stageVideo.onloadedmetadata = () => {
            if (requestId !== this._requestId) {
                return;
            }

            const width = this._refs.stageVideo.videoWidth;
            const height = this._refs.stageVideo.videoHeight;
            const resolutionLabel = width && height ? `${width} x ${height}px` : `Unavailable`;
            const aspectLabel = width && height ? getAspectRatioLabel(width, height) : `Unavailable`;

            this._meta.display.dimensions = resolutionLabel;
            this._meta.display.aspect = aspectLabel;
            this._meta.raw.dimensions = resolutionLabel;
            this._meta.raw.aspect = aspectLabel;
            this._renderMeta();
        };
        this._refs.stageVideo.onloadeddata = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._hideLoading();
            this._refs.stageVideo.play().catch(() => {});
        };
        this._refs.stageVideo.onerror = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._showLoading(`Failed to load video`);
            this._dispatch(`viewer-media-error`, {
                index: this._index,
                item: item,
                target: `display`
            });
        };

        this._refs.stageVideo.setAttribute(`src`, item.viewerSrc);
        this._refs.stageVideo.load();
    }

    /** Load thumbnail into sidebar; hides thumbnail and ignores errors if no thumb URL. */
    _loadThumbnail(item, requestId) {
        if (!item.thumbnailSrc || item.kind === `video` && !item.thumbnailSrc) {
            this._refs.thumbnailImage.classList.add(`is-hidden`);
            this._refs.thumbnailImage.removeAttribute(`src`);
            return;
        }

        const thumbnail = new Image();
        thumbnail.decoding = `async`;
        thumbnail.onload = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._refs.thumbnailImage.setAttribute(`src`, item.thumbnailSrc);
            this._refs.thumbnailImage.setAttribute(`alt`, item.alt || item.title || item.name);
            this._refs.thumbnailImage.classList.remove(`is-hidden`);
        };
        thumbnail.onerror = () => {
            if (requestId !== this._requestId) {
                return;
            }

            this._refs.thumbnailImage.classList.add(`is-hidden`);
            this._dispatch(`viewer-media-error`, {
                index: this._index,
                item: item,
                target: `thumbnail`
            });
        };
        thumbnail.src = item.thumbnailSrc;
    }

    _probeImageMeta(target, sourceUrl, requestId) {
        const probe = new Image();
        probe.decoding = `async`;
        probe.onload = () => {
            if (requestId !== this._requestId || !this._meta[target]) {
                return;
            }

            const width = probe.naturalWidth;
            const height = probe.naturalHeight;
            this._meta[target].dimensions = width && height ? `${width} x ${height}px` : `Unavailable`;
            this._meta[target].aspect = width && height ? getAspectRatioLabel(width, height) : `Unavailable`;
            if (target === `display` && !this._meta.hasRawVariant) {
                this._meta.raw = { ...this._meta.display };
            }
            this._renderMeta();
        };
        probe.onerror = () => {
            if (requestId !== this._requestId || !this._meta[target]) {
                return;
            }

            this._meta[target].dimensions = `Unavailable`;
            this._meta[target].aspect = `Unavailable`;
            this._renderMeta();
            this._dispatch(`viewer-media-error`, {
                index: this._index,
                item: this._getCurrentItem(),
                target: target
            });
        };
        probe.src = sourceUrl;
    }

    /**
     * Emit viewer-raw-request; if not prevented, open raw URL per raw-target (_blank, _self, or window name).
     * @param {string} [source] – e.g. "button"
     */
    _requestRawOpen(source) {
        const item = this._getCurrentItem();
        if (!item || !item.rawSrc) {
            return;
        }

        const event = new CustomEvent(`viewer-raw-request`, {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: {
                index: this._index,
                item: item,
                source: firstString(source, `button`),
                url: item.rawSrc
            }
        });

        const shouldContinue = this.dispatchEvent(event);
        if (!shouldContinue) {
            return;
        }

        const rawTarget = firstString(this.getAttribute(`raw-target`), `_blank`);
        if (rawTarget === `_self`) {
            window.location.assign(item.rawSrc);
            return;
        }

        if (rawTarget === `_blank`) {
            window.open(item.rawSrc, rawTarget, `noopener`);
            return;
        }

        window.open(item.rawSrc, rawTarget);
    }

    _handleOpenState() {
        if (!this._items.length) {
            this.removeAttribute(`open`);
            return;
        }

        this._currentOpenSource = firstString(this._pendingOpenSource, `attribute`);
        this._pendingOpenSource = `api`;
        this._lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this._lockDocumentScroll();
        this._renderCurrent({ emitChange: false, source: this._currentOpenSource });

        if (this.hasAttribute(`history`) && !this._historyActive) {
            const currentState = window.history.state && typeof window.history.state === `object`
                ? window.history.state
                : {};
            window.history.pushState({ ...currentState, openImageViewer: true }, ``);
            this._historyActive = true;
        }

        queueMicrotask(() => {
            this._refs.closeButton.focus({ preventScroll: true });
        });

        this._dispatch(`viewer-open`, {
            index: this._index,
            item: this._getCurrentItem(),
            source: this._currentOpenSource
        });
    }

    _handleCloseState() {
        const item = this._getCurrentItem();
        const reason = firstString(this._pendingCloseReason, `attribute`);
        this._pendingCloseReason = `api`;
        this._unlockDocumentScroll();
        this._refs.stageVideo.pause();
        this._hideLoading();

        if (this._historyActive) {
            this._historyActive = false;
            this._suppressNextPopState = true;
            window.history.back();
        }

        if (this._lastFocusedElement && typeof this._lastFocusedElement.focus === `function`) {
            queueMicrotask(() => {
                this._lastFocusedElement.focus({ preventScroll: true });
            });
        }

            this._dispatch(`viewer-close`, {
                index: this._index,
                item: item,
                reason: reason
            });
        }

        // --- Document scroll lock (body overflow) ---

        _lockDocumentScroll() {
        const root = document.documentElement;
        if (!root) {
            return;
        }

        if (root.dataset.oivOverflowLocked !== `1`) {
            this._previousDocumentOverflow = root.style.overflow;
            root.style.overflow = `hidden`;
            root.dataset.oivOverflowLocked = `1`;
        }
    }

    _unlockDocumentScroll() {
        const root = document.documentElement;
        if (!root || root.dataset.oivOverflowLocked !== `1`) {
            return;
        }

        root.style.overflow = this._previousDocumentOverflow;
        delete root.dataset.oivOverflowLocked;
    }

    _dispatch(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            composed: true,
            detail: detail
        }));
    }

    /** Focusable elements for tab trap (shadow buttons + slotted action area). */
    _getFocusableElements() {
        const shadowButtons = Array.from(this.shadowRoot.querySelectorAll(`button:not([disabled])`));
        const slottedRoots = this._refs.actionsSlot
            ? this._refs.actionsSlot.assignedElements({ flatten: true })
            : [];
        const slottedFocusable = slottedRoots.flatMap((element) => {
            const matchesSelf = element.matches?.(`button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`)
                ? [element]
                : [];
            const descendants = Array.from(element.querySelectorAll?.(`button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`) || []);
            return [...matchesSelf, ...descendants];
        });

        return [...shadowButtons, ...slottedFocusable].filter((element) => {
            if (!(element instanceof HTMLElement)) {
                return false;
            }

            return element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== `hidden`;
        });
    }

    // --- Event handlers ---

    _onBackdropClick(event) {
        if (event.target !== this._refs.overlay) {
            return;
        }

        this.close(`backdrop`);
    }

    _onDocumentKeydown(event) {
        if (!this.open) {
            return;
        }

        const target = event.target;
        const tagName = target?.tagName?.toLowerCase?.() || ``;
        const isEditableTarget = !!target && (
            target.isContentEditable ||
            tagName === `input` ||
            tagName === `textarea` ||
            tagName === `select` ||
            tagName === `video`
        );

        if (isEditableTarget && event.key !== `Escape`) {
            return;
        }

        if (event.key === `Escape`) {
            event.preventDefault();
            this.close(`escape`);
            return;
        }

        if (event.key === `ArrowLeft`) {
            event.preventDefault();
            this.previous(`keyboard`);
            return;
        }

        if (event.key === `ArrowRight`) {
            event.preventDefault();
            this.next(`keyboard`);
            return;
        }

        if (event.key !== `Tab`) {
            return;
        }

        const focusable = this._getFocusableElements();
        if (!focusable.length) {
            event.preventDefault();
            return;
        }

        const activeIndex = focusable.indexOf(this.shadowRoot.activeElement || document.activeElement);
        const movingBackward = event.shiftKey;

        if (activeIndex === -1) {
            event.preventDefault();
            focusable[0].focus();
            return;
        }

        if (!movingBackward && activeIndex === focusable.length - 1) {
            event.preventDefault();
            focusable[0].focus();
            return;
        }

        if (movingBackward && activeIndex === 0) {
            event.preventDefault();
            focusable[focusable.length - 1].focus();
        }
    }

    _onViewerWheel(event) {
        if (!this.open || this._items.length < 2) {
            return;
        }

        const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX;

        if (Math.abs(primaryDelta) < 2) {
            return;
        }

        const path = typeof event.composedPath === `function`
            ? event.composedPath()
            : [];
        const overDescription = path.includes(this._refs.descriptionText);
        if (overDescription) {
            const description = this._refs.descriptionText;
            const canScroll = description.scrollHeight > description.clientHeight;
            const atTop = description.scrollTop <= 0;
            const atBottom = description.scrollTop + description.clientHeight >= description.scrollHeight - 1;

            if (canScroll && ((primaryDelta < 0 && !atTop) || (primaryDelta > 0 && !atBottom))) {
                return;
            }
        }

        const now = Date.now();
        if (now - this._lastWheelNavigationAt < 180) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        this._lastWheelNavigationAt = now;

        if (primaryDelta > 0) {
            this.next(`wheel`);
            return;
        }

        this.previous(`wheel`);
    }

    _onWindowResize() {
        if (window.innerWidth <= 900) {
            this.style.removeProperty(`--oiv-sidebar-width`);
        } else if (this._panelWidth) {
            this.style.setProperty(`--oiv-sidebar-width`, `${this._panelWidth}px`);
        }
    }

    _onWindowPopState() {
        if (this._suppressNextPopState) {
            this._suppressNextPopState = false;
            return;
        }

        if (!this._historyActive || !this.open) {
            return;
        }

        this._historyActive = false;
        this._pendingCloseReason = `history_back`;
        this.removeAttribute(`open`);
    }

    _onResizerPointerDown(event) {
        if (window.innerWidth <= 900 || !this.open) {
            return;
        }

        this._isResizing = true;
        this._resizerPointerId = event.pointerId;
        this._refs.resizer.setPointerCapture(event.pointerId);
        document.addEventListener(`pointermove`, this._onResizerPointerMove, { passive: false });
        document.addEventListener(`pointerup`, this._onResizerPointerUp);
        this._onResizerPointerMove(event);
    }

    _onResizerPointerMove(event) {
        if (!this._isResizing) {
            return;
            }

            event.preventDefault();
            const shellRect = this._refs.shell.getBoundingClientRect();
            const desiredWidth = shellRect.right - event.clientX;
        const boundedWidth = clamp(desiredWidth, 240, Math.min(520, shellRect.width - 260));
        this._panelWidth = Math.round(boundedWidth);
        this.style.setProperty(`--oiv-sidebar-width`, `${this._panelWidth}px`);
    }

    _onResizerPointerUp() {
        if (!this._isResizing) {
            return;
        }

        this._isResizing = false;
        if (this._resizerPointerId != null && this._refs.resizer.hasPointerCapture(this._resizerPointerId)) {
            this._refs.resizer.releasePointerCapture(this._resizerPointerId);
        }
        this._resizerPointerId = null;
        document.removeEventListener(`pointermove`, this._onResizerPointerMove);
        document.removeEventListener(`pointerup`, this._onResizerPointerUp);
    }
}
