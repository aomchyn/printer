import { deleteAchievement, getAchievement, updateAchievement } from "../../../../../lib/server/careerAchievements";

export const dynamic = "force-dynamic";
export const GET = getAchievement;
export const PATCH = updateAchievement;
export const DELETE = deleteAchievement;
