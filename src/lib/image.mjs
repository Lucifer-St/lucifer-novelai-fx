export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Decode an image without changing its pixels or replacing the source data URL. */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(
          new Error("图片尺寸无效，请选择另一张 PNG、JPEG 或 WebP 图片。"),
        );
        return;
      }
      resolve(image);
    };
    image.onerror = () =>
      reject(new Error("无法读取图片，请确认文件是有效的 PNG、JPEG 或 WebP。"));
    image.src = source;
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败，请重新选择文件。"));
    reader.onabort = () => reject(new Error("图片读取已取消。"));
    reader.readAsDataURL(file);
  });
}

/** Return original file bytes as a data URL, plus verified raster image metadata. */
export async function readImageFile(file) {
  if (!file || typeof file.arrayBuffer !== "function")
    throw new Error("请选择图片文件。");
  if (file.size === 0) throw new Error("该文件为空，请选择另一张图片。");
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("本地读取的图片不能超过 64 MB。");

  // Check the bytes, not just the extension or a browser-provided MIME label.
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => header[index] === value,
  );
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const webp =
    header.length === 12 &&
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  const type = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : "";
  if (!SUPPORTED_IMAGE_TYPES.has(type)) {
    throw new Error(
      "仅支持 PNG、JPEG 和 WebP 图片，不支持 SVG、GIF 或其他格式。",
    );
  }

  // Correct an absent/incorrect MIME label while retaining all original file bytes.
  const dataURL = await readAsDataURL(
    file.type === type ? file : file.slice(0, file.size, type),
  );
  const decoded = await loadImage(dataURL);
  if (decoded.naturalWidth * decoded.naturalHeight > 64_000_000)
    throw new Error("图片超过 6400 万像素，请先缩小副本。");
  return {
    dataURL,
    name: file.name || "image",
    width: decoded.naturalWidth,
    height: decoded.naturalHeight,
    type,
    size: file.size,
  };
}

function drawingSurface(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("图片目标宽高必须是正整数。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法创建图片画布。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

/** Prepare an API-only copy; the caller retains the original uploaded data URL. */
export async function preparePreciseReference(dataURL) {
  const source = await loadImage(dataURL);
  const ratio = source.naturalWidth / source.naturalHeight;
  const [width, height] =
    ratio < 0.9 ? [1024, 1536] : ratio > 1.1 ? [1536, 1024] : [1472, 1472];
  const { canvas, context } = drawingSurface(width, height);
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const scale = Math.min(
    width / source.naturalWidth,
    height / source.naturalHeight,
  );
  const imageWidth = source.naturalWidth * scale;
  const imageHeight = source.naturalHeight * scale;
  context.drawImage(
    source,
    (width - imageWidth) / 2,
    (height - imageHeight) / 2,
    imageWidth,
    imageHeight,
  );
  return { dataURL: canvas.toDataURL("image/png"), width, height };
}

/** Stretch an API-only PNG copy to the same coordinate space used by MaskEditor. */
export async function resizeSource(dataURL, width, height) {
  const { canvas, context } = drawingSurface(width, height);
  const source = await loadImage(dataURL);
  context.drawImage(source, 0, 0, width, height);
  return { dataURL: canvas.toDataURL("image/png"), width, height };
}

export async function makeThumbnail(dataURL,max=320){
  const image=await loadImage(dataURL),scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
  const {canvas,context}=drawingSurface(Math.max(1,Math.round(image.naturalWidth*scale)),Math.max(1,Math.round(image.naturalHeight*scale)));
  context.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
export async function visionImage(dataURL,max=1536){return makeThumbnail(dataURL,max);}
