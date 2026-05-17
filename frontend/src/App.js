import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = "http://127.0.0.1:5000/predict";

const DEFECT_META = {
  crazing: {
    label: "Crazing",
    color: "#BA7517", bg: "#FAEEDA", text: "#854F0B",
    description: "A network of fine cracks spread across the surface, resembling a spider web. Caused by thermal stress or tensile strain during manufacturing.",
  },
  inclusion: {
    label: "Inclusion",
    color: "#E24B4A", bg: "#FCEBEB", text: "#A32D2D",
    description: "Foreign particles (slag, oxides) trapped inside the steel during solidification. Can severely compromise structural integrity and fatigue life.",
  },
  patches: {
    label: "Patches",
    color: "#3B6D11", bg: "#EAF3DE", text: "#3B6D11",
    description: "Irregular discolored zones on the surface caused by uneven scale removal or localized oxidation.",
  },
  pitted: {
    label: "Pitted",
    color: "#E24B4A", bg: "#FCEBEB", text: "#A32D2D",
    description: "Small cavities or craters on the surface due to electrochemical corrosion or gas entrapment. Pitting accelerates corrosion and reduces load-bearing capacity.",
  },
  "rolled-in": {
    label: "Rolled-in Scale",
    color: "#BA7517", bg: "#FAEEDA", text: "#854F0B",
    description: "Oxide scale from earlier processing stages pressed into the surface during rolling. Creates rough surface patches that weaken adhesion of coatings.",
  },
  scratches: {
    label: "Scratches",
    color: "#3B6D11", bg: "#EAF3DE", text: "#3B6D11",
    description: "Linear surface marks caused by abrasive contact during handling, rolling, or transport. Usually shallow but can act as stress concentrators.",
  },
};

/* Loading stage messages shown sequentially before result appears */
const LOADING_STAGES = [
  "Preprocessing image…",
  "Running MobileNetV2…",
  "Evaluating surface features…",
  "Generating prediction…",
];

let uid = 0;

/* ── Animated confidence bar ── */
function ConfBar({ pct, color }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 2, transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
  );
}

/* ── Loading stage indicator ── */
function LoadingStages({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#185FA5", fontFamily: "monospace" }}>
      <span style={{
        width: 11, height: 11, border: "2px solid rgba(0,91,172,0.2)",
        borderTopColor: "#005bac", borderRadius: "50%", display: "inline-block",
        animation: "spin 0.7s linear infinite", flexShrink: 0,
      }} />
      <span style={{ animation: "fadeUp 0.3s ease both" }} key={stage}>{LOADING_STAGES[stage] || "Analyzing…"}</span>
    </div>
  );
}

/* ── Expandable description row ── */
function DescriptionRow({ item, colCount }) {
  const meta = item.prediction ? DEFECT_META[item.prediction] : null;
  if (item.status !== "done" || !meta) return null;
  return (
    <div style={{
      padding: "0 14px 14px 82px",
      borderBottom: "0.5px solid #F1EFE8",
      animation: "slideDown 0.35s ease both",
    }}>
      <div style={{
        background: meta.bg,
        border: `0.5px solid ${meta.color}30`,
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🔍</span>
        <p style={{ margin: 0, fontSize: 12, color: meta.text, lineHeight: 1.6 }}>
          {meta.description}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [items, setItems]       = useState([]);
  const [running, setRunning]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [stages, setStages]     = useState({}); // id → stage index
  const fileRef                 = useRef(null);

  const addFiles = useCallback((files) => {
    const valid = Array.from(files).filter(
      f => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024
    );
    setItems(prev => [
      ...prev,
      ...valid.map(file => ({
        id: ++uid,
        file,
        url: URL.createObjectURL(file),
        status: "idle",
        prediction: null,
        confidence: null,
        error: null,
      })),
    ]);
  }, []);

  const remove = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const clear  = ()   => { setItems([]); setStages({}); };

  /* Animate loading stages for a given item id */
  const animateStages = (id) => {
    return new Promise(resolve => {
      let s = 0;
      setStages(prev => ({ ...prev, [id]: 0 }));
      const interval = setInterval(() => {
        s++;
        if (s >= LOADING_STAGES.length) {
          clearInterval(interval);
          resolve();
        } else {
          setStages(prev => ({ ...prev, [id]: s }));
        }
      }, 600); // each stage shows for 600ms → ~2.4s total
    });
  };

  const runAll = async () => {
    const pending = items.filter(i => i.status === "idle" || i.status === "error");
    if (!pending.length) return;
    setRunning(true);

    for (const item of pending) {
      // Mark as loading
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "loading" } : i));

      // Fire API call and animate stages in parallel
      const [res] = await Promise.all([
        (async () => {
          const fd = new FormData();
          fd.append("image", item.file);
          try {
            return await axios.post(API_URL, fd);
          } catch {
            return null;
          }
        })(),
        animateStages(item.id),
      ]);

      // Small pause after stages finish for dramatic effect
      await new Promise(r => setTimeout(r, 200));

      // Apply result
      if (!res) {
        setItems(prev => prev.map(i => i.id === item.id
          ? { ...i, status: "error", error: "Server unreachable." } : i));
      } else if (res.data.invalid) {
        setItems(prev => prev.map(i => i.id === item.id
          ? { ...i, status: "error", error: res.data.message } : i));
      } else {
        setItems(prev => prev.map(i => i.id === item.id
          ? { ...i, status: "done", prediction: res.data.prediction, confidence: res.data.confidence } : i));
      }

      setStages(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    }
    setRunning(false);
  };

  const pendingCount = items.filter(i => i.status === "idle" || i.status === "error").length;
  const doneCount    = items.filter(i => i.status === "done").length;
  const errorCount   = items.filter(i => i.status === "error").length;

  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes scanLine  { 0% { top: 0; } 100% { top: 100%; } }
        @keyframes fadeUp    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 200px; } }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      <div style={S.card}>

        {/* ── Header ── */}
        <div style={S.header}>
          <img src="/image.png" alt="Tata Steel" style={S.logo} />
          <div>
            <h1 style={S.title}>Tata Steel Defect Analyzer</h1>
            <p style={S.subtitle}>AI-powered surface defect detection · MobileNetV2</p>
          </div>
        </div>

        <div style={S.divider} />

        {/* ── Upload zone ── */}
        <div
          style={{ ...S.dropzone, ...(dragOver ? S.dropzoneHover : {}) }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          role="button" tabIndex={0}
          onKeyDown={e => e.key === "Enter" && fileRef.current?.click()}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke={dragOver ? "#005bac" : "#B4B2A9"} strokeWidth="1.5" strokeLinecap="round"
            style={{ marginBottom: 8, transition: "stroke 0.15s" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: dragOver ? "#005bac" : "#444441" }}>
            Drop images or click to browse
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#B4B2A9", fontFamily: "monospace" }}>
            Multiple files · JPG · PNG · WEBP · Max 10 MB each
          </p>
          <input ref={fileRef} type="file" accept="image/*" multiple
            onChange={e => addFiles(e.target.files)} style={{ display: "none" }} />
        </div>

        {/* ── Action row ── */}
        {items.length > 0 && (
          <div style={S.actionRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#2C2C2A" }}>
                {items.length} image{items.length !== 1 ? "s" : ""}
              </span>
              {doneCount > 0 && (
                <span style={{ fontSize: 12, color: "#3B6D11", fontFamily: "monospace" }}>✓ {doneCount} done</span>
              )}
              {errorCount > 0 && (
                <span style={{ fontSize: 12, color: "#A32D2D", fontFamily: "monospace" }}>⚠ {errorCount} invalid</span>
              )}
              {running && (
                <span style={{ fontSize: 12, color: "#185FA5", fontFamily: "monospace", animation: "pulse 1.2s ease infinite" }}>
                  ● Batch running…
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={clear} disabled={running}
                style={{ ...S.ghostBtn, opacity: running ? 0.4 : 1 }}>
                Clear all
              </button>
              <button
                onClick={runAll}
                disabled={running || pendingCount === 0}
                style={{ ...S.predictBtn, opacity: running || pendingCount === 0 ? 0.45 : 1, cursor: running || pendingCount === 0 ? "not-allowed" : "pointer" }}
              >
                {running
                  ? <><span style={S.btnSpinner} /> Analyzing…</>
                  : `Predict all (${pendingCount})`}
              </button>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {items.length > 0 && (
          <div style={S.table}>

            {/* Header */}
            <div style={S.tableHead}>
              <span style={{ flex: "0 0 56px" }}>Image</span>
              <span style={{ flex: 1 }}>File name</span>
              <span style={{ flex: "0 0 150px", textAlign: "center" }}>Status / Prediction</span>
              <span style={{ flex: "0 0 110px", textAlign: "center" }}>Confidence</span>
              <span style={{ flex: "0 0 32px" }} />
            </div>

            {/* Rows */}
            {items.map(item => {
              const meta  = item.prediction ? DEFECT_META[item.prediction] : null;
              const stage = stages[item.id] ?? 0;

              return (
                <div key={item.id}>
                  {/* Main row */}
                  <div style={{
                    ...S.tableRow,
                    background: item.status === "done" && meta ? meta.bg + "22" : "#fff",
                  }}>

                    {/* Thumbnail */}
                    <div style={{ flex: "0 0 56px", position: "relative" }}>
                      <img
                        src={item.url}
                        alt={item.file.name}
                        style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: `0.5px solid ${meta ? meta.color + "60" : "#D3D1C7"}`, display: "block" }}
                      />
                      {item.status === "loading" && (
                        <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden", background: "rgba(0,91,172,0.07)" }}>
                          <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "#005bac", opacity: 0.8, animation: "scanLine 1.1s linear infinite" }} />
                        </div>
                      )}
                      {item.status === "done" && meta && (
                        <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: meta.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </div>

                    {/* Filename + size */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#2C2C2A", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.file.name}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#B4B2A9", fontFamily: "monospace" }}>
                        {(item.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>

                    {/* Prediction / Status */}
                    <div style={{ flex: "0 0 150px", textAlign: "center" }}>
                      {item.status === "idle" && (
                        <span style={S.pillGray}>Pending</span>
                      )}
                      {item.status === "loading" && (
                        <LoadingStages stage={stage} />
                      )}
                      {item.status === "error" && (
                        <div>
                          <span style={{ fontSize: 11, color: "#A32D2D", fontFamily: "monospace" }}>⚠ Invalid image</span>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: "#C88080", fontFamily: "monospace", lineHeight: 1.3 }}>{item.error}</p>
                        </div>
                      )}
                      {item.status === "done" && meta && (
                        <span style={{ ...S.defectPill, background: meta.bg, color: meta.text, animation: "fadeUp 0.4s ease both" }}>
                          {meta.label}
                        </span>
                      )}
                    </div>

                    {/* Confidence */}
                    <div style={{ flex: "0 0 110px", textAlign: "center" }}>
                      {item.status === "done" && meta && (
                        <div style={{ animation: "fadeUp 0.5s 0.1s ease both" }}>
                          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: meta.color }}>
                            {Math.round(item.confidence)}%
                          </span>
                          <div style={{ height: 4, background: "#F1EFE8", borderRadius: 2, overflow: "hidden", width: 80, margin: "5px auto 0" }}>
                            <ConfBar pct={Math.round(item.confidence)} color={meta.color} />
                          </div>
                        </div>
                      )}
                      {(item.status === "idle" || item.status === "loading" || item.status === "error") && (
                        <span style={{ fontSize: 13, color: "#D3D1C7", fontFamily: "monospace" }}>—</span>
                      )}
                    </div>

                    {/* Remove */}
                    <div style={{ flex: "0 0 32px", display: "flex", justifyContent: "center" }}>
                      <button onClick={() => remove(item.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#C8C6BE", fontSize: 16, lineHeight: 1, padding: 4 }}
                        title="Remove">✕</button>
                    </div>
                  </div>

                  {/* Description row — slides in below when done */}
                  <DescriptionRow item={item} />
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <p style={{ textAlign: "center", color: "#C8C6BE", fontSize: 13, fontFamily: "monospace", marginTop: 4 }}>
            No images added yet — upload some steel surface images above
          </p>
        )}

      </div>
    </div>
  );
}

/* ── Styles ── */
const S = {
  page: {
    minHeight: "100vh",
    background: "#F1EFE8",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "2rem 1rem",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 900,
    background: "#fff",
    borderRadius: 16,
    border: "0.5px solid #D3D1C7",
    padding: "2rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: "1.25rem",
  },
  logo: {
    width: 52,
    height: 52,
    objectFit: "contain",
    borderRadius: 8,
    border: "0.5px solid #D3D1C7",
    padding: 3,
  },
  title: {
    margin: 0,
    fontSize: 19,
    fontWeight: 700,
    color: "#005bac",
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "2px 0 0",
    fontSize: 12,
    color: "#888780",
    fontFamily: "monospace",
  },
  divider: {
    borderTop: "0.5px solid #D3D1C7",
    marginBottom: "1.5rem",
  },
  dropzone: {
    border: "1.5px dashed #C8C6BE",
    borderRadius: 12,
    background: "#F9F8F4",
    padding: "1.75rem",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.15s",
    marginBottom: "1.25rem",
  },
  dropzoneHover: {
    background: "#E6F1FB",
    borderColor: "#005bac",
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
    gap: 12,
    flexWrap: "wrap",
  },
  ghostBtn: {
    background: "none",
    border: "0.5px solid #D3D1C7",
    borderRadius: 7,
    padding: "7px 14px",
    fontSize: 12,
    color: "#888780",
    cursor: "pointer",
    fontFamily: "monospace",
  },
  predictBtn: {
    background: "#005bac",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "opacity 0.15s",
  },
  btnSpinner: {
    width: 12,
    height: 12,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },
  table: {
    border: "0.5px solid #D3D1C7",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  tableHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 14px",
    background: "#F9F8F4",
    borderBottom: "0.5px solid #D3D1C7",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#888780",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "0.5px solid #F1EFE8",
    transition: "background 0.3s",
  },
  pillGray: {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 10,
    background: "#F1EFE8",
    color: "#888780",
    fontFamily: "monospace",
  },
  defectPill: {
    fontSize: 12,
    padding: "4px 14px",
    borderRadius: 10,
    fontFamily: "monospace",
    fontWeight: 600,
    display: "inline-block",
  },
};