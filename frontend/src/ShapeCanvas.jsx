import { useEffect, useRef, useState } from 'react'

const SIZE = 340

export default function ShapeCanvas({ initial, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [points, setPoints] = useState(initial || [])
  const drawing = useRef(false)

  const redraw = (pts) => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = '#fbf7ef'
    ctx.fillRect(0, 0, SIZE, SIZE)
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0][0] * SIZE, pts[0][1] * SIZE)
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x * SIZE, y * SIZE)
    ctx.closePath()
    ctx.fillStyle = 'rgba(196, 167, 231, 0.45)'
    ctx.fill()
    ctx.strokeStyle = '#9b7fd4'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  useEffect(() => { redraw(points) }, [points])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [
      Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    ]
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>✎ draw your shape</h2>
        <p className="muted">press and drag to draw a closed outline — photos will fill it</p>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onPointerDown={(e) => {
            drawing.current = true
            e.target.setPointerCapture(e.pointerId)
            setPoints([pos(e)])
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            setPoints((p) => [...p, pos(e)])
          }}
          onPointerUp={() => { drawing.current = false }}
        />
        <div className="row end">
          <button className="btn small" onClick={() => setPoints([])}>clear</button>
          <button className="btn small" onClick={onCancel}>cancel</button>
          <button className="btn primary small" disabled={points.length < 3}
            onClick={() => onSave(points)}>
            use this shape ✿
          </button>
        </div>
      </div>
    </div>
  )
}
