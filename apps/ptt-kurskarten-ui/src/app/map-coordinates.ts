export type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_VIEWBOX: ViewBox = {
  x: 0,
  y: 0,
  width: 800,
  height: 508
};

export function computeTransform(canvasWidth: number, canvasHeight: number, viewBox: ViewBox): CanvasTransform {
  const scale = Math.min(canvasWidth / viewBox.width, canvasHeight / viewBox.height);
  const offsetX = (canvasWidth - viewBox.width * scale) / 2 - viewBox.x * scale;
  const offsetY = (canvasHeight - viewBox.height * scale) / 2 - viewBox.y * scale;

  return { scale, offsetX, offsetY };
}

export function worldToScreen(
  point: { x: number; y: number },
  transform: CanvasTransform
): { x: number; y: number } {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY
  };
}

export function screenToWorld(
  point: { x: number; y: number },
  transform: CanvasTransform
): { x: number; y: number } {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale
  };
}
