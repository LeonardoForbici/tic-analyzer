const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'dist/extension.js',
  'dist/reversa-engine/visor/screenshotRecognition.js',
  'dist/reversa-engine/visor/localVision.js',
  'dist/reversa-engine/visor/analyzeVisorScreenshots.js',
  'dist/reversa-engine/visor/generateUiDocs.js',
  'dist/impact/screenFingerprint.js',
  'dist/impact/analyzeImpactByImage.js',
  'dist/webview/overviewHtml.js',
  'dist/webview/webviewAssets.js'
];

const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));

if (missing.length > 0) {
  console.error('VSIX package guard failed. Missing runtime files:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  console.error('Run npm run compile before packaging.');
  process.exit(1);
}

console.log(`VSIX package guard passed (${requiredFiles.length} runtime files checked).`);
