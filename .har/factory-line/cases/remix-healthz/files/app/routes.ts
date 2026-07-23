import { prefix, route } from "@react-router/dev/routes";

export default [
  route("/healthz", "routes/util/healthz.ts"),
  ...prefix("/api", [
    route("/info", "routes/util/info.ts"),
    route("/color-scheme", "routes/util/color-scheme.ts"),
  ]),
];
