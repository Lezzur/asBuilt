# Input Methods

## Zip Upload

Compress your project folder into a `.zip` file and upload it. Maximum size is **100 MB**. The zip is extracted, filtered, and deleted immediately after the scan.

## Folder Upload

Select a folder directly from your machine using the browser's directory picker. Files are streamed to the server. This is the most convenient method for local projects.

## GitHub Repository

Paste a GitHub repo URL. For private repositories, connect your GitHub account in Settings first. You can specify a branch (defaults to `main`/`master`) and a subdirectory path for monorepos.

## Subdirectory Targeting

Available on all input methods. Enter a relative path (e.g. `packages/api`) to scan only that subdirectory. Useful for monorepos where you want documentation for a specific package.
