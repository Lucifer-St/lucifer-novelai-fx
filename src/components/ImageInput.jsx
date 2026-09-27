import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload, X, FileSearch } from "lucide-react";
import { IMAGE_ACCEPT, readImageFile } from "../lib/image.mjs";

export default function ImageInput({
  label,
  value,
  onChange,
  help,
  accept = "image/*",
  onInspect,
}) {
  const id = useId();
  const inputRef = useRef(null);
  const originalFile = useRef(null);
  const requestRef = useRef(0);
  const dragDepthRef = useRef(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [metadata, setMetadata] = useState(null);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  async function selectFile(file) {
    if (!file) return;
    const request = ++requestRef.current;
    setError("");
    setBusy(true);
    try {
      const result = await readImageFile(file);
      if (request !== requestRef.current) return;
      const details = {
        name: result.name,
        width: result.width,
        height: result.height,
      };
      setMetadata({ ...details, source: result.dataURL });
      originalFile.current = { file, source: result.dataURL };
      onChange(result.dataURL, details);
    } catch (cause) {
      if (request === requestRef.current)
        setError(cause.message || "图片读取失败。");
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  }

  function removeImage() {
    requestRef.current += 1;
    setBusy(false);
    setMetadata(null);
    originalFile.current = null;
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    onChange(null, null);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 1) {
      setError("每次请选择一张图片。");
      return;
    }
    if (files.length) selectFile(files[0]);
  }
  async function inspectCurrent() {
    if (!value || !onInspect) return;
    try {
      if (originalFile.current?.source === value)
        return onInspect(originalFile.current.file);
      const [header, encoded] = value.split(",");
      const bytes = Uint8Array.from(atob(encoded), (char) =>
        char.charCodeAt(0),
      );
      const mime = header.match(/^data:([^;]+)/)?.[1] || "image/png";
      onInspect(new File([bytes], "已上传图片", { type: mime }));
    } catch (error) {
      setError(error.message || "无法读取图片信息。");
    }
  }

  return (
    <div
      className={`image-input${dragging ? " is-dragging" : ""}${busy ? " is-loading" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setDragging(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div className="image-input-heading">
        <label htmlFor={id}>{label}</label>
        {value && onInspect && (
          <button
            type="button"
            onClick={inspectCurrent}
            className="image-inspect"
            aria-label={`读取${label || "图片"}参数`}
          >
            <FileSearch size={14} /> 读取参数
          </button>
        )}
        {value && (
          <button
            type="button"
            className="icon-button image-remove"
            aria-label={`移除${label || "图片"}`}
            title="移除图片"
            onClick={removeImage}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <input
        id={id}
        ref={inputRef}
        type="file"
        hidden
        accept={accept === "image/*" ? IMAGE_ACCEPT : accept}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={`image-upload-zone${value ? " has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        aria-label={`${value ? "替换" : "上传"}${label || "图片"}`}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        aria-busy={busy}
      >
        {value ? (
          <div className="image-preview">
            <img src={value} alt={label || "已选择的图片"} />
            <span className="image-replace">
              <Upload size={14} />
              {busy ? "正在读取…" : "点击替换 / 拖入图片"}
            </span>
          </div>
        ) : (
          <span className="image-upload-empty">
            <ImagePlus size={23} />
            <span>{busy ? "正在读取…" : "点击上传或拖入图片"}</span>
            <small>PNG / JPEG / WebP · 本地读取最大 64 MB</small>
          </span>
        )}
      </button>
      {metadata?.source === value && (
        <p className="image-metadata" title={metadata.name}>
          {metadata.name} · {metadata.width} × {metadata.height}
        </p>
      )}
      <p id={`${id}-help`} className="field-help">
        {help || "文件只在本机读取；提交请求时才发送至网关。"}
      </p>
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
