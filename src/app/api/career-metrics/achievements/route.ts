import { createAchievement, listAchievements } from "../../../../lib/server/careerAchievements";

export const dynamic = "force-dynamic";
export const GET = listAchievements;
export const POST = createAchievement;
