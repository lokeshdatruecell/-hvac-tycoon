import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Check,
  CircleDollarSign,
  Construction,
  Fan,
  Gauge,
  GitBranch,
  Hammer,
  House,
  Play,
  RotateCcw,
  Target,
  Trash2,
  Wind,
  Wrench,
} from 'lucide-react'
import './App.css'

type Tool = 'duct' | 'unit' | 'damper' | 'inspect' | 'erase'
type Cell = { kind: 'duct' | 'unit' | 'damper'; open?: boolean }
type Point = { x: number; y: number }

const columns = 12
const rows = 8
const cellKey = ({ x, y }: Point) => `${x},${y}`
const diffusers: Point[] = [{ x: 10, y: 1 }, { x: 10, y: 5 }]
const initialCells: Record<string, Cell> = {
  '1,3': { kind: 'unit' },
  '2,3': { kind: 'duct' },
  '3,3': { kind: 'duct' },
  '4,3': { kind: 'duct' },
}
const contracts = [
  { name: 'Riverside Offices', reward: 6800, level: '01', target: 240, brief: 'Supply both rooms with 240 CFM minimum.' },
  { name: 'Northline Clinic', reward: 9200, level: '02', target: 260, brief: 'Balance two treatment rooms at 260 CFM.' },
  { name: 'Alder House', reward: 12400, level: '03', target: 280, brief: 'Deliver even airflow to both occupied rooms.' },
]

const tools: { id: Tool; label: string; price?: number; icon: typeof Wind }[] = [
  { id: 'duct', label: 'Duct run', price: 420, icon: GitBranch },
  { id: 'unit', label: 'Air handler', price: 3400, icon: Fan },
  { id: 'damper', label: 'Damper', price: 280, icon: Construction },
  { id: 'inspect', label: 'Pressure probe', icon: Gauge },
  { id: 'erase', label: 'Remove', icon: Trash2 },
]

function getPathPressure(cells: Record<string, Cell>, target: Point) {
  const targetKey = cellKey(target)
  const isDiffuser = diffusers.some((point) => cellKey(point) === targetKey)
  const frontier: { key: string; loss: number; unit: string }[] = []
  const best = new Map<string, number>()
  for (const [key, cell] of Object.entries(cells)) {
    if (cell.kind === 'unit') {
      frontier.push({ key, loss: 0, unit: key })
      best.set(key, 0)
    }
  }

  while (frontier.length) {
    frontier.sort((a, b) => a.loss - b.loss)
    const current = frontier.shift()!
    if (current.loss !== best.get(current.key)) continue
    if (current.key === targetKey) {
      return { pressure: Math.max(0, 180 - current.loss), unit: current.unit }
    }
    const [x, y] = current.key.split(',').map(Number)
    const neighbors = [
      { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 },
    ]
    if (isDiffuser && neighbors.some((point) => point.x === target.x && point.y === target.y)) {
      return { pressure: Math.max(0, 180 - current.loss - 3), unit: current.unit }
    }
    for (const point of neighbors) {
      const key = cellKey(point)
      const cell = cells[key]
      if (!cell || (cell.kind === 'damper' && !cell.open)) continue
      const nextLoss = current.loss + (cell.kind === 'damper' ? 11 : cell.kind === 'unit' ? 0 : 3.2)
      if (nextLoss < (best.get(key) ?? Infinity)) {
        best.set(key, nextLoss)
        frontier.push({ key, loss: nextLoss, unit: current.unit })
      }
    }
  }
  return null
}

function App() {
  const [cells, setCells] = useState<Record<string, Cell>>(initialCells)
  const [tool, setTool] = useState<Tool>('duct')
  const [money, setMoney] = useState(12500)
  const [contract, setContract] = useState(0)
  const [selectedCell, setSelectedCell] = useState<Point | null>(null)
  const [notice, setNotice] = useState('No occupied zones are receiving supply air.')

  const simulation = useMemo(() => {
    const unitCount = Object.values(cells).filter((cell) => cell.kind === 'unit').length
    const paths = diffusers.map((point) => getPathPressure(cells, point))
    const connected = paths.filter((path) => path !== null).length
    const servedZones = new Map<string, number>()
    for (const path of paths) {
      if (path) servedZones.set(path.unit, (servedZones.get(path.unit) ?? 0) + 1)
    }
    const airflow = paths.map((path) =>
      path
        ? Math.round(Math.min(320, (720 / servedZones.get(path.unit)!) * Math.sqrt(path.pressure / 180)))
        : 0,
    )
    const systemPressure = paths.reduce((lowest, path) => path ? Math.min(lowest, path.pressure) : lowest, 180)
    return { unitCount, paths, airflow, connected, systemPressure: connected ? systemPressure : 0, total: airflow.reduce((sum, value) => sum + value, 0) }
  }, [cells])

  const currentContract = contracts[contract % contracts.length]
  const objectives = [
    { label: 'Open-plan office', point: diffusers[0], airflow: simulation.airflow[0], target: currentContract.target },
    { label: 'Conference suite', point: diffusers[1], airflow: simulation.airflow[1], target: currentContract.target },
  ]
  const completed = objectives.every((item) => item.airflow >= item.target)

  function handleCell(point: Point) {
    setSelectedCell(point)
    const key = cellKey(point)
    const existing = cells[key]
    if (tool === 'inspect') return
    if (tool === 'erase') {
      if (existing?.kind === 'unit' && simulation.unitCount === 1) {
        setNotice('Keep at least one air handler in the system.')
        return
      }
      if (existing) {
        setCells((previous) => {
          const next = { ...previous }
          delete next[key]
          return next
        })
        setNotice('Component removed. Your material cost is not refunded.')
      }
      return
    }
    if (existing?.kind === 'damper' && tool === 'damper') {
      setCells((previous) => ({ ...previous, [key]: { kind: 'damper', open: !existing.open } }))
      setNotice(existing.open ? 'Damper closed. Airflow is isolated.' : 'Damper opened. Airflow can pass through.')
      return
    }
    if (existing || diffusers.some((vent) => cellKey(vent) === key)) {
      setNotice('That tile is already occupied.')
      return
    }
    const chosen = tools.find((item) => item.id === tool)
    if (!chosen?.price) return
    if (money < chosen.price) {
      setNotice('Insufficient funds for that component.')
      return
    }
    const kind = tool === 'unit' ? 'unit' : tool === 'damper' ? 'damper' : 'duct'
    setCells((previous) => ({ ...previous, [key]: { kind, ...(kind === 'damper' ? { open: true } : {}) } }))
    setMoney((previous) => previous - chosen.price!)
    setNotice(`${chosen.label} installed for $${chosen.price.toLocaleString()}.`)
  }

  function completeContract() {
    if (!completed) return
    setMoney((previous) => previous + currentContract.reward)
    setContract((previous) => previous + 1)
    setNotice(`Contract signed off. $${currentContract.reward.toLocaleString()} added to your account.`)
    setCells(initialCells)
    setSelectedCell(null)
  }

  function resetJob() {
    if (money < 850) {
      setNotice('Insufficient funds for site disposal and rework.')
      return
    }
    setCells(initialCells)
    setMoney((previous) => previous - 850)
    setSelectedCell(null)
    setNotice('Job site cleared for $850 in disposal and rework costs.')
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Airworks home">
          <span className="brand-mark"><Wind size={19} /></span>
          <span>AIRWORKS<span className="brand-sub">ENGINEERING CO.</span></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> FIELD OPERATIONS <span className="topbar-divider">/</span> SEASON 01</div>
        <div className="account"><span className="account-label">AVAILABLE CAPITAL</span><span className="account-value"><CircleDollarSign size={18} /> ${money.toLocaleString()}</span></div>
      </header>

      <div className="workspace" id="top">
        <section className="main-column">
          <div className="page-heading">
            <div><div className="eyebrow"><House size={13} /> COMMERCIAL FIT-OUT <span>/</span> CONTRACT {currentContract.level}</div><h1>{currentContract.name}</h1><p className="subtitle">Ventilation design &amp; commissioning</p></div>
            <div className="job-status"><span className="status-dot" /> IN PROGRESS</div>
          </div>

          <div className="board-heading"><div><h2>Floor plan</h2><span>LEVEL 02 <i /> 12 × 8 GRID</span></div><div className="board-heading-right"><span><span className="legend-swatch air" /> SUPPLY AIR</span><span><span className="legend-swatch room" /> OCCUPIED ZONE</span></div></div>

          <div className="floor-frame">
            <div className="floor-plan" role="grid" aria-label="Ventilation floor plan">
              {Array.from({ length: rows }, (_, y) => Array.from({ length: columns }, (_, x) => {
                const point = { x, y }
                const key = cellKey(point)
                const cell = cells[key]
                const ventIndex = diffusers.findIndex((vent) => cellKey(vent) === key)
                const room = (x >= 7 && x <= 10 && y <= 3) || (x >= 7 && x <= 10 && y >= 4)
                const selected = selectedCell && cellKey(selectedCell) === key
                const northCell = cells[cellKey({ x, y: y - 1 })]
                const southCell = cells[cellKey({ x, y: y + 1 })]
                const verticalRun = [northCell, southCell].some((neighbor) => neighbor && (neighbor.kind !== 'damper' || neighbor.open))
                const classes = ['tile', room ? 'room-tile' : '', cell?.kind ?? '', verticalRun ? 'vertical-run' : '', selected ? 'selected' : '', ventIndex >= 0 ? 'diffuser' : '', cell?.kind === 'damper' && !cell.open ? 'closed' : ''].filter(Boolean).join(' ')
                return <button key={key} className={classes} role="gridcell" aria-label={`${x + 1}, ${y + 1}${cell ? ` ${cell.kind}` : ventIndex >= 0 ? ' room diffuser' : ''}`} onClick={() => handleCell(point)}>
                  {(cell?.kind === 'duct' || cell?.kind === 'unit') && <span className="duct-line" />}
                  {cell?.kind === 'unit' && <span className="unit-symbol"><Fan size={19} /><small>AHU</small></span>}
                  {cell?.kind === 'damper' && <span className="damper-symbol"><span />{!cell.open && <i />}</span>}
                  {ventIndex >= 0 && <span className={`vent-symbol ${simulation.airflow[ventIndex] > 0 ? 'active' : ''}`}><Wind size={17} /><small>{simulation.airflow[ventIndex]} CFM</small></span>}
                  {room && x === 7 && (y === 1 || y === 5) && <span className="room-label">{y === 1 ? 'OPEN OFFICE' : 'CONFERENCE'}</span>}
                </button>
              }))}
            </div>
            <div className="plan-scale"><span>↑ N</span><span>1 TILE = 2.4 M</span></div>
          </div>

          <div className="toolbar">
            <div className="tool-list" role="toolbar" aria-label="Build tools">
              {tools.map(({ id, label, price, icon: Icon }) => <button key={id} className={`tool-button ${tool === id ? 'active' : ''}`} onClick={() => setTool(id)} title={`${label}${price ? ` · $${price}` : ''}`} aria-pressed={tool === id}><Icon size={17} /><span>{label}</span>{price && <small>${price.toLocaleString()}</small>}</button>)}
            </div>
            <button className="reset-button" onClick={resetJob} title="Clear installed components"><RotateCcw size={16} /><span>Reset job</span></button>
          </div>
          <div className="notice-line"><Wrench size={14} /><span>{notice}</span><span className="notice-tool">{tool === 'inspect' ? 'CLICK A TILE TO INSPECT' : `${tools.find((item) => item.id === tool)?.label.toUpperCase()} SELECTED`}</span></div>

          <div className="metrics-row">
            <div className="metric"><div className="metric-icon green"><Activity size={17} /></div><div><span>TOTAL AIRFLOW</span><strong>{simulation.total.toLocaleString()} <small>CFM</small></strong></div><div className="metric-trend">LIVE</div></div>
            <div className="metric"><div className="metric-icon blue"><Gauge size={17} /></div><div><span>STATIC PRESSURE</span><strong>{simulation.systemPressure} <small>Pa</small></strong></div><div className="metric-trend muted">DESIGN 180 Pa</div></div>
            <div className="metric"><div className="metric-icon amber"><Fan size={17} /></div><div><span>AIR HANDLERS</span><strong>{simulation.unitCount} <small>UNITS</small></strong></div><div className="metric-trend muted">720 CFM EA.</div></div>
          </div>
        </section>

        <aside className="side-column">
          <section className="contract-panel">
            <div className="panel-heading"><div><span className="section-kicker">ACTIVE CONTRACT</span><h2>{currentContract.name}</h2></div><span className="contract-number">{currentContract.level}</span></div>
            <div className="reward-line"><span>COMMISSION</span><strong>+${currentContract.reward.toLocaleString()}</strong></div>
            <p className="contract-brief">{currentContract.brief}</p>
            <div className="progress-header"><span>COMMISSIONING</span><strong>{objectives.filter((item) => item.airflow >= item.target).length} / 2 ZONES</strong></div>
            <div className="progress-track"><span style={{ width: `${objectives.filter((item) => item.airflow >= item.target).length * 50}%` }} /></div>
            <div className="objectives">{objectives.map((item) => <div className="objective" key={item.label}><span className={`objective-check ${item.airflow >= item.target ? 'done' : ''}`}>{item.airflow >= item.target ? <Check size={12} /> : <Target size={12} />}</span><div><strong>{item.label}</strong><span>{item.airflow} / {item.target} CFM</span></div><span className={`objective-state ${item.airflow >= item.target ? 'pass' : ''}`}>{item.airflow >= item.target ? 'PASS' : 'NEEDS AIR'}</span></div>)}</div>
            <button className="complete-button" disabled={!completed} onClick={completeContract}>{completed ? <><Check size={16} /> Sign off &amp; collect</> : <>Awaiting airflow targets <ArrowRight size={16} /></>}</button>
          </section>

          <section className="system-panel"><div className="panel-title"><span className="section-kicker">SYSTEM INSPECTOR</span><span className="system-live"><span className="live-dot" /> LIVE</span></div><div className="inspector-reading"><span>Terminal static pressure</span><strong>{simulation.systemPressure} <small>Pa</small></strong><div className="pressure-meter"><span style={{ width: `${Math.min(100, simulation.systemPressure / 250 * 100)}%` }} /></div><div className="meter-labels"><span>0 Pa</span><span>Design 180 Pa</span><span>250 Pa</span></div></div><div className="inspector-footer"><span>Connected zones</span><strong>{simulation.connected} / 2</strong></div><div className="inspector-footer"><span>Pressure probe</span><strong>{selectedCell ? `${Math.round(getPathPressure(cells, selectedCell)?.pressure ?? 0)} Pa` : 'Select a tile'}</strong></div></section>

          <section className="materials-panel"><div className="panel-title"><span className="section-kicker">MATERIALS &amp; LABOR</span><span className="materials-icon"><Hammer size={15} /></span></div><div className="material-row"><span><i className="material-dot duct-dot" /> Galvanized duct</span><strong>$420 <small>/ TILE</small></strong></div><div className="material-row"><span><i className="material-dot damper-dot" /> Balancing damper</span><strong>$280 <small>/ EA</small></strong></div><div className="material-row"><span><i className="material-dot unit-dot" /> Air handler</span><strong>$3,400 <small>/ EA</small></strong></div></section>

          <div className="field-note"><Play size={13} fill="currentColor" /><span>FAN STATUS <b>·</b> 180 Pa DESIGN STATIC</span></div>
        </aside>
      </div>
      <footer className="footer"><span>AIRWORKS ENGINEERING CO.</span><span>BUILD SMART. BREATHE BETTER.</span><span>v1.0.4 <i /> SYSTEMS NOMINAL</span></footer>
    </main>
  )
}

export default App
