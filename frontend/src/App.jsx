import { useEffect, useMemo, useRef, useState } from 'react'
import ShapeCanvas from './ShapeCanvas.jsx'

const SIZE_PRESETS = [
  { label: 'Desktop · 1920×1080', w: 1920, h: 1080 },
  { label: 'Desktop · 2560×1440', w: 2560, h: 1440 },
  { label: 'Phone · 1080×1920', w: 1080, h: 1920 },
  { label: 'Square · 2048×2048', w: 2048, h: 2048 },
]

const TEMPLATES = [
  { id: 'burst', label: '☀ Burst', hint: 'scattered polaroids, big in the middle' },
  { id: 'mosaic', label: '▦ Mosaic', hint: 'edge-to-edge artsy grid' },
  { id: 'shape', label: '♥ Shape', hint: 'photos fill a silhouette' },
]

const SHAPES = [
  { id: 'heart', label: '♥ heart' },
  { id: 'star', label: '★ star' },
  { id: 'circle', label: '● circle' },
  { id: 'custom', label: '✎ draw your own' },
]

const FEW_PICS_THRESHOLD = 16
const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|tiff)$/i

// servers (and nginx) sometimes answer with HTML, not JSON
async function readError(res, fallback) {
  const text = await res.text().catch(() => '')
  try {
    return JSON.parse(text).detail || fallback
  } catch {
    if (res.status === 413) return 'upload too large for the server — try fewer photos at once'
    return `${fallback} (${res.status})`
  }
}

export default function App() {
  const [uploads, setUploads] = useState([]) // {id, label, images:[{path,name,dir}]}
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [generating, setGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [showShapeModal, setShowShapeModal] = useState(false)
  // folder picked in the dialog that contains subfolders: {name, files, recursive}
  const [pendingFolder, setPendingFolder] = useState(null)
  const folderInputRef = useRef(null)

  const [cfg, setCfg] = useState({
    template: 'burst',
    sizeIdx: 0,
    bg_style: 'radial',
    bg_color1: '#fdf3e0',
    bg_color2: '#e8c98f',
    collage_opacity: 1.0,
    density: 1.0,
    polaroid: true,
    duplicate: true,
    title: '',
    subtitle: '',
    text_color: '#3a3530',
    text_size: 1.0,
    text_spacing: 1.5,
    text_box_opacity: 0.65,
    shape: 'heart',
    shape_points: null,
    seed: 42,
  })

  const set = (key, value) => setCfg((c) => ({ ...c, [key]: value }))

  const images = useMemo(() => uploads.flatMap((u) => u.images), [uploads])

  // ----------------------------------------------- folder dialog + upload
  const onFolderPicked = (e) => {
    const all = [...e.target.files]
    e.target.value = ''
    const files = all.filter((f) => IMAGE_RE.test(f.name))
    if (!files.length) {
      setError('no images found in that folder ☁')
      return
    }
    const name = (files[0].webkitRelativePath || files[0].name).split('/')[0]
    const hasSubdirs = files.some(
      (f) => (f.webkitRelativePath || '').split('/').length > 2,
    )
    if (hasSubdirs) {
      setPendingFolder({ name, files, recursive: true })
    } else {
      uploadFiles(name, files)
    }
  }

  const BATCH_BYTES = 20 * 1024 * 1024
  const BATCH_FILES = 30

  const uploadFiles = async (name, files) => {
    setPendingFolder(null)
    setUploading(true)
    setError('')
    try {
      // upload in small batches so no single request gets too large
      const batches = []
      let current = []
      let bytes = 0
      for (const f of files) {
        if (current.length && (bytes + f.size > BATCH_BYTES || current.length >= BATCH_FILES)) {
          batches.push(current)
          current = []
          bytes = 0
        }
        current.push(f)
        bytes += f.size
      }
      if (current.length) batches.push(current)

      const allImages = []
      for (let b = 0; b < batches.length; b++) {
        setUploadProgress(`${b + 1}/${batches.length}`)
        const fd = new FormData()
        batches[b].forEach((f) => fd.append('files', f, f.name))
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await readError(res, 'upload failed'))
        const data = await res.json()
        allImages.push(...data.images)
      }
      setUploads((u) => [
        ...u,
        { id: allImages[0].dir, label: name, images: allImages },
      ])
      setSelected((s) => new Set([...s, ...allImages.map((i) => i.path)]))
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const confirmPendingFolder = () => {
    const { name, files, recursive } = pendingFolder
    const chosen = recursive
      ? files
      : files.filter((f) => (f.webkitRelativePath || '').split('/').length <= 2)
    if (!chosen.length) {
      setError('the top folder itself has no images — try including subfolders')
      return
    }
    uploadFiles(name, chosen)
  }

  const removeUpload = (id) => {
    const gone = uploads.find((u) => u.id === id)
    setUploads((u) => u.filter((x) => x.id !== id))
    if (gone) {
      setSelected((s) => {
        const next = new Set(s)
        gone.images.forEach((i) => next.delete(i.path))
        return next
      })
    }
  }

  const toggle = (path) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const selectedList = useMemo(
    () => images.filter((i) => selected.has(i.path)).map((i) => i.path),
    [images, selected],
  )

  const fewPics = selectedList.length > 0 && selectedList.length < FEW_PICS_THRESHOLD

  const generate = async () => {
    if (!selectedList.length) { setError('pick at least one photo ✿'); return }
    if (cfg.template === 'shape' && cfg.shape === 'custom' && (!cfg.shape_points || cfg.shape_points.length < 3)) {
      setShowShapeModal(true)
      return
    }
    setGenerating(true)
    setError('')
    const preset = SIZE_PRESETS[cfg.sizeIdx]
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: selectedList,
          width: preset.w,
          height: preset.h,
          template: cfg.template,
          bg_style: cfg.bg_style,
          bg_color1: cfg.bg_color1,
          bg_color2: cfg.bg_color2,
          collage_opacity: cfg.collage_opacity,
          density: cfg.density,
          polaroid: cfg.polaroid,
          duplicate: cfg.duplicate,
          title: cfg.title,
          subtitle: cfg.subtitle,
          text_color: cfg.text_color,
          text_size: cfg.text_size,
          text_spacing: cfg.text_spacing,
          text_box_opacity: cfg.text_box_opacity,
          shape: cfg.shape,
          shape_points: cfg.shape_points,
          seed: cfg.seed,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, 'generate failed'))
      const blob = await res.blob()
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(blob)
      })
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>wallpa<span>api</span> ✿</h1>
        <p>turn your photo folders into a cozy collage wallpaper</p>
      </header>

      <div className="layout">
        {/* ------------------------------------------------ left: controls */}
        <aside className="panel controls">
          <section>
            <h2>📁 folders</h2>
            <button
              className="btn wide"
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? `☁ uploading photos… ${uploadProgress}` : '📂 choose folder…'}
            </button>
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              hidden
              onChange={onFolderPicked}
            />
            {pendingFolder && (
              <div className="notice stack">
                🌿 “{pendingFolder.name}” has subfolders — which photos?
                <label className="check">
                  <input
                    type="radio"
                    name="recurse"
                    checked={!pendingFolder.recursive}
                    onChange={() => setPendingFolder((p) => ({ ...p, recursive: false }))}
                  />
                  just this folder
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="recurse"
                    checked={pendingFolder.recursive}
                    onChange={() => setPendingFolder((p) => ({ ...p, recursive: true }))}
                  />
                  include subfolders (recursive)
                </label>
                <div className="row end">
                  <button className="btn small" onClick={() => setPendingFolder(null)}>cancel</button>
                  <button className="btn primary small" onClick={confirmPendingFolder}>upload ✿</button>
                </div>
              </div>
            )}
            <div className="chips">
              {uploads.map((u) => (
                <span className="chip upload" key={u.id} title={`${u.images.length} uploaded photos`}>
                  📤 {u.label}
                  <button onClick={() => removeUpload(u.id)}>×</button>
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2>🎨 template</h2>
            <div className="template-row">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`template ${cfg.template === t.id ? 'active' : ''}`}
                  title={t.hint}
                  onClick={() => set('template', t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {cfg.template === 'shape' && (
              <div className="shape-row">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    className={`pill ${cfg.shape === s.id ? 'active' : ''}`}
                    onClick={() => {
                      set('shape', s.id)
                      if (s.id === 'custom') setShowShapeModal(true)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <label className="field">
              wallpaper size
              <select value={cfg.sizeIdx} onChange={(e) => set('sizeIdx', +e.target.value)}>
                {SIZE_PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>{p.label}</option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h2>🌸 background</h2>
            <label className="field">
              style
              <select value={cfg.bg_style} onChange={(e) => set('bg_style', e.target.value)}>
                <option value="solid">solid</option>
                <option value="linear">linear gradient</option>
                <option value="radial">radial glow</option>
              </select>
            </label>
            <div className="row">
              <label className="field color">
                color 1
                <input type="color" value={cfg.bg_color1} onChange={(e) => set('bg_color1', e.target.value)} />
              </label>
              {cfg.bg_style !== 'solid' && (
                <label className="field color">
                  color 2
                  <input type="color" value={cfg.bg_color2} onChange={(e) => set('bg_color2', e.target.value)} />
                </label>
              )}
            </div>
          </section>

        </aside>

        {/* --------------------------------------------- centre: preview */}
        <main className="panel preview-panel">
          {error && <div className="error">⚠ {error}</div>}
          {fewPics && (
            <div className="notice">
              🌼 only {selectedList.length} photo{selectedList.length > 1 ? 's' : ''} selected — duplicate them to fill the collage?
              <label className="check inline">
                <input type="checkbox" checked={cfg.duplicate} onChange={(e) => set('duplicate', e.target.checked)} />
                yes, duplicate
              </label>
            </div>
          )}
          <div className="preview-area">
            {previewUrl
              ? <img src={previewUrl} alt="collage preview" />
              : <div className="placeholder">your wallpaper will bloom here ✿<br /><small>add a folder, pick photos, press generate</small></div>}
          </div>
          <div className="actions">
            <button className="btn primary" onClick={generate} disabled={generating}>
              {generating ? '✿ weaving collage…' : '✿ generate'}
            </button>
            {previewUrl && (
              <a className="btn" href={previewUrl} download="wallpaper.png">⬇ download</a>
            )}
          </div>
        </main>

        {/* ----------------------------------------------- right: tuning */}
        <aside className="panel controls">
          <section>
            <h2>🖼 collage</h2>
            <Slider label={`photo opacity · ${Math.round(cfg.collage_opacity * 100)}%`}
              min={0} max={1} step={0.05} value={cfg.collage_opacity}
              onChange={(v) => set('collage_opacity', v)} />
            <Slider label={`density · ${cfg.density.toFixed(1)}×`}
              min={0.2} max={2.5} step={0.1} value={cfg.density}
              onChange={(v) => set('density', v)} />
            <label className="check">
              <input type="checkbox" checked={cfg.polaroid} onChange={(e) => set('polaroid', e.target.checked)} />
              polaroid frames
            </label>
            <label className="field">
              shuffle seed
              <div className="row">
                <input type="number" value={cfg.seed} onChange={(e) => set('seed', +e.target.value)} />
                <button className="btn small" onClick={() => set('seed', Math.floor(Math.random() * 100000))}>🎲</button>
              </div>
            </label>
          </section>

          <section>
            <h2>✏️ centre text</h2>
            <label className="field">
              title
              <input value={cfg.title} placeholder="COLLAGE" onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="field">
              subtitle
              <input value={cfg.subtitle} placeholder="OUR SUMMER" onChange={(e) => set('subtitle', e.target.value)} />
            </label>
            <div className="row">
              <label className="field color">
                text color
                <input type="color" value={cfg.text_color} onChange={(e) => set('text_color', e.target.value)} />
              </label>
            </div>
            <Slider label={`text size · ${cfg.text_size.toFixed(1)}×`}
              min={0.3} max={2.5} step={0.1} value={cfg.text_size}
              onChange={(v) => set('text_size', v)} />
            <Slider label={`letter spacing · ${cfg.text_spacing.toFixed(1)}`}
              min={0} max={6} step={0.5} value={cfg.text_spacing}
              onChange={(v) => set('text_spacing', v)} />
            <Slider label={`text box opacity · ${Math.round(cfg.text_box_opacity * 100)}%`}
              min={0} max={1} step={0.05} value={cfg.text_box_opacity}
              onChange={(v) => set('text_box_opacity', v)} />
          </section>
        </aside>
      </div>

      {/* ------------------------------------------------- photo picker */}
      <section className="panel gallery">
        <div className="gallery-head">
          <h2>🌷 photos {images.length > 0 && `· ${selected.size}/${images.length} picked`}</h2>
          {images.length > 0 && (
            <div className="row">
              <button className="btn small" onClick={() => setSelected(new Set(images.map((i) => i.path)))}>all</button>
              <button className="btn small" onClick={() => setSelected(new Set())}>none</button>
            </div>
          )}
        </div>
        {images.length === 0 && <p className="muted">no folder loaded yet — pick one with 📂 above ☁</p>}
        <div className="grid">
          {images.map((img) => (
            <button
              key={img.path}
              className={`thumb ${selected.has(img.path) ? 'picked' : ''}`}
              onClick={() => toggle(img.path)}
              title={img.path}
            >
              <img loading="lazy" src={`/api/thumb?path=${encodeURIComponent(img.path)}&size=220`} alt={img.name} />
              <span className="tick">{selected.has(img.path) ? '✔' : ''}</span>
            </button>
          ))}
        </div>
      </section>

      {showShapeModal && (
        <ShapeCanvas
          initial={cfg.shape_points}
          onCancel={() => setShowShapeModal(false)}
          onSave={(points) => {
            setCfg((c) => ({ ...c, shape: 'custom', shape_points: points }))
            setShowShapeModal(false)
          }}
        />
      )}
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange }) {
  return (
    <label className="field slider">
      {label}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}
