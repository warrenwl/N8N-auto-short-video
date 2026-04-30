#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const workflowDirs = [
  path.join(process.cwd(), 'n8n', 'workflow'),
  path.join(process.cwd(), 'n8n', 'workflow', 'available'),
];

const allowedRequires = new Set(['fs']);
const forbiddenRequires = new Set([
  'path',
  'child_process',
  'process',
  'os',
  'http',
  'https',
  'url',
  'util',
  'stream',
  'crypto',
  'zlib',
  'net',
  'tls',
]);

function workflowFiles() {
  return workflowDirs.flatMap((dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(dir, name));
  });
}

function findRequires(code) {
  return [...String(code || '').matchAll(/require\(['"]([^'"]+)['"]\)/g)]
    .map((match) => match[1]);
}

let failed = false;
let scannedCodeNodes = 0;

for (const file of workflowFiles()) {
  const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const node of workflow.nodes || []) {
    if (node.type !== 'n8n-nodes-base.code') continue;
    scannedCodeNodes += 1;
    const requires = findRequires(node.parameters?.jsCode || '');
    for (const name of requires) {
      if (forbiddenRequires.has(name) || !allowedRequires.has(name)) {
        failed = true;
        console.error(`Forbidden require "${name}" in ${path.relative(process.cwd(), file)} :: ${node.name}`);
      }
    }
  }
}

if (failed) {
  console.error('n8n Code node sandbox check failed.');
  process.exit(1);
}

console.log(`n8n Code node sandbox check passed. Scanned ${scannedCodeNodes} Code nodes.`);
