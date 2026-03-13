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
  geneva: { mapX: 23.467336683417074, mapY: 413.54773869346735, ix: 600, iy: 6668 },
  nauders: { mapX: 806.2178766941084, mapY: 235.09412168003752, ix: 12860, iy: 3946 }
};

export type IiifOverride = {
  iiifCenterX?: number;
  iiifCenterY?: number;
};

export function computeArchiveTransform(): ArchiveTransform {
  const scaleX = (ANCHORS.nauders.ix - ANCHORS.geneva.ix) / (ANCHORS.nauders.mapX - ANCHORS.geneva.mapX);
  const scaleY = (ANCHORS.nauders.iy - ANCHORS.geneva.iy) / (ANCHORS.nauders.mapY - ANCHORS.geneva.mapY);
  const offsetX = ANCHORS.geneva.ix - ANCHORS.geneva.mapX * scaleX;
  const offsetY = ANCHORS.geneva.iy - ANCHORS.geneva.mapY * scaleY;
  return { scaleX, scaleY, offsetX, offsetY };
}

export function buildArchiveRegion(x: number, y: number, transform: ArchiveTransform): string {
  const iiifX = Math.round(x * transform.scaleX + transform.offsetX);
  const iiifY = Math.round(y * transform.scaleY + transform.offsetY);
  return `${iiifX},${iiifY},${ARCHIVE_REGION_SIZE},${ARCHIVE_REGION_SIZE}`;
}

export function getArchiveIiifCenter(
  node: { x: number; y: number } & IiifOverride,
  transform: ArchiveTransform
): { x: number; y: number } {
  if (node.iiifCenterX !== undefined && node.iiifCenterY !== undefined) {
    return {
      x: Math.round(node.iiifCenterX),
      y: Math.round(node.iiifCenterY)
    };
  }
  return {
    x: Math.round(node.x * transform.scaleX + transform.offsetX + ARCHIVE_REGION_SIZE / 2),
    y: Math.round(node.y * transform.scaleY + transform.offsetY + ARCHIVE_REGION_SIZE / 2)
  };
}

export function buildArchiveSnippetUrlFromRegion(region: string): string {
  return buildArchiveSnippetUrlFromRegionWithBase(region, ARCHIVE_IIIF_BASE);
}

export function normalizeIiifRoute(iiifRoute: string | null | undefined): string {
  if (typeof iiifRoute !== 'string') {
    return ARCHIVE_IIIF_BASE;
  }
  const trimmed = iiifRoute.trim();
  if (!trimmed.length) {
    return ARCHIVE_IIIF_BASE;
  }
  return trimmed.replace(/\/+$/, '');
}

export function buildArchiveIiifInfoUrl(iiifRoute: string | null | undefined): string {
  return `${normalizeIiifRoute(iiifRoute)}/info.json`;
}

export function buildArchiveSnippetUrlFromRegionWithBase(region: string, iiifRoute: string | null | undefined): string {
  return `${normalizeIiifRoute(iiifRoute)}/${region}/${ARCHIVE_OUTPUT_SIZE},${ARCHIVE_OUTPUT_SIZE}/0/default.jpg`;
}

export function buildArchiveSnippetUrl(
  x: number,
  y: number,
  transform: ArchiveTransform,
  iiifRoute: string | null | undefined = ARCHIVE_IIIF_BASE
): string {
  return buildArchiveSnippetUrlFromRegionWithBase(buildArchiveRegion(x, y, transform), iiifRoute);
}

export function buildArchiveRegionFromOverride(override: IiifOverride): string | null {
  if (override.iiifCenterX === undefined || override.iiifCenterY === undefined) {
    return null;
  }
  const half = Math.round(ARCHIVE_REGION_SIZE / 2);
  const iiifX = Math.round(override.iiifCenterX - half);
  const iiifY = Math.round(override.iiifCenterY - half);
  return `${iiifX},${iiifY},${ARCHIVE_REGION_SIZE},${ARCHIVE_REGION_SIZE}`;
}

export function buildArchiveSnippetUrlForNode(
  node: { x: number; y: number } & IiifOverride,
  transform: ArchiveTransform,
  iiifRoute: string | null | undefined = ARCHIVE_IIIF_BASE
): string {
  const overrideRegion = buildArchiveRegionFromOverride(node);
  if (overrideRegion) {
    return buildArchiveSnippetUrlFromRegionWithBase(overrideRegion, iiifRoute);
  }
  return buildArchiveSnippetUrl(node.x, node.y, transform, iiifRoute);
}
