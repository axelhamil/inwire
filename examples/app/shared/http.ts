/** A framework-free route table: enough to show controllers wired by a module. */

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  handle(params: Record<string, string>, body?: unknown): Promise<HttpResponse>;
}

export function createRouter(routes: Route[]) {
  return {
    async handle(method: Route['method'], url: string, body?: unknown): Promise<HttpResponse> {
      for (const route of routes) {
        const params = route.method === method ? matchPath(route.path, url) : undefined;
        if (params) return route.handle(params, body);
      }
      return {
        status: 404,
        body: { code: 'ROUTE_NOT_FOUND', message: `No route for ${method} ${url}.` },
      };
    },
  };
}

function matchPath(pattern: string, url: string): Record<string, string> | undefined {
  const expected = pattern.split('/');
  const actual = url.split('/');
  if (expected.length !== actual.length) return undefined;

  const params: Record<string, string> = {};
  for (const [i, part] of expected.entries()) {
    const value = actual[i] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = value;
    else if (part !== value) return undefined;
  }
  return params;
}
