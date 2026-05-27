/* Safe duplicate-check against the games table.
 * Replaces the broken `.or()` string-interpolation pattern from the
 * legacy browser script. We split the query into two `.in()` calls
 * (which Supabase parameterizes properly) and merge the results. */

export async function findDuplicates(supabase, games) {
  if (!games.length) return [];

  const ids = [];
  const idToGame = new Map();
  for (const g of games) {
    if (g.provider_game_id) {
      const key = `${g.provider}::${g.provider_game_id}`;
      ids.push(key);
      idToGame.set(key, g);
    }
  }

  const providers = [...new Set(games.map((g) => g.provider))];
  const providerIds = games.map((g) => g.provider_game_id).filter(Boolean);

  /* One query per provider — keeps the IN clause parameterized
   * and avoids cross-provider id collisions. */
  const dupsByProvider = await Promise.all(
    providers.map(async (provider) => {
      const idsForProvider = games
        .filter((g) => g.provider === provider)
        .map((g) => g.provider_game_id)
        .filter(Boolean);
      if (!idsForProvider.length) return [];
      const { data, error } = await supabase
        .from("games")
        .select("id, title, provider, provider_game_id, slug")
        .eq("provider", provider)
        .in("provider_game_id", idsForProvider);
      if (error) throw new Error(`Duplicate-check query failed: ${error.message}`);
      return (data || []).map((row) => ({ provider, row }));
    }),
  );

  const found = dupsByProvider.flat();
  return found.map(({ provider, row }) => {
    const key = `${provider}::${row.provider_game_id}`;
    return {
      localGame: idToGame.get(key) || null,
      existingGame: row,
    };
  });
}
