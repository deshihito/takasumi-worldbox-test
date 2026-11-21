export const ONE_PROMPTER_HOST = "oneprompter.takasumibot.app";

export const ONE_PROMPTER_PATH = "/one-prompter";

export const SUBDOMAIN_ROUTES: Readonly<Record<string, string>> = {
  [ONE_PROMPTER_HOST]: ONE_PROMPTER_PATH,
  "viewslopper.takasumibot.app": "/viewslopper",
  "deshihito.takasumibot.app": "/folio/deshihito",
  "tadanoen.takasumibot.app": "/folio/tadanoen",
};

export function effectiveHost(forwardedHost: string | null | undefined, hostname: string): string {
  return forwardedHost?.split(",")[0]?.trim() || hostname;
}

export function subdomainRedirectUrl(args: {
  pathname: string;
  forwardedHost: string | null | undefined;
  hostname: string;
  search: string;
}): string | null {
  if (args.pathname !== "/") return null;
  const host = effectiveHost(args.forwardedHost, args.hostname);
  const path = SUBDOMAIN_ROUTES[host];
  if (!path) return null;
  return `https://${host}${path}${args.search}`;
}
