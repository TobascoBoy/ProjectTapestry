// Netlify Edge Function — handles /join/* on jointhetapestry.com.
//
// Why this exists (and why it's not a plain _redirects proxy):
// Netlify's external-URL proxy rewrites (status 200 in _redirects) force
// text/plain + Content-Security-Policy: sandbox on the response, as a
// hardening measure for content from outside Netlify's runtime. iMessage
// needs text/html to parse Open Graph tags — with text/plain it renders
// no rich preview. Running this as an Edge Function keeps the logic inside
// Netlify's trusted runtime, so we control content-type and skip the
// sandbox entirely.
//
// The function itself is a thin proxy to the Supabase edge function that
// does the real DB lookup + OG-tag composition. Keeps all invite logic
// in one place (Supabase) rather than duplicating it here.

const SUPABASE_JOIN_URL =
  "https://jrdikjncaxdzxmxcddjv.supabase.co/functions/v1/join";

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  // Path is /join/ABC123 — strip the leading /join/ and pass the rest through.
  const code = url.pathname.replace(/^\/join\//, "");
  const upstream = `${SUPABASE_JOIN_URL}/${encodeURIComponent(code)}`;

  try {
    const res = await fetch(upstream, {
      // Forward nothing sensitive; iMessage's fetcher doesn't send auth
      // and the Supabase function is deployed --no-verify-jwt anyway.
      headers: { accept: "text/html" },
    });
    const html = await res.text();

    return new Response(html, {
      status: res.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // 5 min edge cache matches what the Supabase function already
        // sets — keeps repeat previews cheap without holding stale OG
        // tags long enough to hurt if the user re-uploads a cover.
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (_err) {
    // Upstream unreachable — let _redirects fall through to the static
    // /join/index.html backup. Returning a response here would override
    // the redirect; returning nothing is how Netlify Edge Functions
    // signal "skip me, continue processing."
    return new Response(null, { status: 404 });
  }
};

export const config = { path: "/join/*" };
