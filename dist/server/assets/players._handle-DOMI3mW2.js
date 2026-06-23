import { jsxs, jsx } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { A as AppShell, P as PageHeader } from "./app-shell-WR70AMg9.js";
import "clsx";
import "tailwind-merge";
import "lucide-react";
import "@tanstack/react-query";
import "react";
import "./router-CWBWKmOn.js";
import "./server-BfI8uGY9.js";
import "node:async_hooks";
import "h3-v2";
import "@tanstack/router-core";
import "seroval";
import "@tanstack/history";
import "@tanstack/router-core/ssr/client";
import "@tanstack/router-core/ssr/server";
import "@tanstack/react-router/ssr/server";
const SplitNotFoundComponent = () => /* @__PURE__ */ jsxs(AppShell, { children: [
  /* @__PURE__ */ jsx(PageHeader, { title: "Player not found" }),
  /* @__PURE__ */ jsx(Link, { to: "/community", className: "text-runway hover:underline", children: "← Back to community" })
] });
export {
  SplitNotFoundComponent as notFoundComponent
};
