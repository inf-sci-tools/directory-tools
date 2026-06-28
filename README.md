# ExifTool Folder Reporter

A static browser tool for generating a directory tree, file manifest, and ExifTool CSV metadata report from a user-selected folder.

## Privacy

Files are processed **locally in the browser**. The app is designed **not to upload selected files to a server**. Some browsers use default wording such as "upload" when selecting a folder; here that means making the selected local files available to the web page.

## Use

1. Open the hosted page, or serve this folder locally.
2. Click **Choose exercise folder**.
3. Select the folder for analysis.
4. Click **Run ExifTool report**.
5. Download the generated report ZIP.

## ExifTool mode

Version 1.3.0 supplies only one optional argument to ExifTool:

```text
-csv
```

The app parses ExifTool's per-file CSV output and merges the rows into one `exiftool-metadata.csv` file.

## Files

- `index.html`: page shell
- `app.js`: bundled application and ExifTool JavaScript runtime
- `style.css`: page styling
- `zeroperl.wasm`: WebAssembly runtime used by ExifTool
- `source/main.js`: readable human-authored application source

Keep `index.html`, `app.js`, `style.css`, and `zeroperl.wasm` in the same folder.

## Local use

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
