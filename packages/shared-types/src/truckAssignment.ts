/**
 * The answer of POST /drivers/truck-assignment/preview (backend
 * services/truckAssignment.ts) and how to say it — one wording for the web
 * dashboard and the operator app:
 *
 *   Abdullah will drive USA-6010.
 *   KSA-6102 will have no driver — Abdullah moves off it.
 *   Imtiaz Ahmed will have no truck — he is taken off USA-6010.
 *   Imtiaz Ahmed is on TRP-0005 right now — that trip keeps USA-6010.
 */
export interface AssignmentDriverRef { id: string; name: string; phone: string | null }
export interface AssignmentVehicleRef { id: string; plate: string }

export type AssignmentEffect =
  | { type: 'assign'; driver: AssignmentDriverRef; vehicle: AssignmentVehicleRef }
  | { type: 'vehicle_emptied'; vehicle: AssignmentVehicleRef; previous_driver: AssignmentDriverRef }
  | { type: 'driver_freed'; driver: AssignmentDriverRef; previous_vehicle: AssignmentVehicleRef };

export interface AssignmentWarning {
  type: 'on_trip';
  driver: AssignmentDriverRef;
  trip_ref: string | null;
  plate: string | null;
}

export interface AssignmentPreview {
  no_change: boolean;
  vehicle: (AssignmentVehicleRef & { current_driver: AssignmentDriverRef | null }) | null;
  driver: (AssignmentDriverRef & { current_vehicle: AssignmentVehicleRef | null }) | null;
  effects: AssignmentEffect[];
  warnings: AssignmentWarning[];
}

export type AssignmentLineTone = 'main' | 'knock-on' | 'warning';
export interface AssignmentLine { tone: AssignmentLineTone; text: string }

/** The preview as sentences, main change first, then knock-on effects, then warnings. */
export function describeAssignment(p: AssignmentPreview): AssignmentLine[] {
  if (p.no_change) return [{ tone: 'main', text: 'Nothing changes.' }];
  const lines: AssignmentLine[] = [];
  for (const e of p.effects) {
    if (e.type === 'assign') lines.push({ tone: 'main', text: `${e.driver.name} will drive ${e.vehicle.plate}.` });
  }
  for (const e of p.effects) {
    if (e.type === 'vehicle_emptied') {
      lines.push({ tone: 'knock-on', text: `${e.vehicle.plate} will have no driver — ${e.previous_driver.name} moves off it.` });
    }
    if (e.type === 'driver_freed') {
      lines.push({ tone: 'knock-on', text: `${e.driver.name} will have no truck — taken off ${e.previous_vehicle.plate}.` });
    }
  }
  for (const w of p.warnings) {
    lines.push({
      tone: 'warning',
      text: `${w.driver.name} is on ${w.trip_ref ?? 'a trip'} right now — that trip keeps ${w.plate ?? 'its truck'}; this applies to new trips.`,
    });
  }
  return lines;
}
