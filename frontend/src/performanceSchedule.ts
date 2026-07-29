export type PerformanceScheduleState = "upcoming" | "active" | "expired";

export function getPerformanceScheduleState(
  validFrom: string,
  validUntil: string,
  now = new Date(),
): PerformanceScheduleState {
  const currentTime = now.getTime();
  if (currentTime < new Date(validFrom).getTime()) {
    return "upcoming";
  }
  if (currentTime > new Date(validUntil).getTime()) {
    return "expired";
  }
  return "active";
}
