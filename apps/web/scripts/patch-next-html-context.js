#!/usr/bin/env node
/**
 * Patch Next.js 15 internal compiled Pages Router runtime so the built-in
 * fallback Document can render during App Router static generation.
 *
 * Next.js 15 + React 19 throws:
 *   Error: <Html> should not be imported outside of pages/_document.
 * while prerendering the internal /404 and /500 fallback pages.
 *
 * The compiled runtime bundles its own copy of useHtmlContext. We replace
 * the guard with a safe default context so the build can complete.
 */
const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/next/dist/compiled/next-server/pages.runtime.prod.js',
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.prod.js',
  'node_modules/next/dist/compiled/next-server/pages.runtime.dev.js',
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.dev.js',
];

const defaultContext = `{inAmpMode:!1,isDevelopment:!1,hybridAmp:!1,docComponentsRendered:{},scriptLoader:{},head:void 0,headTags:[],styles:void 0,__NEXT_DATA__:{},assetPrefix:"",assetQueryString:"",dynamicImports:[],dynamicCssManifest:new Set,crossOrigin:void 0,optimizeCss:!1,disableOptimizedLoading:!1,buildManifest:{pages:{},devFiles:[],polyfillFiles:[],lowPriorityFiles:[],ampDevFiles:[]},nextFontManifest:{pages:{},pagesUsingSizeAdjust:!1},ampPath:"",canonicalBase:"",dangerousAsPath:"",locale:void 0,unstable_runtimeJS:!0,unstable_JsPreload:!0}`;

let patchedCount = 0;

files.forEach((file) => {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;

  const content = fs.readFileSync(fullPath, 'utf8');

  // Match the bundled useHtmlContext function that throws E67.
  const re = /function ([a-zA-Z_$][\w$]*)\(\)\{let ([a-zA-Z_$][\w$]*)=\(0,([a-zA-Z_$][\w$]*)\.useContext\)\(([a-zA-Z_$][\w$]*)\);if\(!\2\)throw Object\.defineProperty\((?:new\s+)?Error\("<Html> should not be imported outside of pages\/_document\.\\nRead more: https:\/\/nextjs\.org\/docs\/messages\/no-document-import-in-page"\),"__NEXT_ERROR_CODE",\{value:"E67",enumerable:!1,configurable:!0\}\);return \2\}/;

  if (!re.test(content)) {
    console.log(`skip: ${file} (pattern not found)`);
    return;
  }

  const patched = content.replace(re, function (match, fnName, ctxVar, reactVar, contextVar) {
    return `function ${fnName}(){let ${ctxVar}=(0,${reactVar}.useContext)(${contextVar});if(!${ctxVar})return ${defaultContext};return ${ctxVar}}`;
  });

  if (patched === content) {
    console.log(`skip: ${file} (no change)`);
    return;
  }

  fs.writeFileSync(fullPath, patched, 'utf8');
  patchedCount++;
  console.log(`patched: ${file}`);
});

if (patchedCount === 0) {
  console.log('Next.js HtmlContext patch: no files required patching');
} else {
  console.log(`Next.js HtmlContext patch: ${patchedCount} file(s) patched`);
}
