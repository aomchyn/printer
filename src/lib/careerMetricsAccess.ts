export function isCareerMetricsModerator(
  role: string | null | undefined,
): boolean {
  return role === "moderator";
}

export const shouldShowCareerMetricsNavigation = isCareerMetricsModerator;
