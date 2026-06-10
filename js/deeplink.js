// Shareable mission deep links: ?mission=<stable-launch-id>.
// Pure URL helpers (no DOM) so they can be unit-tested in Node. The GitHub
// Pages project subpath is preserved because every URL is derived from the
// current page URL's origin + pathname.

// Build a shareable absolute URL for a mission from the current page URL.
// Preserves the path (project subpath) and replaces only the `mission` param.
export function buildMissionUrl(currentHref, id) {
  const url = new URL(currentHref);
  url.hash = "";
  url.searchParams.set("mission", String(id));
  return url.toString();
}

// Read the mission id from a query string (accepts "?a=b" or "a=b"), or null.
export function parseMissionId(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const id = params.get("mission");
  return id ? id : null;
}

// Return a same-document relative URL (path + remaining query + hash) with the
// `mission` param removed — suitable for history.replaceState without reload.
// Preserves the project subpath.
export function stripMissionParam(currentHref) {
  const url = new URL(currentHref);
  url.searchParams.delete("mission");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash || ""}`;
}
