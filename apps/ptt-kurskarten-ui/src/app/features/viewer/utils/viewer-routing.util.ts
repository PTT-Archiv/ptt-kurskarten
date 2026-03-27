import type { ConnectionLeg, ConnectionOption, TimeHHMM } from '@ptt-kurskarten/shared';

export function ensureConnectionId(option: ConnectionOption, index: number): ConnectionOption {
  const id = option.id || `${option.from}-${option.to}-${index}`;
  const transfers = option.transfers ?? option.legs.length - 1;
  const legs = option.legs.map((leg) => ensureLegDuration(leg));
  const kind = option.kind ?? 'COMPLETE_JOURNEY';
  return { ...option, id, transfers, legs, kind };
}

export function ensureLegDuration(leg: ConnectionLeg): ConnectionLeg {
  if (leg.durationMinutes !== undefined && leg.durationMinutes >= 0) {
    return leg;
  }
  if (!leg.departs || !leg.arrives) {
    return leg;
  }
  const durationMinutes = computeLegDurationMinutes(leg.departs, leg.arrives, leg.arrivalDayOffset);
  return { ...leg, durationMinutes };
}

export function computeLegDurationMinutes(departs: TimeHHMM, arrives: TimeHHMM, dayOffset?: number): number {
  const [dh, dm] = departs.split(':').map((val) => Number(val));
  const [ah, am] = arrives.split(':').map((val) => Number(val));
  const dep = dh * 60 + dm;
  const arr = ah * 60 + am + (dayOffset ?? 0) * 1440;
  const normalized = arr < dep ? arr + 1440 : arr;
  return normalized - dep;
}

export function parseTimeMinutes(time: TimeHHMM): number {
  const [h, m] = time.split(':').map((val) => Number(val));
  return h * 60 + m;
}

export function formatTimeMinutes(totalMinutes: number): TimeHHMM {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(totalMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}` as TimeHHMM;
}

export function formatDuration(totalMinutes?: number): string {
  if (totalMinutes === undefined) {
    return '—';
  }
  const normalized = Math.max(0, totalMinutes);
  const days = Math.floor(normalized / 1440);
  const hours = Math.floor((normalized % 1440) / 60);
  const minutes = normalized % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (hours <= 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}
