import type { ConnectionLeg, ConnectionOption, TimeHHMM } from '@ptt-kurskarten/shared';

export type WaitSegment = {
  atNodeId: string;
  startAbsMin: number;
  endAbsMin: number;
  durationMinutes: number;
  overnight: boolean;
  startDayOffset: number;
  endDayOffset: number;
};

export type LegAbsTime = {
  absMinutes: number;
  dayOffset: number;
};

const MINUTES_PER_DAY = 1440;

export function buildWaitSegments(option: ConnectionOption): WaitSegment[] {
  const legs = option.legs ?? [];
  const segments: WaitSegment[] = [];

  for (let i = 0; i < legs.length - 1; i += 1) {
    const current = legs[i];
    const next = legs[i + 1];
    const start = getLegAbsTime(current, 'arrive');
    const end = getLegAbsTime(next, 'depart');

    let startAbs = start.absMinutes;
    let endAbs = end.absMinutes;
    let endDayOffset = end.dayOffset;

    if (endAbs <= startAbs) {
      while (endAbs <= startAbs) {
        endAbs += MINUTES_PER_DAY;
        endDayOffset += 1;
      }
    }

    if (endAbs > startAbs) {
      const startDayOffset = start.dayOffset;
      const overnight = Math.floor(startAbs / MINUTES_PER_DAY) < Math.floor(endAbs / MINUTES_PER_DAY);
      segments.push({
        atNodeId: current.to,
        startAbsMin: startAbs,
        endAbsMin: endAbs,
        durationMinutes: endAbs - startAbs,
        overnight,
        startDayOffset,
        endDayOffset
      });
    }
  }

  return segments;
}

export function getLegAbsTime(leg: ConnectionLeg, kind: 'depart' | 'arrive'): LegAbsTime {
  if (kind === 'depart' && leg.departAbsMinutes !== undefined) {
    return {
      absMinutes: leg.departAbsMinutes,
      dayOffset: Math.floor(leg.departAbsMinutes / MINUTES_PER_DAY)
    };
  }

  if (kind === 'arrive' && leg.arriveAbsMinutes !== undefined) {
    return {
      absMinutes: leg.arriveAbsMinutes,
      dayOffset: Math.floor(leg.arriveAbsMinutes / MINUTES_PER_DAY)
    };
  }

  const baseMinutes = toMinutes(kind === 'depart' ? leg.departs : leg.arrives);

  if (kind === 'depart') {
    if (leg.departDayOffset !== undefined) {
      return {
        absMinutes: leg.departDayOffset * MINUTES_PER_DAY + baseMinutes,
        dayOffset: leg.departDayOffset
      };
    }
    return { absMinutes: baseMinutes, dayOffset: 0 };
  }

  if (leg.arrivalDayOffset !== undefined) {
    return {
      absMinutes: leg.arrivalDayOffset * MINUTES_PER_DAY + baseMinutes,
      dayOffset: leg.arrivalDayOffset
    };
  }

  const departMinutes = toMinutes(leg.departs);
  let dayOffset = leg.departDayOffset ?? 0;
  if (baseMinutes < departMinutes) {
    dayOffset += 1;
  }

  return {
    absMinutes: dayOffset * MINUTES_PER_DAY + baseMinutes,
    dayOffset
  };
}

function toMinutes(time: TimeHHMM): number {
  const [h, m] = time.split(':').map((value) => Number(value));
  return h * 60 + m;
}
