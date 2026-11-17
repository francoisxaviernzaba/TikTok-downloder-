/**
 * Resolver registry and chain execution.
 * Ordered chain: Direct → TikWM → Tikly → LoveTik (configurable via RESOLVERS env).
 * Direct is most reliable; public APIs are volatile fallbacks.
 * Each resolver wrapped with timeout via AbortController.
 */

import type { Resolver } from './types.ts';
import { isUsableTikTokData } from './types.ts';
import { directResolver } from './direct.ts';
import { tiktokdlResolver } from './tiktokdl.ts';
import { tikwmResolver } from './tikwm.ts';
import { tiklyResolver } from './tikly.ts';
import { lovetikResolver } from './lovetik.ts';
import { parseGenericProviders } from './generic.ts';

// Env-driven providers (RESOLVER_GENERIC JSON array) appended to the chain.
const GENERIC_PROVIDERS = parseGenericProviders(process.env.RESOLVER_GENERIC);

const ALL_RESOLVERS: Resolver[] = [
  directResolver,
  tiktokdlResolver,
  tikwmResolver,
  tiklyResolver,
  lovetikResolver,
  ...GENERIC_PROVIDERS,
];

function getEnabledResolvers(): Resolver[] {
  const envResolvers = process.env.RESOLVERS?.trim();
  if (!envResolvers) return ALL_RESOLVERS;

  const names = envResolvers.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
  const enabled = ALL_RESOLVERS.filter((r) => names.includes(r.name.toLowerCase()));

  if (enabled.length === 0) {
    console.warn(`[resolvers] RESOLVERS="${envResolvers}" matched no known resolvers; falling back to all`);
    return ALL_RESOLVERS;
  }

  return enabled;
}

const ENABLED_RESOLVERS = getEnabledResolvers();

const PER_RESOLVER_MS = Number(process.env.RESOLVER_TIMEOUT_MS) || 8000;
// Overall budget per resolver. Direct does up to 2 page fetches internally, so allow headroom.
const DEFAULT_TIMEOUT_MS = Number(process.env.RESOLVER_MAX_MS) || PER_RESOLVER_MS * 2 + 2000;

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function resolveWithChain(inputUrl: string): Promise<{
  data: Awaited<ReturnType<Resolver['resolve']>>;
  resolverName: string;
  failures: Array<{ name: string; error: string }>;
}> {
  const failures: Array<{ name: string; error: string }> = [];

  for (const resolver of ENABLED_RESOLVERS) {
    try {
      const data = await runWithTimeout(resolver.resolve(inputUrl), DEFAULT_TIMEOUT_MS, resolver.name);
      if (!isUsableTikTokData(data)) {
        const reason = 'resolved data missing media or identity';
        failures.push({ name: resolver.name, error: reason });
        console.warn(`[resolver:${resolver.name}] unusable result for ${inputUrl}: ${reason}`);
        continue;
      }
      return { data, resolverName: resolver.name, failures };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failures.push({ name: resolver.name, error: errorMsg });
      console.warn(`[resolver:${resolver.name}] failed for ${inputUrl}: ${errorMsg}`);
      // Continue to next resolver
    }
  }

  // All resolvers failed
  const errorSummary = failures.map((f) => `${f.name}: ${f.error}`).join('; ');
  throw new Error(`All resolvers failed: ${errorSummary}`);
}

export function getEnabledResolverNames(): string[] {
  return ENABLED_RESOLVERS.map((r) => r.name);
}

export { ALL_RESOLVERS };