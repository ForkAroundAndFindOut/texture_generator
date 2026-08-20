export type TextDownload = {
  readonly filename: string;
  readonly text: string;
  readonly mimeType: string;
};

/** Trigger a user-initiated text download and release its temporary URL. */
export function downloadTextFile(download: TextDownload): void {
  const blob = new Blob([download.text], { type: download.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = download.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}
