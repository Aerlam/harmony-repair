export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  const configured = Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_DISCORD_ID &&
      process.env.AUTH_DISCORD_SECRET,
  );

  response.status(200).json({ configured });
}

