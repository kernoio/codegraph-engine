import { data, redirect } from "react-router";

import type { Route } from "./+types/color-scheme";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const colorScheme = formData.get("colorScheme");
  if (!colorScheme) {
    throw data("Bad Request", { status: 400 });
  }
  return redirect("/");
}
