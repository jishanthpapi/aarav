const NAMES: Record<string, string[]> = {
  wingAngle: ['wing'], diffuser: ['diffuser'], frontSplitter: ['front-splitter'], rideHeight: ['chassis'],
  angleOfAttack: ['vehicle-root'], rudder: ['rudder'], elevator: ['elevator'],
  flaps: ['flap--1', 'flap-1'], ailerons: ['aileron--1', 'aileron-1'],
};
export const meshNamesFor = (id: string) => NAMES[id] ?? [];
