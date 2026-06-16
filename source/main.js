import { parseMetadata, dispose as disposeExifTool } from '@uswriting/exiftool';
import { zipSync, strToU8 } from 'fflate';

const VERSION = '1.2.0';
const DEFAULT_ARGS = ['-json', '-a', '-u', '-G1', '-s', '-n'];
const TEXT_ARGS = ['-a', '-u', '-G1', '-s', '-n'];

const $ = (id) => document.getElementById(id);

function showFatalError(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = `Startup/runtime error: ${message}`;
    status.dataset.tone = 'error';
  }
  const diagnostics = document.getElementById('diagnostics');
  if (diagnostics) diagnostics.textContent += `\nERROR: ${message}`;
  console.error(message);
}

window.addEventListener('error', (event) => {
  showFatalError(event.message || String(event.error || 'Unknown script error'));
});
window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason?.message || String(event.reason || 'Unhandled promise rejection'));
});

const state = {
  files: [],
  rootName: '',
  cancelled: false,
  running: false,
  reports: null,
};

const els = {
  folderInput: $('folderInput'),
  runBtn: $('runBtn'),
  cancelBtn: $('cancelBtn'),
  resetBtn: $('resetBtn'),
  downloadZipBtn: $('downloadZipBtn'),
  downloadTreeBtn: $('downloadTreeBtn'),
  downloadManifestBtn: $('downloadManifestBtn'),
  downloadJsonBtn: $('downloadJsonBtn'),
  downloadCsvBtn: $('downloadCsvBtn'),
  downloadTxtBtn: $('downloadTxtBtn'),
  status: $('status'),
  progress: $('progress'),
  progressText: $('progressText'),
  preview: $('preview'),
  summary: $('summary'),
  maxFiles: $('maxFiles'),
  maxSizeMb: $('maxSizeMb'),
  includeTextReport: $('includeTextReport'),
  includeAllFiles: $('includeAllFiles'),
  argDisplay: $('argDisplay'),
  diagnostics: $('diagnostics'),
  version: $('version'),
};

els.argDisplay.textContent = DEFAULT_ARGS.join(' ');
els.version.textContent = VERSION;

function updateDiagnostics(extra = '') {
  const supportsDirectoryInput = 'webkitdirectory' in document.createElement('input');
  const lines = [
    `Version: ${VERSION}`,
    `JavaScript loaded: yes`,
    `Page URL: ${location.href}`,
    `Browser: ${navigator.userAgent}`,
    `Directory input support detected: ${supportsDirectoryInput ? 'yes' : 'not detected'}`,
    `Selected files known to app: ${state.files.length}`,
    `Root name: ${state.rootName || '(none)'}`,
    `Reports ready: ${state.reports ? 'yes' : 'no'}`,
  ];
  if (extra) lines.push(extra);
  els.diagnostics.textContent = lines.join('\n');
}

function setStatus(message, tone = 'info') {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
  updateDiagnostics();
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  els.progress.value = pct;
  els.progressText.textContent = total > 0 ? `${done} / ${total} files (${pct}%)` : 'No files selected';
}

function bytes(n) {
  if (!Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function normalisePath(fileLike) {
  const p =
    fileLike?.webkitRelativePath ||
    fileLike?.name ||
    fileLike?.path ||
    fileLike?.file?.webkitRelativePath ||
    fileLike?.file?.name ||
    '';
  return String(p).replace(/\\/g, '/').replace(/^\/+/, '');
}

function rootFromFiles(files) {
  if (!files.length) return '';
  const first = files[0]?.path || normalisePath(files[0]);
  return first.includes('/') ? first.split('/')[0] : '(selected files)';
}

function selectedFilesFromInput(input) {
  return Array.from(input.files || [])
    .map((file) => ({ file, path: normalisePath(file) }))
    .filter((entry) => entry.path)
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

function countDirs(files) {
  const dirs = new Set();
  for (const { path } of files) {
    const parts = path.split('/').filter(Boolean);
    for (let i = 0; i < parts.length - 1; i += 1) {
      dirs.add(parts.slice(0, i + 1).join('/'));
    }
  }
  return dirs.size;
}

function makeTree(files) {
  if (!files.length) return '';
  const tree = { name: '', dirs: new Map(), files: [] };
  for (const { path, file } of files) {
    const parts = path.split('/').filter(Boolean);
    let node = tree;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node.files.push({ name: part, size: file.size });
      } else {
        if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      }
    }
  }
  const lines = [];
  const rootNames = Array.from(tree.dirs.keys());
  if (rootNames.length === 1 && tree.files.length === 0) {
    const root = tree.dirs.get(rootNames[0]);
    lines.push(root.name);
    writeNode(root, '');
  } else {
    lines.push(state.rootName || '(selected files)');
    writeNode(tree, '');
  }
  lines.push('');
  lines.push(`${countDirs(files)} directories, ${files.length} files`);
  return lines.join('\n');

  function writeNode(node, prefix) {
    const dirItems = Array.from(node.dirs.values())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((d) => ({ type: 'dir', item: d }));
    const fileItems = node.files
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((f) => ({ type: 'file', item: f }));
    const items = [...dirItems, ...fileItems];
    items.forEach((entry, idx) => {
      const isLast = idx === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      if (entry.type === 'dir') {
        lines.push(`${prefix}${connector}${entry.item.name}/`);
        writeNode(entry.item, `${prefix}${isLast ? '    ' : '│   '}`);
      } else {
        lines.push(`${prefix}${connector}${entry.item.name} (${bytes(entry.item.size)})`);
      }
    });
  }
}

function makeManifestCsv(files) {
  const rows = [[
    'RelativePath',
    'FileName',
    'Directory',
    'FileSizeBytes',
    'FileSizeHuman',
    'BrowserMimeType',
    'LastModifiedISO',
  ]];
  for (const { path, file } of files) {
    const parts = path.split('/');
    rows.push([
      path,
      file.name,
      parts.length > 1 ? parts.slice(0, -1).join('/') : '',
      String(file.size),
      bytes(file.size),
      file.type || '',
      file.lastModified ? new Date(file.lastModified).toISOString() : '',
    ]);
  }
  return csvString(rows);
}

function csvString(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function flattenMetadataRows(records) {
  const keys = new Set(['RelativePath', 'ExifToolStatus', 'ExifToolError']);
  for (const rec of records) {
    for (const k of Object.keys(rec.metadata || {})) keys.add(k);
  }
  const columns = Array.from(keys);
  const rows = [columns];
  for (const rec of records) {
    const row = [];
    for (const col of columns) {
      if (col === 'RelativePath') row.push(rec.relativePath);
      else if (col === 'ExifToolStatus') row.push(rec.success ? 'success' : 'error');
      else if (col === 'ExifToolError') row.push(rec.error || '');
      else row.push(formatValue(rec.metadata?.[col]));
    }
    rows.push(row);
  }
  return csvString(rows);
}

function formatValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatValue).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function makeTextReport(records) {
  const lines = [];
  lines.push(`ExifTool folder metadata report`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Tool package: ExifTool-in-WebAssembly via @uswriting/exiftool`);
  lines.push(`ExifTool arguments: ${DEFAULT_ARGS.join(' ')}`);
  lines.push('');
  for (const rec of records) {
    lines.push('='.repeat(78));
    lines.push(`File: ${rec.relativePath}`);
    if (!rec.success) {
      lines.push(`ERROR: ${rec.error || 'Unknown error'}`);
      lines.push('');
      continue;
    }
    const md = rec.metadata || {};
    const keys = Object.keys(md).filter((k) => k !== 'SourceFile').sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      lines.push(`${key.padEnd(38, ' ')} : ${formatValue(md[key])}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function safeBaseName(name) {
  return (name || 'folder').replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'folder';
}

async function runExifTool(files, { maxFiles, maxSizeBytes, includeTextReport }) {
  state.cancelled = false;
  const treeTxt = makeTree(files);
  const manifestCsv = makeManifestCsv(files);
  const selected = files.filter(({ file }) => file.size <= maxSizeBytes).slice(0, maxFiles);
  const skippedOversize = files.filter(({ file }) => file.size > maxSizeBytes).map(({ path, file }) => ({ path, size: file.size }));
  const skippedLimit = files.filter(({ file }) => file.size <= maxSizeBytes).slice(maxFiles).map(({ path, file }) => ({ path, size: file.size }));

  const records = [];
  setProgress(0, selected.length);
  for (let i = 0; i < selected.length; i += 1) {
    if (state.cancelled) break;
    const { file, path } = selected[i];
    setStatus(`Running ExifTool on ${path}`, 'info');
    try {
      const result = await parseMetadata(file, {
        args: DEFAULT_ARGS,
        transform: (data) => JSON.parse(data),
      });
      if (result.success) {
        const metadata = Array.isArray(result.data) ? (result.data[0] || {}) : (result.data || {});
        metadata.SourceFile = path;
        records.push({ relativePath: path, success: true, metadata });
      } else {
        records.push({ relativePath: path, success: false, metadata: {}, error: result.error || 'ExifTool returned an error' });
      }
    } catch (err) {
      records.push({ relativePath: path, success: false, metadata: {}, error: err?.message || String(err) });
    }
    setProgress(i + 1, selected.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  for (const item of skippedOversize) {
    records.push({
      relativePath: item.path,
      success: false,
      metadata: {},
      error: `Skipped: file size ${bytes(item.size)} exceeds configured limit ${bytes(maxSizeBytes)}.`,
    });
  }
  for (const item of skippedLimit) {
    records.push({
      relativePath: item.path,
      success: false,
      metadata: {},
      error: `Skipped: file count exceeds configured limit of ${maxFiles} files.`,
    });
  }

  const metadataJson = JSON.stringify({
    generatedAt: new Date().toISOString(),
    tool: 'ExifTool Folder Reporter',
    version: VERSION,
    exiftoolArgs: DEFAULT_ARGS,
    selectedRoot: state.rootName,
    totalFilesInFolder: files.length,
    processedFiles: selected.length,
    skippedOversize: skippedOversize.length,
    skippedLimit: skippedLimit.length,
    records,
  }, null, 2);

  const metadataCsv = flattenMetadataRows(records);
  const textReport = includeTextReport ? makeTextReport(records) : 'Text report disabled. JSON and CSV reports were generated.\n';

  return { treeTxt, manifestCsv, metadataJson, metadataCsv, textReport, records, skippedOversize, skippedLimit };
}

function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildZipBlob(reports) {
  const zipData = zipSync({
    'tree.txt': strToU8(reports.treeTxt),
    'file-manifest.csv': strToU8(reports.manifestCsv),
    'exiftool-metadata.json': strToU8(reports.metadataJson),
    'exiftool-metadata.csv': strToU8(reports.metadataCsv),
    'exiftool-report.txt': strToU8(reports.textReport),
    'README.txt': strToU8(readmeText()),
  }, { level: 6 });
  return new Blob([zipData], { type: 'application/zip' });
}

function readmeText() {
  return `ExifTool Folder Reporter output\n\nFiles generated:\n- tree.txt: directory tree structure generated from browser folder selection.\n- file-manifest.csv: browser-visible file list, sizes, MIME hints and last-modified dates.\n- exiftool-metadata.json: full ExifTool JSON records.\n- exiftool-metadata.csv: wide CSV table created from ExifTool records.\n- exiftool-report.txt: human-readable tag listing.\n\nThe browser page processes files locally. It does not upload files.\n`;
}

function enableDownloads(on) {
  for (const btn of [els.downloadZipBtn, els.downloadManifestBtn, els.downloadTreeBtn, els.downloadJsonBtn, els.downloadCsvBtn, els.downloadTxtBtn]) {
    btn.disabled = !on;
  }
}

function updateSelectionSummary() {
  const files = state.files;
  if (!files.length) {
    els.summary.textContent = 'No folder selected.';
    els.preview.textContent = 'Select a folder to preview its tree structure.';
    els.runBtn.disabled = true;
    enableDownloads(false);
    updateDiagnostics();
    return;
  }
  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
  const dirs = countDirs(files);
  els.summary.textContent = `${files.length} files, ${dirs} directories, ${bytes(totalBytes)} total. Root: ${state.rootName}`;
  els.preview.textContent = makeTree(files).split('\n').slice(0, 250).join('\n');
  els.runBtn.disabled = false;
  enableDownloads(false);
  // Tree and manifest do not require ExifTool, so allow these immediately.
  els.downloadTreeBtn.disabled = false;
  els.downloadManifestBtn.disabled = false;
  updateDiagnostics();
}

els.folderInput.addEventListener('click', () => {
  setStatus('Folder picker opened. After choosing a folder, the browser may ask permission to “upload” the files; this only means “make them available to this page”.', 'info');
});

els.folderInput.addEventListener('change', () => {
  try {
    const rawCount = els.folderInput.files ? els.folderInput.files.length : 0;
    state.files = selectedFilesFromInput(els.folderInput);
    state.rootName = rootFromFiles(state.files);
    state.reports = null;
    setProgress(0, 0);
    if (state.files.length) {
      setStatus(`Folder selected. Browser made ${state.files.length} file(s) available to the page. Preview ready.`, 'ok');
    } else {
      setStatus(`No files were returned by the browser. The chosen folder may be empty, blocked by browser policy, or not a real folder. Raw FileList count: ${rawCount}.`, 'warn');
    }
    updateSelectionSummary();
  } catch (err) {
    showFatalError(err?.message || String(err));
  }
});

els.runBtn.addEventListener('click', async () => {
  if (!state.files.length || state.running) return;
  state.running = true;
  els.runBtn.disabled = true;
  els.cancelBtn.disabled = false;
  enableDownloads(false);
  try {
    const maxFiles = Math.max(1, Number.parseInt(els.maxFiles.value, 10) || 300);
    const maxSizeMb = Math.max(1, Number.parseFloat(els.maxSizeMb.value) || 50);
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    state.reports = await runExifTool(state.files, {
      maxFiles,
      maxSizeBytes,
      includeTextReport: els.includeTextReport.checked,
    });
    const ok = state.reports.records.filter((r) => r.success).length;
    const failed = state.reports.records.length - ok;
    if (state.cancelled) {
      setStatus(`Cancelled. Partial reports are available: ${ok} successful records, ${failed} skipped/error records.`, 'warn');
    } else {
      setStatus(`Finished. ${ok} files processed successfully; ${failed} skipped or returned errors.`, failed ? 'warn' : 'ok');
    }
    els.preview.textContent = state.reports.textReport.split('\n').slice(0, 400).join('\n');
    enableDownloads(true);
  } catch (err) {
    console.error(err);
    setStatus(`Failed: ${err?.message || String(err)}`, 'error');
  } finally {
    state.running = false;
    els.cancelBtn.disabled = true;
    els.runBtn.disabled = !state.files.length;
    if (!state.reports && state.files.length) {
      els.downloadTreeBtn.disabled = false;
      els.downloadManifestBtn.disabled = false;
    }
    await disposeExifTool().catch(() => undefined);
  }
});

els.cancelBtn.addEventListener('click', () => {
  state.cancelled = true;
  setStatus('Cancelling after the current file finishes...', 'warn');
});

els.resetBtn.addEventListener('click', async () => {
  state.cancelled = true;
  state.running = false;
  state.files = [];
  state.rootName = '';
  state.reports = null;
  els.folderInput.value = '';
  setProgress(0, 0);
  setStatus('Reset. Select a folder to begin.', 'info');
  updateSelectionSummary();
  await disposeExifTool().catch(() => undefined);
});

els.downloadZipBtn.addEventListener('click', () => {
  if (!state.reports) return;
  downloadBlob(`${safeBaseName(state.rootName)}-metadata-reports.zip`, buildZipBlob(state.reports));
});

els.downloadTreeBtn.addEventListener('click', () => downloadText('tree.txt', state.reports ? state.reports.treeTxt : makeTree(state.files)));
els.downloadManifestBtn.addEventListener('click', () => downloadText('file-manifest.csv', state.reports ? state.reports.manifestCsv : makeManifestCsv(state.files), 'text/csv;charset=utf-8'));
els.downloadJsonBtn.addEventListener('click', () => state.reports && downloadText('exiftool-metadata.json', state.reports.metadataJson, 'application/json;charset=utf-8'));
els.downloadCsvBtn.addEventListener('click', () => state.reports && downloadText('exiftool-metadata.csv', state.reports.metadataCsv, 'text/csv;charset=utf-8'));
els.downloadTxtBtn.addEventListener('click', () => state.reports && downloadText('exiftool-report.txt', state.reports.textReport));

setStatus('Ready. JavaScript loaded. Select a folder to begin.', 'info');
setProgress(0, 0);
updateSelectionSummary();
updateDiagnostics();
