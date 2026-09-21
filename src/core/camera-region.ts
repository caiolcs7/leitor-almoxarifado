/** Coordinates shared by the visible reticle and both decoders (object-fit: contain). */
export function cameraRegion(
  vw: number,
  vh: number,
  width: number,
  height: number,
) {
  if (Math.min(vw, vh, width, height) <= 0) return null;
  const scale = Math.min(width / vw, height / vh);
  // The original 72% × 60% crop was too restrictive for larger location
  // labels: the Data Matrix can sit close to an edge even when the label is
  // visibly inside the user's target. Keep a generous, centered scan window.
  const sw = Math.floor(vw * 0.86),
    sh = Math.floor(vh * 0.78);
  const sx = Math.floor((vw - sw) / 2),
    sy = Math.floor((vh - sh) / 2);
  return {
    sx,
    sy,
    sw,
    sh,
    left: (width - vw * scale) / 2 + sx * scale,
    top: (height - vh * scale) / 2 + sy * scale,
    width: sw * scale,
    height: sh * scale,
  };
}
