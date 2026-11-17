const MAX_LIMIT = 100;

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Reads page/limit from a query string. Invalid values fall back to the
 * defaults and limit is capped, so a client cannot request an unbounded
 * page (e.g. ?limit=1000000) and load the whole table.
 */
export const parsePagination = (
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 10,
) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};
