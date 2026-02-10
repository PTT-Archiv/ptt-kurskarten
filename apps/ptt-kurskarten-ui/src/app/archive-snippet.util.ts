export const ARCHIVE_IIIF_BASE = 'https://iiif.ptt-archiv.ch/iiif/3/P-38-2-1852-07.jp2';
export const ARCHIVE_REGION_SIZE = 1024;
export const ARCHIVE_OUTPUT_SIZE = 512;
export const ARCHIVE_DEFAULT_REGION = '4350,3600,1024,1024';

export type ArchiveTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

const ANCHORS = {
  bern: { mapX: 23.467336683417074, mapY: 413.54773869346735, ix: 600, iy: 6668 },
  nauders: { mapX: 806.2178766941084, mapY: 235.09412168003752, ix: 12860, iy: 3946 }
};

export function computeArchiveTransform(): ArchiveTransform {
  const scaleX = (ANCHORS.nauders.ix - ANCHORS.bern.ix) / (ANCHORS.nauders.mapX - ANCHORS.bern.mapX);
  const scaleY = (ANCHORS.nauders.iy - ANCHORS.bern.iy) / (ANCHORS.nauders.mapY - ANCHORS.bern.mapY);
  const offsetX = ANCHORS.bern.ix - ANCHORS.bern.mapX * scaleX;
  const offsetY = ANCHORS.bern.iy - ANCHORS.bern.mapY * scaleY;
  return { scaleX, scaleY, offsetX, offsetY };
}

export function buildArchiveRegion(x: number, y: number, transform: ArchiveTransform): string {
  const iiifX = Math.round(x * transform.scaleX + transform.offsetX);
  const iiifY = Math.round(y * transform.scaleY + transform.offsetY);
  return `${iiifX},${iiifY},${ARCHIVE_REGION_SIZE},${ARCHIVE_REGION_SIZE}`;
}

export function buildArchiveSnippetUrlFromRegion(region: string): string {
  return `${ARCHIVE_IIIF_BASE}/${region}/${ARCHIVE_OUTPUT_SIZE},${ARCHIVE_OUTPUT_SIZE}/0/default.jpg`;
}

export function buildArchiveSnippetUrl(x: number, y: number, transform: ArchiveTransform): string {
  return buildArchiveSnippetUrlFromRegion(buildArchiveRegion(x, y, transform));
}
