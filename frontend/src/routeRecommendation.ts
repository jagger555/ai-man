export type RouteCompanion = "个人" | "朋友" | "亲子" | "长者同行";
export type RouteTime = "2 小时" | "4 小时" | "一日";
export type RouteInterest = "佛教文化" | "建筑艺术" | "演出体验" | "轻松休闲" | "拍照打卡";

export type RoutePreferences = {
  companion: RouteCompanion | "";
  time: RouteTime | "";
  interests: RouteInterest[];
};

export type RouteCandidate = {
  id: string;
  name: string;
  durationMinutes: number;
  audienceTags: string[];
  interestTags: string[];
};

export type RouteRecommendation = {
  routeId: string;
  score: number;
  reasons: string[];
};

const TIME_TARGETS: Record<RouteTime, number> = {
  "2 小时": 120,
  "4 小时": 240,
  "一日": 390,
};

export function recommendRoute(
  routes: RouteCandidate[],
  preferences: RoutePreferences,
): RouteRecommendation | null {
  const hasPreference = Boolean(
    preferences.companion || preferences.time || preferences.interests.length,
  );
  if (!hasPreference || routes.length === 0) return null;

  const ranked = routes.map((route) => {
    let score = 35;
    const reasons: string[] = [];

    if (preferences.companion) {
      if (route.audienceTags.includes(preferences.companion)) {
        score += 25;
        reasons.push(`适合${preferences.companion === "个人" ? "独自游览" : preferences.companion}`);
      } else {
        score += 5;
      }
    }

    if (preferences.time) {
      const difference = Math.abs(route.durationMinutes - TIME_TARGETS[preferences.time]);
      score += Math.max(0, 25 - Math.round(difference / 12));
      reasons.push(`用时最接近${preferences.time}`);
    }

    const matchedInterests = preferences.interests.filter((interest) =>
      route.interestTags.includes(interest),
    );
    if (matchedInterests.length) {
      score += Math.min(15, matchedInterests.length * 6);
      reasons.push(`覆盖${matchedInterests.slice(0, 2).join("、")}`);
    }

    return {
      routeId: route.id,
      score: Math.min(100, score),
      reasons: reasons.slice(0, 3),
    };
  });

  return ranked.sort((left, right) => right.score - left.score)[0] ?? null;
}
