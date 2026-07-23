import { data } from "react-router";

import type { Route } from "./+types/info";

export async function loader(_args: Route.LoaderArgs) {
  return data({ ok: true });
}
