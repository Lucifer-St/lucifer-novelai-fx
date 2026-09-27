import { useState } from "react";
import { schema } from "../lib/request.mjs";
import {parameterSupported} from '../lib/model-policy.mjs';
import { NumberField, Select, Toggle, ObjectValue } from "./Fields";
const resolve = (s) =>
  s.$ref
    ? { ...schema.definitions[s.$ref.split("/").pop()], ...s }
    : s.allOf
      ? { ...resolve(s.allOf[0]), ...s }
      : s;
export default function AdvancedFields({ values, onChange, model }) {
  const [search, setSearch] = useState("");
  const set = (k, v) => onChange({ ...values, [k]: v });
  const remove = (k) => {
    const n = { ...values };
    delete n[k];
    onChange(n);
  };
  return (
    <div className="advanced-fields">
      <p className="hint">
        完整官方参数表。勾选才覆盖工作台设置；对象和数组可编辑
        JSON。字段可透传不代表所有模型都支持。
      </p>
      <input
        aria-label="搜索 API 参数"
        placeholder={`搜索 ${Object.keys(schema.imageParameters).length} 个参数…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {Object.entries(schema.imageParameters)
        .filter(([key])=>!model||parameterSupported(model,key))
        .filter(([k]) => k.toLowerCase().includes(search.toLowerCase()))
        .map(([key, raw]) => {
          const s = resolve(raw),
            enabled = Object.hasOwn(values, key),
            value = values[key];
          const initial =
            s.default ??
            (s.enum
              ? s.enum[0]
              : s.type === "boolean"
                ? false
                : s.type === "array"
                  ? []
                  : s.type === "object"
                    ? {}
                    : s.type === "number" || s.type === "integer"
                      ? 0
                      : "");
          return (
            <div key={key} className="parameter-row">
              <label className="param-enable">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    e.target.checked ? set(key, initial) : remove(key)
                  }
                />
                <code>{key}</code>
                <small>{s.type || "object"}</small>
              </label>
              {enabled && (
                <div className="parameter-value">
                  {s.enum ? (
                    <Select
                      label={`${key} 值`}
                      value={value}
                      options={s.enum}
                      onChange={(v) => set(key, v)}
                    />
                  ) : s.type === "boolean" ? (
                    <Toggle
                      label={`${key} 值`}
                      checked={value}
                      onChange={(v) => set(key, v)}
                    />
                  ) : ["number", "integer"].includes(s.type) ? (
                    <NumberField
                      label={`${key} 值`}
                      value={value}
                      onChange={(v) => set(key, v)}
                      min={s.minimum}
                      max={s.maximum}
                      step={s.type === "integer" ? 1 : "any"}
                    />
                  ) : s.type === "array" ||
                    s.type === "object" ||
                    s.properties ? (
                    <ObjectValue
                      label={`${key} JSON`}
                      value={value}
                      onChange={(v) => set(key, v)}
                    />
                  ) : (
                    <input
                      aria-label={`${key} 值`}
                      value={value}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                </div>
              )}
              {s.description && <small>{s.description}</small>}
            </div>
          );
        })}
    </div>
  );
}
