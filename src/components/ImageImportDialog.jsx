import { useEffect, useId, useRef, useState } from "react";
import {loadImportOptions,storeImportOptions,availableImportOptions} from '../lib/import-options.mjs';
import {
  AlertCircle,
  ArrowDownToLine,
  FileImage,
  ImagePlus,
  X,
} from "lucide-react";

const GROUPS = [
  ["prompt", "正面提示词", "Prompt"],
  ["negative", "负面提示词", "Undesired Content"],
  ["characters", "角色与位置", "Characters"],
  ["settings", "生成设置与扩展参数", "Settings"],
  ["seed", "种子", "Seed"],
];

const NON_SETTINGS = new Set([
  "prompt",
  "input",
  "negative_prompt",
  "uc",
  "seed",
  "v4_prompt",
  "v4_negative_prompt",
  "image",
  "mask",
]);

function settingsPreview(parameters = {}) {
  return Object.fromEntries(
    Object.entries(parameters).filter(
      ([key]) =>
        !NON_SETTINGS.has(key) &&
        !/^(reference_|director_reference_)/.test(key),
    ),
  );
}

function displayValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

function groupPreview(group, metadata) {
  const parameters = metadata.parameters || {};
  const body = metadata.payload?.novelai?.body || {};
  switch (group) {
    case "prompt":
      return (
        metadata.prompt ??
        parameters.v4_prompt?.caption?.base_caption ??
        body.input ??
        parameters.prompt ??
        ""
      );
    case "negative":
      return (
        metadata.negative ??
        parameters.v4_negative_prompt?.caption?.base_caption ??
        parameters.negative_prompt ??
        parameters.uc ??
        ""
      );
    case "characters":
      return {
        positive:
          parameters.v4_prompt?.caption?.char_captions ||
          metadata.characters ||
          [],
        negative: parameters.v4_negative_prompt?.caption?.char_captions || [],
        use_coords: parameters.v4_prompt?.use_coords ?? false,
      };
    case "settings":
      return settingsPreview(parameters);
    case "seed":
      return metadata.seed ?? parameters.seed;
    default:
      return "";
  }
}

export default function ImageImportDialog({
  candidate,
  onClose,
  onApply,
  onUseImage,
}) {
  const dialogRef = useRef(null);
  const isOpen = !!candidate;
  const titleId = useId();
  const [selected, setSelected] = useState(loadImportOptions);
  const metadata = candidate?.metadata;
  const available = metadata?.available || {};
  const loading = !!candidate?.loading;
  const hasImportable = GROUPS.some(([key]) => !!available[key]);
  const canApply =
    !loading &&
    !candidate?.error &&
    GROUPS.some(([key]) => available[key] && selected[key]);
  const sourceModel =
    metadata?.sourceModel ||
    metadata?.payload?.model ||
    metadata?.payload?.novelai?.body?.model;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!candidate) return null;

  function updateSelection(key, checked) {
    const next={...selected,[key]:checked};setSelected(next);storeImportOptions(next);
  }

  function closeOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-import-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={closeOnBackdrop}
    >
      <header className="image-import-header">
        <div>
          <h2 id={titleId}>从图片继续创作</h2>
          <p>读取图片中保存的提示词和生成参数。</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭图片导入"
          title="关闭"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </header>

      <div className="image-import-body">
        <figure className="image-import-preview">
          {candidate.dataURL ? (
            <img src={candidate.dataURL} alt="准备导入的图片" />
          ) : (
            <div className="image-import-placeholder">
              <FileImage size={40} />
            </div>
          )}
          <figcaption>
            <strong>
              {candidate.file?.name || metadata?.filename || "导入图片"}
            </strong>
            {metadata?.width && metadata?.height ? (
              <span>
                {metadata.width} × {metadata.height}
              </span>
            ) : null}
            {metadata?.source ? <span>{metadata.source}</span> : null}
          </figcaption>
          <button
            type="button"
            className="wide"
            disabled={!candidate.dataURL || loading}
            onClick={() => onUseImage(candidate)}
          >
            <ImagePlus size={16} /> 仅用作图生图
          </button>
        </figure>

        <div className="image-import-options" aria-busy={loading}>
          {loading ? (
            <p role="status">正在读取图片元数据…</p>
          ) : candidate.error ? (
            <div className="import-notice" role="alert">
              <AlertCircle size={18} />
              <p>
                {candidate.error}
                <br />
                仍可将图片用作图生图。
              </p>
            </div>
          ) : !hasImportable ? (
            <div className="import-empty">
              <FileImage size={28} />
              <h3>这张图片没有可导入的生成参数</h3>
              <p>
                图片可能没有保存元数据，或元数据已在转存时被移除。无法仅凭画面还原原始提示词和设置。
              </p>
              <p>你仍可以将它用作图生图的原图。</p>
            </div>
          ) : (
            <>
              <div className="section-label">
                <h3>选择要导入的内容</h3>
                <small>{metadata.format || "图片元数据"}</small>
              </div>
              <div className="import-group-list">
                {GROUPS.map(([key, label, english]) => (
                  <section
                    className={`import-group${available[key] ? "" : " unavailable"}`}
                    key={key}
                  >
                    <label className="import-group-label">
                      <input
                        type="checkbox"
                        checked={!!selected[key] && !!available[key]}
                        disabled={!available[key]}
                        onChange={(event) =>
                          updateSelection(key, event.target.checked)
                        }
                      />
                      <span>
                        {label}
                        <small>{english}</small>
                      </span>
                      {!available[key] && <em>图片中未记录</em>}
                    </label>
                    {available[key] && (
                      <details className="import-group-preview">
                        <summary>查看内容</summary>
                        <pre>
                          {displayValue(groupPreview(key, metadata)) ||
                            "（已记录为空）"}
                        </pre>
                      </details>
                    )}
                  </section>
                ))}
              </div>
              <p className="import-preference-hint">已记住上次勾选；图片中没有的项目暂不可选。</p>
              <label className="toggle import-append">
                <input
                  type="checkbox"
                  checked={!!selected.append}
                  onChange={(event) =>
                    updateSelection("append", event.target.checked)
                  }
                />
                <span>
                  追加提示词与角色
                  <small>
                    勾选时保留已有内容；生成设置与种子始终按所选内容替换。
                  </small>
                </span>
              </label>
            </>
          )}

          {sourceModel && sourceModel !== "nai-diffusion-5-full" && (
            <p className="import-model-note">
              图片记录的模型为 {sourceModel}。导入后继续使用 V5
              Full，画面可能与原图不同。
            </p>
          )}
          {metadata?.warnings?.length > 0 && (
            <ul className="import-warnings">
              {metadata.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {metadata?.raw && (
            <details className="import-raw">
              <summary>查看原始元数据</summary>
              <pre>{displayValue(metadata.raw)}</pre>
            </details>
          )}
        </div>
      </div>

      <footer className="image-import-footer">
        <p>在本机读取图片；此操作不会调用生成接口。</p>
        <div>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canApply}
            onClick={() => onApply(availableImportOptions(selected,available))}
          >
            <ArrowDownToLine size={16} /> 导入所选参数
          </button>
        </div>
      </footer>
    </dialog>
  );
}
