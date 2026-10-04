export const MIN_IMAGE_SCALE = 0.02;
export const MAX_IMAGE_SCALE = 8;
export const clampScale = scale => Math.max(MIN_IMAGE_SCALE, Math.min(MAX_IMAGE_SCALE, scale));
export function fitImage({width, height}, {width: naturalWidth, height: naturalHeight}) {
  return clampScale(Math.min(Math.max(1, width - 32) / naturalWidth, Math.max(1, height - 32) / naturalHeight));
}
export function boundPan(pan, scale, viewport, image) {
  const x = Math.max(0, (image.width * scale - viewport.width) / 2 + 16);
  const y = Math.max(0, (image.height * scale - viewport.height) / 2 + 16);
  return {x: Math.max(-x, Math.min(x, pan.x)), y: Math.max(-y, Math.min(y, pan.y))};
}
export function anchoredZoom(view, nextScale, point, viewport, image) {
  const scale = clampScale(nextScale), ratio = scale / view.scale;
  const pan = {x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio};
  return {...boundPan(pan, scale, viewport, image), scale, fit: false};
}
