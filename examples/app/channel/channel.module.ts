/**
 * Channel module: repository, use case and routes, wired in one place.
 * Its prerequisites are what the app must provide before `.addModule(channelModule)`;
 * a missing or mistyped one is a compile error naming the key.
 */
import { defineModule } from '../../../src/index.js';
import type { Route } from '../shared/http.js';
import type { Pool } from '../shared/resources.js';

export interface ChannelProfile {
  id: string;
  displayName: string;
}

/** What other modules may consume, through a port of their own, without importing this one. */
export interface ChannelLookup {
  exists(channelId: string): Promise<boolean>;
}

class ChannelProfileRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<ChannelProfile | undefined> {
    const sql = 'select * from channel.profiles where id = $1';
    const { rows } = await this.pool.query<ChannelProfile>(sql, [id]);
    return rows[0];
  }

  async save(profile: ChannelProfile): Promise<void> {
    await this.pool.query('delete from channel.profiles where id = $1', [profile.id]);
    await this.pool.query('insert into channel.profiles', [profile]);
  }
}

class UpdateChannelProfileUseCase {
  constructor(private readonly profiles: ChannelProfileRepository) {}

  async execute(profile: ChannelProfile): Promise<ChannelProfile> {
    await this.profiles.save(profile);
    return profile;
  }
}

function channelRoutes(
  profiles: ChannelProfileRepository,
  updateProfile: UpdateChannelProfileUseCase,
): Route[] {
  return [
    {
      method: 'GET',
      path: '/channels/:id',
      async handle({ id = '' }) {
        const profile = await profiles.findById(id);
        if (profile) return { status: 200, body: profile };
        const message = `Channel '${id}' does not exist, create it with POST /channels/${id}.`;
        return { status: 404, body: { code: 'CHANNEL_NOT_FOUND', message } };
      },
    },
    {
      method: 'POST',
      path: '/channels/:id',
      async handle({ id = '' }, body) {
        const { displayName = id } = (body ?? {}) as { displayName?: string };
        return { status: 200, body: await updateProfile.execute({ id, displayName }) };
      },
    },
  ];
}

export const channelModule = defineModule<{ pool: Pool }>()((b) =>
  b
    .add('channelProfiles', (c) => new ChannelProfileRepository(c.pool))
    .add('updateChannelProfile', (c) => new UpdateChannelProfileUseCase(c.channelProfiles))
    .add(
      'channels',
      (c): ChannelLookup => ({
        exists: async (id) => (await c.channelProfiles.findById(id)) !== undefined,
      }),
    )
    .add('channelRoutes', (c) => channelRoutes(c.channelProfiles, c.updateChannelProfile)),
);
