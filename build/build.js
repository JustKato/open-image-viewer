#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const indexPath = path.join(SRC, 'index.js');
const stylesPath = path.join(SRC, 'styles.css');
const templatePath = path.join(SRC, 'template.html');
const utilsPath = path.join(SRC, 'utils.js');
const elementPath = path.join(SRC, 'OpenImageViewerElement.js');
const bootstrapPath = path.join(SRC, 'bootstrap.js');

let bundle = fs.readFileSync(indexPath, 'utf8');

const styles = fs.readFileSync(stylesPath, 'utf8');
const html = fs.readFileSync(templatePath, 'utf8');

const stylesInjection = `const STYLES = ${JSON.stringify(styles)};\n\n`;
const htmlInjection = `const HTML = ${JSON.stringify(html)};\n\n`;

bundle = bundle
    .replace('/* BUILD:INJECT_STYLES */', stylesInjection.trim())
    .replace('/* BUILD:INJECT_HTML */', htmlInjection.trim());

bundle += '\n' + fs.readFileSync(utilsPath, 'utf8');
bundle += '\n' + fs.readFileSync(elementPath, 'utf8');
bundle += '\n' + fs.readFileSync(bootstrapPath, 'utf8');

if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
}

fs.writeFileSync(path.join(DIST, 'open-image-viewer.js'), bundle, 'utf8');

// Minify with esbuild if available
try {
    const esbuild = require('esbuild');
    const { code } = esbuild.transformSync(bundle, { minify: true });
    fs.writeFileSync(path.join(DIST, 'open-image-viewer.min.js'), code, 'utf8');
    console.log('Built dist/open-image-viewer.js and dist/open-image-viewer.min.js');
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
        fs.writeFileSync(path.join(DIST, 'open-image-viewer.min.js'), bundle, 'utf8');
        console.log('Built dist/open-image-viewer.js (run npm install for minification)');
    } else {
        console.error('Build failed:', e);
        process.exit(1);
    }
}
