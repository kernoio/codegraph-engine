import type { Route } from "./+types/healthz";

export async function loader(_args: Route.LoaderArgs) {
  return new Response(JSON.stringify({ status: "OK" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
