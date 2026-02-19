/** A single file extracted from a zip or folder upload. */
export interface CollectedFile {
  /** Path relative to the project root, e.g. "src/index.ts". */
  relativePath: string;
  /** UTF-8 decoded file content. */
  content: string;
  sizeBytes: number;
}

/** A raw file entry from a folder upload before content decoding. */
export interface FolderFileEntry {
  /** Relative path preserved from webkitRelativePath. */
  relativePath: string;
  buffer: Buffer;
}

export interface UploadResult {
  storagePath: string;
  sizeBytes: number;
}
