import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Eraser,
  FlipHorizontal,
  Paintbrush,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { loadImage } from "../lib/image.mjs";

const MAX_UNDO_STEPS = 20;

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function targetDimension(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 1024;
}

export default function MaskEditor({ image, mask, onChange, width, height }) {
  const sizeId = useId();
  const canvasRef = useRef(null);
  const paintRef = useRef(null);
  const overlayRef = useRef(null);
  const sourceRef = useRef(null);
  const strokeRef = useRef(null);
  const historyRef = useRef([]);
  const lastEmittedRef = useRef(undefined);
  const previousInputsRef = useRef(null);
  const changeRef = useRef(onChange);
  const operationRef = useRef(0);
  const [brush, setBrush] = useState(48);
  const [erasing, setErasing] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const targetWidth = targetDimension(width);
  const targetHeight = targetDimension(height);
  changeRef.current = onChange;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const paint = paintRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !paint || !overlay) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#10121b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (sourceRef.current)
      context.drawImage(sourceRef.current, 0, 0, canvas.width, canvas.height);
    const tint = overlay.getContext("2d");
    tint.clearRect(0, 0, overlay.width, overlay.height);
    tint.globalCompositeOperation = "source-over";
    tint.drawImage(paint, 0, 0);
    tint.globalCompositeOperation = "source-in";
    tint.fillStyle = "#ba9aff";
    tint.fillRect(0, 0, overlay.width, overlay.height);
    tint.globalCompositeOperation = "source-over";
    context.globalAlpha = 0.56;
    context.drawImage(overlay, 0, 0);
    context.globalAlpha = 1;
  }, []);

  const publish = useCallback(() => {
    const paint = paintRef.current;
    if (!paint) return;
    const exported = makeCanvas(paint.width, paint.height);
    const context = exported.getContext("2d");
    context.fillStyle = "#000";
    context.fillRect(0, 0, exported.width, exported.height);
    context.drawImage(paint, 0, 0);
    const dataURL = exported.toDataURL("image/png");
    lastEmittedRef.current = dataURL;
    changeRef.current(dataURL);
  }, []);

  useEffect(() => {
    const previous = previousInputsRef.current;
    const sourceChanged =
      !previous ||
      previous.image !== image ||
      previous.width !== targetWidth ||
      previous.height !== targetHeight;
    previousInputsRef.current = {
      image,
      width: targetWidth,
      height: targetHeight,
    };
    // Publishing a completed stroke must not reset its canvas or undo history.
    if (
      !sourceChanged &&
      lastEmittedRef.current !== undefined &&
      mask === lastEmittedRef.current
    )
      return;
    const operation = ++operationRef.current;
    let cancelled = false;
    strokeRef.current = null;
    setReady(false);
    setError("");
    historyRef.current = [];
    setUndoCount(0);
    sourceRef.current = null;
    paintRef.current = makeCanvas(targetWidth, targetHeight);
    overlayRef.current = makeCanvas(targetWidth, targetHeight);
    render();

    async function initialize() {
      try {
        const [source, incoming] = await Promise.all([
          image ? loadImage(image) : null,
          mask ? loadImage(mask) : null,
        ]);
        if (cancelled || operation !== operationRef.current) return;
        sourceRef.current = source;
        const paint = paintRef.current;
        if (incoming) {
          const context = paint.getContext("2d", { willReadFrequently: true });
          context.drawImage(incoming, 0, 0, targetWidth, targetHeight);
          const pixels = context.getImageData(0, 0, targetWidth, targetHeight);
          for (let index = 0; index < pixels.data.length; index += 4) {
            const luminance =
              (pixels.data[index] +
                pixels.data[index + 1] +
                pixels.data[index + 2]) /
              3;
            pixels.data[index + 3] = Math.round(
              (luminance * pixels.data[index + 3]) / 255,
            );
            pixels.data[index] = 255;
            pixels.data[index + 1] = 255;
            pixels.data[index + 2] = 255;
          }
          context.putImageData(pixels, 0, 0);
        }
        render();
        setReady(Boolean(source));
        // Resizing an existing mask must also resize its submitted PNG.
        if (
          incoming &&
          (incoming.naturalWidth !== targetWidth ||
            incoming.naturalHeight !== targetHeight)
        )
          publish();
      } catch (cause) {
        if (!cancelled && operation === operationRef.current)
          setError(cause.message || "无法载入蒙版。");
      }
    }
    initialize();
    return () => {
      cancelled = true;
    };
  }, [image, mask, targetWidth, targetHeight, render, publish]);

  function remember() {
    historyRef.current.push(paintRef.current.toDataURL("image/png"));
    if (historyRef.current.length > MAX_UNDO_STEPS) historyRef.current.shift();
    setUndoCount(historyRef.current.length);
  }

  function pointerPosition(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * targetWidth) / rect.width,
      y: ((event.clientY - rect.top) * targetHeight) / rect.height,
    };
  }

  function draw(from, to) {
    const context = paintRef.current.getContext("2d");
    context.globalCompositeOperation = erasing
      ? "destination-out"
      : "source-over";
    context.fillStyle = "#fff";
    context.strokeStyle = "#fff";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brush;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.arc(to.x, to.y, brush / 2, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "source-over";
    render();
  }

  function startStroke(event) {
    if (
      !ready ||
      strokeRef.current ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    remember();
    const position = pointerPosition(event);
    strokeRef.current = { ...position, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(position, position);
  }

  function moveStroke(event) {
    const previous = strokeRef.current;
    if (!previous || previous.pointerId !== event.pointerId) return;
    event.preventDefault();
    const position = pointerPosition(event);
    draw(previous, position);
    strokeRef.current = { ...position, pointerId: event.pointerId };
  }

  function finishStroke(event) {
    if (strokeRef.current?.pointerId !== event.pointerId) return;
    strokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    publish();
  }

  function clearMask() {
    remember();
    const paint = paintRef.current;
    paint.getContext("2d").clearRect(0, 0, paint.width, paint.height);
    render();
    publish();
  }

  function invertMask() {
    remember();
    const paint = paintRef.current;
    const context = paint.getContext("2d");
    context.globalCompositeOperation = "xor";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, paint.width, paint.height);
    context.globalCompositeOperation = "source-over";
    render();
    publish();
  }

  async function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    const operation = ++operationRef.current;
    setReady(false);
    try {
      const restored = await loadImage(previous);
      if (operation !== operationRef.current) return;
      const paint = paintRef.current;
      const context = paint.getContext("2d");
      context.clearRect(0, 0, paint.width, paint.height);
      context.drawImage(restored, 0, 0, paint.width, paint.height);
      setUndoCount(historyRef.current.length);
      render();
      publish();
    } catch (cause) {
      setError(cause.message || "撤销失败。");
    } finally {
      if (operation === operationRef.current)
        setReady(Boolean(sourceRef.current));
    }
  }

  return (
    <div className="mask-editor">
      <div className="mask-toolbar" aria-label="蒙版工具">
        <button
          type="button"
          className={`mask-tool${!erasing ? " active" : ""}`}
          aria-pressed={!erasing}
          onClick={() => setErasing(false)}
        >
          <Paintbrush size={15} />
          画笔
        </button>
        <button
          type="button"
          className={`mask-tool${erasing ? " active" : ""}`}
          aria-pressed={erasing}
          onClick={() => setErasing(true)}
        >
          <Eraser size={15} />
          橡皮
        </button>
        <button
          type="button"
          className="mask-tool"
          disabled={!ready || !undoCount}
          onClick={undo}
          title="撤销最近一次修改"
        >
          <RotateCcw size={15} />
          撤销
        </button>
        <button
          type="button"
          className="mask-tool"
          disabled={!ready}
          onClick={invertMask}
        >
          <FlipHorizontal size={15} />
          反选
        </button>
        <button
          type="button"
          className="mask-tool"
          disabled={!ready}
          onClick={clearMask}
        >
          <Trash2 size={15} />
          清空
        </button>
      </div>
      <div className="mask-brush-control">
        <label htmlFor={sizeId}>笔刷大小</label>
        <input
          id={sizeId}
          type="range"
          min="1"
          max="256"
          value={brush}
          onChange={(event) => setBrush(Number(event.target.value))}
        />
        <output htmlFor={sizeId}>{brush} px</output>
      </div>
      <div
        className="mask-canvas-wrap"
        style={{
          position: "relative",
          aspectRatio: `${targetWidth} / ${targetHeight}`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={targetWidth}
          height={targetHeight}
          role="img"
          aria-label="局部重绘蒙版画布，紫色区域将被重新生成"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor: ready ? "crosshair" : "default",
          }}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onLostPointerCapture={finishStroke}
        />
        {!image && (
          <span
            className="mask-placeholder"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            请先上传需要重绘的原图
          </span>
        )}
      </div>
      <p className="field-help">
        紫色区域将重新生成。原图按 {targetWidth} × {targetHeight}{" "}
        对齐；导出蒙版为同尺寸 PNG，白色为重绘区域，黑色为保留区域。
      </p>
      <p className="field-help">
        支持鼠标、触控笔和触屏绘制；撤销保留最近 {MAX_UNDO_STEPS} 步。
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
