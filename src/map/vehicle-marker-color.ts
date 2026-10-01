const ACCENT = '#0F6E56';
const INK = '#12202B';
const ALERT = '#9B2335';

/** Marker fill for a vehicle type: suv/muv accent, sedan ink, hatchback alert. */
export function vehicleMarkerColor(type: string): string {
  if (type === 'suv' || type === 'muv') {
    return ACCENT;
  }
  if (type === 'hatchback') {
    return ALERT;
  }
  return INK;
}
