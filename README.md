# ExifTool Folder Reporter

A static browser tool for generating a directory tree, file manifest, and ExifTool-style metadata reports from a user-selected folder.

## Privacy

Files are processed in the browser. The app is designed not to upload selected files to a server. Some browsers use wording such as "upload" when selecting a folder; here that means making the selected local files available to the page.

## Use

1. Open the hosted page, or serve this folder locally.
2. Click **Choose exercise folder**.
3. Select the folder for analysis.
4. Click **Run ExifTool report**.
5. Download the generated report ZIP.

## Files

- `index.html`: page shell
- `app.js`: bundled application and ExifTool JavaScript runtime
- `style.css`: page styling
- `zeroperl.wasm`: WebAssembly runtime used by ExifTool
- `source/main.js`: readable human-authored application source

Keep `index.html`, `app.js`, `style.css`, and `zeroperl.wasm` in the same folder.

## Local Use

For best results, run a tiny local server from this folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

On Windows, use:

```powershell
py -m http.server 8000
```

## GitHub Pages

Put these files in the repository root and enable GitHub Pages from the main branch root. The empty `.nojekyll` file tells GitHub Pages to serve the files as static assets.

## Version

v1.2.0 separates the WebAssembly runtime into `zeroperl.wasm`, reducing `app.js` from about 33 MB to about 156 KB while retaining the same report-generation behaviour.
