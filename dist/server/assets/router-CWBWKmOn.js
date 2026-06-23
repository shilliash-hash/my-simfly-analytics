import { QueryClientProvider, queryOptions, QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter, Link, Outlet, HeadContent, Scripts, createFileRoute, lazyRouteComponent, createRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { Suspense } from "react";
import { T as TSS_SERVER_FUNCTION, g as getServerFnById, c as createServerFn } from "./server-BfI8uGY9.js";
const appCss = "/assets/styles-IUuZbvO6.css";
function NotFoundComponent() {
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-7xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-xl font-semibold text-foreground", children: "Page not found" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist or has been moved." }),
    /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight text-foreground", children: "This page didn't load" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Something went wrong on our end. You can try refreshing or head back home." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
          children: "Go home"
        }
      )
    ] })
  ] }) });
}
const Route$d = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0A0F1C" },
      { title: "MySimFly Assets Analysis" },
      {
        name: "description",
        content: "Live dashboard for SimFly.io airport owners — track levels, tiers, PAX earnings, fleet activity, and community rankings."
      },
      { name: "author", content: "SimFly Hub" },
      { property: "og:title", content: "MySimFly Assets Analysis" },
      { name: "twitter:title", content: "MySimFly Assets Analysis" },
      { name: "description", content: "Fjord Charters offers luxury private aviation for executive travel and global expeditions." },
      { property: "og:description", content: "Fjord Charters offers luxury private aviation for executive travel and global expeditions." },
      { name: "twitter:description", content: "Fjord Charters offers luxury private aviation for executive travel and global expeditions." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/811f55bc-9afb-4f6b-b4a0-c721d5c539f4/id-preview-614aae3b--390d75c9-ca6f-404d-bdab-64f67f6054ac.lovable.app-1781769775040.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/811f55bc-9afb-4f6b-b4a0-c721d5c539f4/id-preview-614aae3b--390d75c9-ca6f-404d-bdab-64f67f6054ac.lovable.app-1781769775040.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" }
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
      },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
      { rel: "stylesheet", href: appCss }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$d.useRouteContext();
  return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsx(
    Suspense,
    {
      fallback: /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground", children: "Loading pilot data…" }),
      children: /* @__PURE__ */ jsx(Outlet, {})
    }
  ) });
}
const $$splitComponentImporter$c = () => import("./stats-wwVY4IML.js");
const Route$c = createFileRoute("/stats")({
  component: lazyRouteComponent($$splitComponentImporter$c, "component"),
  head: () => ({
    meta: [{
      title: "Stats — SimFly Hub"
    }, {
      name: "description",
      content: "PAX earnings over time, PAX by asset, and live visitors on your airports."
    }]
  })
});
const $$splitComponentImporter$b = () => import("./rankings-BNHBOtEs.js");
const Route$b = createFileRoute("/rankings")({
  component: lazyRouteComponent($$splitComponentImporter$b, "component"),
  head: () => ({
    meta: [{
      title: "Rankings — SimFly Hub"
    }, {
      name: "description",
      content: "Leaderboards: top hubs by PAX, top visitors, and PAX per rotation efficiency."
    }]
  })
});
const $$splitComponentImporter$a = () => import("./licenses-Ctf6z59v.js");
const Route$a = createFileRoute("/licenses")({
  component: lazyRouteComponent($$splitComponentImporter$a, "component"),
  head: () => ({
    meta: [{
      title: "Licenses — SimFly Hub"
    }, {
      name: "description",
      content: "Your pilot licenses with rank, level and lifetime PAX earned."
    }]
  })
});
const $$splitComponentImporter$9 = () => import("./compare-DVQ2Rp6t.js");
const Route$9 = createFileRoute("/compare")({
  component: lazyRouteComponent($$splitComponentImporter$9, "component"),
  head: () => ({
    meta: [{
      title: "Compare — SimFly Hub"
    }, {
      name: "description",
      content: "Side-by-side comparison of up to 4 SimFly airports."
    }]
  })
});
const $$splitComponentImporter$8 = () => import("./community-BZHjvCBf.js");
const Route$8 = createFileRoute("/community")({
  component: lazyRouteComponent($$splitComponentImporter$8, "component"),
  head: () => ({
    meta: [{
      title: "Community — SimFly Hub"
    }, {
      name: "description",
      content: "Live and historical visitors flying through your airports."
    }]
  })
});
const $$splitComponentImporter$7 = () => import("./airports-C9GWERup.js");
const Route$7 = createFileRoute("/airports")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component"),
  head: () => ({
    meta: [{
      title: "Airports — SimFly Hub"
    }, {
      name: "description",
      content: "Every airport you own on SimFly.io — tier, level, rotations and PAX earned."
    }]
  })
});
const $$splitComponentImporter$6 = () => import("./aircraft-D-ymdwJb.js");
const Route$6 = createFileRoute("/aircraft")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component"),
  head: () => ({
    meta: [{
      title: "Aircraft — SimFly Hub"
    }, {
      name: "description",
      content: "All your SimFly aircraft with lifetime PAX, level and current location."
    }]
  })
});
var createSsrRpc = (functionId) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    return (await getServerFnById(functionId))(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const getSimflyPayload = createServerFn({
  method: "GET"
}).inputValidator((d) => d ?? {}).handler(createSsrRpc("501e232c547b1d985a67c3d575b0c773580e141936c74618be4bb706397244e8"));
const checkSimflySession = createServerFn({
  method: "GET"
}).handler(createSsrRpc("6b4522a33897c9bfc91b2458441f5a0520bb4ce7caeecbd13b64a021295f1a49"));
const getAirportGeo = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("34d40221213585ffdf0f2e9d1c6fac47826ecc18e3e64f7b8d49a1bed0cdc203"));
createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("ebd8f907134e9fe8564d40ce21c363b13077534141500eb08a53dab5bc02d18e"));
const getAirportVisitors = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("06b26a6968414996e6a1c2e2981ccbe5c7689374bff90302f907b543dca6c661"));
const getMyLiveFlights = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("8952a45b020f1c9e4c48e275854f114361d65c1419b223bdc56281b2fe20fe0e"));
const getMyHubsIncomingTraffic = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("5bac8570b728e8b81fcc3f69db78853a6a9f3af8536abc48fe443f56ff50ad68"));
createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(createSsrRpc("08a312c4f29bc62186c4d2c1a8b15bf1e5cf081fbf126836328013b3715e730d"));
const getVisitorHistory = createServerFn({
  method: "GET"
}).inputValidator((d) => d ?? {}).handler(createSsrRpc("17954681f382b9977cd971834d9fd1698df755c0302b269b740ed8a7fb12860d"));
const $$splitComponentImporter$5 = () => import("./activity-BczbNeAt.js");
const Route$5 = createFileRoute("/activity")({
  loader: ({
    context
  }) => context.queryClient.ensureQueryData(queryOptions({
    queryKey: ["simfly", "__self__"],
    queryFn: () => getSimflyPayload(),
    staleTime: 3e4
  })),
  component: lazyRouteComponent($$splitComponentImporter$5, "component"),
  head: () => ({
    meta: [{
      title: "Activity — SimFly Hub"
    }, {
      name: "description",
      content: "Chronological feed of upgrades, level-ups, purchases and routes across SimFly."
    }]
  })
});
const $$splitComponentImporter$4 = () => import("./index-CE-3LMd3.js");
const Route$4 = createFileRoute("/")({
  loader: ({
    context
  }) => context.queryClient.ensureQueryData(queryOptions({
    queryKey: ["simfly", "__self__"],
    queryFn: () => getSimflyPayload(),
    staleTime: 3e4
  })),
  component: lazyRouteComponent($$splitComponentImporter$4, "component"),
  head: () => ({
    meta: [{
      title: "Overview — SimFly Hub"
    }, {
      name: "description",
      content: "Your SimFly account at a glance: available PAX, fleet, hubs and recent earnings."
    }, {
      property: "og:title",
      content: "SimFly Hub — Overview"
    }, {
      property: "og:description",
      content: "Airport Intelligence Hub for SimFly.io players."
    }]
  })
});
const $$splitNotFoundComponentImporter$3 = () => import("./players._handle-DOMI3mW2.js");
const $$splitComponentImporter$3 = () => import("./players._handle-DXIu7R6a.js");
const Route$3 = createFileRoute("/players/$handle")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component"),
  head: ({
    params
  }) => ({
    meta: [{
      title: `@${params.handle} — SimFly Hub`
    }, {
      name: "description",
      content: `Profile for SimFly captain @${params.handle} — hubs, fleet, level and activity.`
    }]
  }),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$3, "notFoundComponent")
});
const $$splitNotFoundComponentImporter$2 = () => import("./licenses._slug-C9eQQbj_.js");
const $$splitComponentImporter$2 = () => import("./licenses._slug-QH1VUQbS.js");
const Route$2 = createFileRoute("/licenses/$slug")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component"),
  head: ({
    params
  }) => ({
    meta: [{
      title: `License ${params.slug} — SimFly Hub`
    }]
  }),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$2, "notFoundComponent")
});
const $$splitNotFoundComponentImporter$1 = () => import("./airports._id-CDs82xBG.js");
const $$splitComponentImporter$1 = () => import("./airports._id-CjQ4rWcK.js");
const Route$1 = createFileRoute("/airports/$id")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component"),
  head: ({
    params
  }) => ({
    meta: [{
      title: `Hub ${params.id} — SimFly Hub`
    }, {
      name: "description",
      content: "Airport detail: tier, level, rotations, lifetime PAX and live visitors."
    }]
  }),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$1, "notFoundComponent")
});
const $$splitNotFoundComponentImporter = () => import("./aircraft._id-B1HhqWSh.js");
const $$splitComponentImporter = () => import("./aircraft._id-DBan3pIM.js");
const Route = createFileRoute("/aircraft/$id")({
  component: lazyRouteComponent($$splitComponentImporter, "component"),
  head: ({
    params
  }) => ({
    meta: [{
      title: `Aircraft ${params.id} — SimFly Hub`
    }]
  }),
  notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent")
});
const StatsRoute = Route$c.update({
  id: "/stats",
  path: "/stats",
  getParentRoute: () => Route$d
});
const RankingsRoute = Route$b.update({
  id: "/rankings",
  path: "/rankings",
  getParentRoute: () => Route$d
});
const LicensesRoute = Route$a.update({
  id: "/licenses",
  path: "/licenses",
  getParentRoute: () => Route$d
});
const CompareRoute = Route$9.update({
  id: "/compare",
  path: "/compare",
  getParentRoute: () => Route$d
});
const CommunityRoute = Route$8.update({
  id: "/community",
  path: "/community",
  getParentRoute: () => Route$d
});
const AirportsRoute = Route$7.update({
  id: "/airports",
  path: "/airports",
  getParentRoute: () => Route$d
});
const AircraftRoute = Route$6.update({
  id: "/aircraft",
  path: "/aircraft",
  getParentRoute: () => Route$d
});
const ActivityRoute = Route$5.update({
  id: "/activity",
  path: "/activity",
  getParentRoute: () => Route$d
});
const IndexRoute = Route$4.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$d
});
const PlayersHandleRoute = Route$3.update({
  id: "/players/$handle",
  path: "/players/$handle",
  getParentRoute: () => Route$d
});
const LicensesSlugRoute = Route$2.update({
  id: "/$slug",
  path: "/$slug",
  getParentRoute: () => LicensesRoute
});
const AirportsIdRoute = Route$1.update({
  id: "/$id",
  path: "/$id",
  getParentRoute: () => AirportsRoute
});
const AircraftIdRoute = Route.update({
  id: "/$id",
  path: "/$id",
  getParentRoute: () => AircraftRoute
});
const AircraftRouteChildren = {
  AircraftIdRoute
};
const AircraftRouteWithChildren = AircraftRoute._addFileChildren(
  AircraftRouteChildren
);
const AirportsRouteChildren = {
  AirportsIdRoute
};
const AirportsRouteWithChildren = AirportsRoute._addFileChildren(
  AirportsRouteChildren
);
const LicensesRouteChildren = {
  LicensesSlugRoute
};
const LicensesRouteWithChildren = LicensesRoute._addFileChildren(
  LicensesRouteChildren
);
const rootRouteChildren = {
  IndexRoute,
  ActivityRoute,
  AircraftRoute: AircraftRouteWithChildren,
  AirportsRoute: AirportsRouteWithChildren,
  CommunityRoute,
  CompareRoute,
  LicensesRoute: LicensesRouteWithChildren,
  RankingsRoute,
  StatsRoute,
  PlayersHandleRoute
};
const routeTree = Route$d._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Route$3 as R,
  getAirportVisitors as a,
  getVisitorHistory as b,
  getMyLiveFlights as c,
  getAirportGeo as d,
  getMyHubsIncomingTraffic as e,
  Route$2 as f,
  getSimflyPayload as g,
  Route$1 as h,
  Route as i,
  checkSimflySession as j,
  router as r
};
