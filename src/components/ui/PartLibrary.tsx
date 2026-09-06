import { VEHICLES, vehicleFor } from '../../data/vehicles/catalog';
import { useSimulationStore } from '../../store/useSimulationStore';
import { GRID_QUALITIES, type GridQuality } from '../../engine/GridQuality';

export default function PartLibrary() {
  const values = useSimulationStore(s => s.slotValues);
  const wind = useSimulationStore(s => s.windSpeedKph);
  const setSlot = useSimulationStore(s => s.setSlotValue);
  const setWind = useSimulationStore(s => s.setWindSpeed);
  const reset = useSimulationStore(s => s.resetConfiguration);
  const gridQuality = useSimulationStore(s => s.gridQuality);
  const setGridQuality = useSimulationStore(s => s.setGridQuality);
  const vehicleId = useSimulationStore(s => s.vehicleId);
  const setVehicle = useSimulationStore(s => s.setVehicle);
  const vehicle = vehicleFor(vehicleId);
  const renderMode = useSimulationStore(s => s.renderMode);
  const setRenderMode = useSimulationStore(s => s.setRenderMode);
  const flowStyle = useSimulationStore(s => s.flowStyle);
  const setFlowStyle = useSimulationStore(s => s.setFlowStyle);
  const solverPreference = useSimulationStore(s => s.solverPreference);
  const setSolverPreference = useSimulationStore(s => s.setSolverPreference);

  return <div className="space-y-6 p-5 text-sm text-slate-200">
    <div>
      <p className="text-xs uppercase tracking-widest text-blue-300">Aarav / Wind tunnel</p>
      <h1 className="mt-2 text-lg font-semibold">{vehicle.name}</h1>
      <p className="mt-1 text-xs text-slate-400">Wind travels along +X, from nose to tail.</p>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-5">
      <label htmlFor="vehicle">Vehicle</label>
      <select id="vehicle" value={vehicleId} onChange={e => setVehicle(e.target.value)} className="w-full rounded-md border border-white/20 bg-[#151515] p-2">
        {VEHICLES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {vehicleId.startsWith('kit-') && <p className="text-xs text-slate-400">Kenney Car Kit · CC0 · shared render and solver geometry</p>}
      {vehicle.baseModelPath && <>
        <label htmlFor="render-mode" className="block pt-2">Vehicle rendering</label>
        <select id="render-mode" value={renderMode} onChange={e => setRenderMode(e.target.value as typeof renderMode)} className="w-full rounded-md border border-white/20 bg-[#151515] p-2">
          <option value="procedural">Solver geometry</option><option value="asset">Source 3D asset</option>
        </select>
        <p className="text-xs text-slate-400">The asset view is visual only; the solver continues using the validated voxel geometry.</p>
      </>}
      <label htmlFor="flow-style" className="block pt-2">Airflow view</label>
      <select id="flow-style" value={flowStyle} onChange={e => setFlowStyle(e.target.value as typeof flowStyle)} className="w-full rounded-md border border-white/20 bg-[#151515] p-2">
        <option value="trails">Moving flow lines</option><option value="particles">Particles</option><option value="off">Off</option>
      </select>
      <p className="text-xs text-slate-400">Flow-line paths follow the current velocity field. Moving dashes illustrate direction, not physical travel time.</p>
      <label htmlFor="solver-method" className="block pt-2">Solver</label>
      <select id="solver-method" value={solverPreference} onChange={e => setSolverPreference(e.target.value as typeof solverPreference)} className="w-full rounded-md border border-white/20 bg-[#151515] p-2">
        <option value="auto">Automatic</option><option value="webgpu">WebGPU LBM</option><option value="webgl">WebGL2 fallback</option>
      </select>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-5">
      <label htmlFor="grid-quality">Grid detail</label>
      <select id="grid-quality" value={gridQuality}
        onChange={e => setGridQuality(e.target.value as GridQuality)}
        className="w-full rounded-md border border-white/20 bg-[#151515] p-2 text-slate-200">
        {Object.entries(GRID_QUALITIES).map(([value, quality]) =>
          <option key={value} value={value}>{quality.label}</option>)}
      </select>
      <p className="text-xs text-slate-400">Maximum detail uses more memory and can take over an hour to develop on integrated graphics. Choose Responsive for faster changes.</p>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-5">
      <label htmlFor="wind-speed" className="flex justify-between gap-2">
        <span>Wind speed</span><output htmlFor="wind-speed" className="font-mono text-blue-200">{wind} km/h</output>
      </label>
      <input id="wind-speed" type="range" min={10} max={250} step={1} value={wind}
        onChange={e => setWind(Number(e.target.value))} className="w-full accent-blue-400" />
      <p className="text-xs text-slate-400">Requested speed. The accuracy panel reports the Reynolds number the grid can achieve.</p>
    </div>
    {vehicle.slots.map(slot => <div key={slot.slotId} className="space-y-2 border-t border-white/10 pt-5">
      {slot.kind === 'toggle' ? <label className="flex cursor-pointer items-center justify-between gap-3" htmlFor={slot.slotId}>
        <span>{slot.label}</span>
        <input id={slot.slotId} type="checkbox" checked={Boolean(values[slot.slotId])}
          onChange={e => setSlot(slot.slotId, e.target.checked)} className="h-5 w-5 accent-blue-400" />
      </label> : <>
        <label className="flex justify-between gap-2" htmlFor={slot.slotId}>
          <span>{slot.label}</span>
          <output htmlFor={slot.slotId} className="font-mono text-blue-200">
            {slot.unit === 'm' ? Number(values[slot.slotId]).toFixed(3) : values[slot.slotId]}{slot.unit === 'm' ? ' m' : slot.unit}
          </output>
        </label>
        <input id={slot.slotId} type="range" {...{ min: slot.range!.min, max: slot.range!.max, step: slot.range!.step }}
          value={Number(values[slot.slotId])} onChange={e => setSlot(slot.slotId, Number(e.target.value))}
          className="w-full accent-blue-400" />
      </>}
    </div>)}
    <button onClick={reset} className="w-full rounded-md border border-white/20 px-3 py-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-blue-300">
      Reset configuration
    </button>
    <p className="text-xs leading-relaxed text-amber-200/80">
      Coarse educational simulation. Small angle changes and narrow ground gaps may be below this grid&apos;s resolution.
    </p>
  </div>;
}
