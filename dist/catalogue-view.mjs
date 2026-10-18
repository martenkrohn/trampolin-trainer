import { calculateElement } from './core.mjs';

export const catalogueGroups = [
  'Grundsprünge',
  'Sitz-, Bauch- und Rückenlandungen',
  'Fußsprungschrauben ohne Salto',
  'Saltos',
  'Saltos mit besonderem Absprung oder besonderer Landung',
  'Doppel- und Dreifachsaltos'
];

export function catalogueGroup(jump) {
  if (jump.custom) return -1;
  const quarters = jump.somersault_quarters || 0;
  if (quarters >= 8) return 5;
  if (quarters >= 3 && (jump.takeoff_position !== 'feet' || jump.landing_position !== 'feet')) return 4;
  if (quarters >= 4) return 3;
  if (jump.takeoff_position !== 'feet' || jump.landing_position !== 'feet') return 1;
  if ((jump.twist_half_turns_by_phase || []).some(value => value > 0)) return 2;
  return 0;
}

export function compareCatalogueJumps(a, b) {
  const value = jump => calculateElement(jump).value ?? Infinity;
  return value(a) - value(b)
    || (a.somersault_quarters || 0) - (b.somersault_quarters || 0)
    || (a.rotation_direction || '').localeCompare(b.rotation_direction || '')
    || JSON.stringify(a.twist_half_turns_by_phase || []).localeCompare(JSON.stringify(b.twist_half_turns_by_phase || []))
    || a.name_de.localeCompare(b.name_de, 'de');
}
