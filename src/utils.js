function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);

    while (y !== 0) {
        const next = y;
        y = x % y;
        x = next;
    }

    return x || 1;
}

/**
 * Human-readable aspect ratio (e.g. "16:9"). Tries common small denominators;
 * falls back to exact ratio if no close match within ~1.5% relative error.
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function getAspectRatioLabel(width, height) {
    if (!width || !height) {
        return `Unavailable`;
    }

    const divisor = gcd(width, height);
    const exactX = Math.round(width / divisor);
    const exactY = Math.round(height / divisor);
    const exactLabel = `${exactX}:${exactY}`;
    const targetRatio = width / height;

    let bestX = exactX;
    let bestY = exactY;
    let bestError = Number.POSITIVE_INFINITY;

    for (let y = 1; y <= 24; y += 1) {
        const baseX = Math.max(1, Math.round(targetRatio * y));
        for (let x = Math.max(1, baseX - 1); x <= baseX + 1; x += 1) {
            const error = Math.abs((x / y) - targetRatio);
            if (error < bestError) {
                const reduced = gcd(x, y);
                bestX = Math.round(x / reduced);
                bestY = Math.round(y / reduced);
                bestError = error;
            }
        }
    }

    const relativeError = targetRatio === 0 ? bestError : bestError / targetRatio;
    if (relativeError <= 0.015) {
        return `${bestX}:${bestY}`;
    }

    return exactLabel;
}

/**
 * Format a date for display (locale short form, e.g. "Jan 15, 2024"). Returns "-" for missing/invalid.
 * @param {string|number|Date} [rawDate]
 * @returns {string}
 */
function formatDateDisplay(rawDate) {
    if (!rawDate) {
        return `-`;
    }

    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
        return String(rawDate);
    }

    return date.toLocaleString(undefined, {
        year: `numeric`,
        month: `short`,
        day: `2-digit`
    });
}

/**
 * First truthy, non-empty trimmed string from the list; otherwise "".
 * @param {...*} values
 * @returns {string}
 */
function firstString(...values) {
    for (const value of values) {
        if (typeof value !== `string`) {
            continue;
        }

        const trimmed = value.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return ``;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getFileExtension(pathLike) {
    const cleaned = String(pathLike || ``).split(`?`)[0].split(`#`)[0];
    const fileName = cleaned.slice(cleaned.lastIndexOf(`/`) + 1);
    const dotIndex = fileName.lastIndexOf(`.`);

    if (dotIndex < 0) {
        return ``;
    }

    return fileName.slice(dotIndex + 1).toLowerCase();
}

function getFileName(pathLike, fallback = `file`) {
    const candidate = String(pathLike || ``).split(`?`)[0].split(`#`)[0];
    const fileName = candidate.slice(candidate.lastIndexOf(`/`) + 1).trim();

    return fileName || fallback;
}

function replaceExtension(fileName, nextExtension) {
    const value = String(fileName || ``);
    const dotIndex = value.lastIndexOf(`.`);
    if (dotIndex <= 0) {
        return nextExtension ? `${value || `file`}.${nextExtension}` : value || `file`;
    }

    if (!nextExtension) {
        return value.slice(0, dotIndex);
    }

    return `${value.slice(0, dotIndex)}.${nextExtension}`;
}

/**
 * Normalize media type to "image" or "video" (uses kind and/or file extension).
 * @param {string} [kind]
 * @param {string} [reference] – URL or path used to infer from extension
 * @returns {'image'|'video'}
 */
function normalizeKind(kind, reference) {
    const normalized = String(kind || ``).trim().toLowerCase();
    if (normalized === `video`) {
        return `video`;
    }

    const extension = getFileExtension(reference);
    if ([`mp4`, `webm`, `mov`, `avi`, `mkv`].includes(extension)) {
        return `video`;
    }

    return `image`;
}

/**
 * Display label for media type, e.g. "Image (PNG)" or "Video (MP4)".
 * @param {string} kind – "image" or "video"
 * @param {string} [reference] – URL/path for extension
 * @returns {string}
 */
function getTypeLabel(kind, reference) {
    const extension = getFileExtension(reference).toUpperCase();
    if (kind === `video`) {
        return extension ? `Video (${extension})` : `Video`;
    }

    return extension ? `Image (${extension})` : `Image`;
}

/**
 * Normalize a single gallery item (from attributes or API) into a canonical shape.
 * Accepts many alias properties (raw/rawSrc/src, viewer/viewerSrc/display, thumb/thumbnailSrc, etc.).
 * @param {Object} [item] – Raw item (may have sources, raw, viewer, thumb, title, description, etc.)
 * @param {number} index – Used for fallback id/title when missing
 * @returns {Object|null} Normalized item with id, title, name, rawSrc, viewerSrc, thumbnailSrc, kind, … or null
 */
function normalizeItem(item, index) {
    if (!item || typeof item !== `object`) {
        return null;
    }

    const sources = item.sources && typeof item.sources === `object` ? item.sources : {};
    const rawSrc = firstString(
        item.raw,
        item.rawSrc,
        item.original,
        item.originalSrc,
        item.src,
        sources.raw,
        sources.original,
        sources.base
    );

    if (!rawSrc) {
        return null;
    }

    const kind = normalizeKind(item.kind, rawSrc);
    const viewerSrc = firstString(
        item.viewer,
        item.viewerSrc,
        item.display,
        item.displaySrc,
        item.preview,
        sources.viewer,
        sources.display,
        sources.preview,
        rawSrc
    );
    const thumbnailSrc = firstString(
        item.thumb,
        item.thumbSrc,
        item.thumbnail,
        item.thumbnailSrc,
        item.poster,
        sources.thumb,
        sources.thumbnail,
        sources.poster,
        viewerSrc,
        rawSrc
    );
    const rawName = firstString(item.rawName, item.name, getFileName(rawSrc, `image-${index + 1}`));
    const displayName = firstString(
        item.displayName,
        item.viewerName,
        item.previewName,
        viewerSrc !== rawSrc ? replaceExtension(rawName, getFileExtension(viewerSrc)) : rawName
    );

    return {
        id: firstString(item.id, item.key, rawName, `item-${index + 1}`),
        title: firstString(item.title, item.label, rawName, `Item ${index + 1}`),
        name: firstString(item.name, rawName),
        alt: firstString(item.alt, item.title, rawName, `Artwork ${index + 1}`),
        description: firstString(item.description, item.caption, item.notes),
        group: firstString(item.group, item.album, item.collection, item.folder),
        date: firstString(item.date, item.createdAt, item.timestamp),
        views: toNumber(item.views, 0),
        kind: kind,
        rawSrc: rawSrc,
        viewerSrc: viewerSrc,
        thumbnailSrc: thumbnailSrc,
        rawName: rawName,
        displayName: displayName,
        originalItem: item
    };
}

/**
 * Normalize an array of gallery items; skips entries that have no usable source.
 * @param {Array<Object>} [items]
 * @returns {Array<Object>}
 */
function normalizeItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map((item, index) => normalizeItem(item, index))
        .filter(Boolean);
}
