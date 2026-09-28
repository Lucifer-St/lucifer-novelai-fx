import { useEffect, useId, useRef, useState } from "react";
export function Field({ label, help, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      <div className="field-label">{label}</div>
      {children}
      {help && <small>{help}</small>}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  help,
  normalize,
}) {
  const id = useId();
  const [draft,setDraft]=useState(null);
  const emitted=useRef(value);
  useEffect(()=>{if(!Object.is(value,emitted.current))setDraft(null);emitted.current=value;},[value]);
  function change(raw){
    if(!normalize){onChange(raw===''?'':Number(raw));return;}
    setDraft(raw);
    const next=normalize(raw);
    if(next!==null){emitted.current=next;onChange(next);}
  }
  function finish(event){
    if(!normalize)return;
    const next=normalize(event.currentTarget.value);
    if(next!==null){emitted.current=next;onChange(next);}
    setDraft(null);
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={normalize&&draft!==null?draft:value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={event=>change(event.target.value)}
        onBlur={finish}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent?.isComposing)finish(event);}}
      />
      {help && <small>{help}</small>}
    </div>
  );
}
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  help,
  tooltip,
}) {
  const id = useId();
  return (
    <div className="field slider-field">
      <div className="slider-label">
        <span className="slider-label-text"><label htmlFor={id}>{label}</label>{tooltip&&<span className="parameter-help"><button type="button" className="parameter-help-button" aria-label={`${label} 说明`} aria-describedby={`${id}-help`}>?</button><span id={`${id}-help`} role="tooltip">{tooltip}</span></span>}</span>
        <input
          aria-label={`${label} 数值`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {help && <small>{help}</small>}
    </div>
  );
}
export function Toggle({ label, checked, onChange, help }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {help && <small>{help}</small>}
      </span>
    </label>
  );
}
export function Select({ label, value, onChange, options, help }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o}>{o}</option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
      {help && <small>{help}</small>}
    </div>
  );
}
export function JsonField({ label, value, onChange, help, rows = 7 }) {
  return (
    <div className="field">
      <label>
        {label}
        <textarea
          aria-label={label}
          className="code"
          rows={rows}
          value={value}
          spellCheck="false"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {help && <small>{help}</small>}
    </div>
  );
}
export function ObjectValue({ label, value, onChange, description }) {
  const lastEmitted = useRef(value);
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  useEffect(() => {
    if (lastEmitted.current === value) return;
    if (
      value &&
      typeof value === "object" &&
      Object.hasOwn(value, "__studioInvalidJSON")
    ) {
      setText(value.__studioInvalidJSON);
      setError("JSON 尚未有效，生成已阻止。");
    } else {
      setText(JSON.stringify(value, null, 2));
      setError("");
    }
    lastEmitted.current = value;
  }, [value]);
  return (
    <>
      <JsonField
        label={label}
        value={text}
        onChange={(t) => {
          setText(t);
          try {
            const parsed = JSON.parse(t);
            lastEmitted.current = parsed;
            onChange(parsed);
            setError("");
          } catch {
            setError("JSON 尚未有效，生成已阻止。");
            const invalid = { __studioInvalidJSON: t };
            lastEmitted.current = invalid;
            onChange(invalid);
          }
        }}
        help={description}
      />
      {error && <small className="error-text">{error}</small>}
    </>
  );
}
