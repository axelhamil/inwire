/**
 * Barrel re-export — keeps `from '../domain/types.js'` working everywhere.
 *
 * The actual types live in two files for clarity:
 * - `./types/public.ts` — what users see (Container, IContainer, IContainerBuilder, helpers)
 * - `./types/internal.ts` — collaborator interfaces (IResolver, ICycleDetector, IDependencyTracker, IValidator)
 */

export * from './types/internal.js';
export * from './types/public.js';
