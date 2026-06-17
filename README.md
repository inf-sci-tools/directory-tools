# ExifTool Folder Reporter

A static browser tool for generating a directory tree, file manifest, and ExifTool-style metadata reports from a user-selected folder.

## Privacy

Files are processed **locally in the browser**. The app is designed **not to upload selected files to a server**. Some browsers use default wording in pop-up messages such as "upload" when selecting a folder; here that means making the selected local files available to the web page.

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

## Easiest use case - GitHub Pages

The easiest way to access the tool is via the GitHub Pages hosted version: https://inf-sci-tools.github.io/directory-tools/


## Local Use

For best results, you can download the repo files, and from within the folder, use the command line/terminal to run a tiny local server from this folder:

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


