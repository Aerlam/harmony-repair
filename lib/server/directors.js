import { get, put } from "@vercel/blob";

const PATH = "harmony/settings/directors.json";

export async function listDirectors() {
  const stored = await get(PATH, { access: "private" });
  if (!stored) return [];
  return JSON.parse(await new Response(stored.stream).text());
}

export async function isDirector(userId) {
  if ((process.env.HARMONY_DIRECTOR_IDS || "").split(",").map((id) => id.trim()).includes(userId)) return true;
  return (await listDirectors()).some((person) => person.discordId === userId);
}

export async function saveDirectors(directors) {
  await put(PATH, JSON.stringify(directors), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json",
  });
  return directors;
}
