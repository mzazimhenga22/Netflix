const RAWG_BASE_URL = 'https://api.rawg.io/api';
const RAWG_API_KEY = process.env.EXPO_PUBLIC_RAWG_API_KEY;

export interface GameCardItem {
  id: string;
  title: string;
  subtitle: string;
  posterUrl: string;
  badge1?: string | null;
  badge2?: string | null;
}

export interface GameSection {
  title: string;
  items: GameCardItem[];
}

export interface GameDetails {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  heroUrl: string;
  posterUrl: string;
}

const FALLBACK_SECTIONS: GameSection[] = [
  {
    title: 'Trending Now',
    items: [
      { id: '3498', title: 'Grand Theft Auto V', subtitle: 'Action', posterUrl: 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg', badge1: 'Top 10', badge2: 'Popular' },
      { id: '28', title: 'Red Dead Redemption 2', subtitle: 'Adventure', posterUrl: 'https://media.rawg.io/media/games/7f5/7f5c3f1c6e1e0a4d8f0e2c1fdbf4f387.jpg', badge1: 'Top 10', badge2: 'Critics Pick' },
      { id: '3328', title: 'The Witcher 3', subtitle: 'RPG', posterUrl: 'https://media.rawg.io/media/games/0c0/0c0d50f2f75c8f8d6f859f7bf148d464.jpg', badge1: 'Top 10', badge2: 'Must Play' },
    ]
  }
];

const FALLBACK_DETAILS: Record<string, GameDetails> = {
  '3498': {
    id: '3498',
    title: 'Grand Theft Auto V',
    subtitle: 'Action',
    description: 'Explore Los Santos in one of the most successful open-world action games ever made.',
    heroUrl: 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg',
    posterUrl: 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg',
  },
};

function getRawgUrl(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  if (RAWG_API_KEY) {
    query.set('key', RAWG_API_KEY);
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return `${RAWG_BASE_URL}${path}?${query.toString()}`;
}

function mapGame(item: any, badge1?: string | null, badge2?: string | null): GameCardItem {
  return {
    id: String(item.id),
    title: item.name || 'Unknown Game',
    subtitle: item.genres?.[0]?.name || item.esrb_rating?.name || 'Game',
    posterUrl: item.background_image || item.background_image_additional || '',
    badge1,
    badge2,
  };
}

async function fetchJson(path: string, params: Record<string, string | number | undefined>) {
  const response = await fetch(getRawgUrl(path, params));
  if (!response.ok) {
    throw new Error(`RAWG request failed: ${response.status}`);
  }
  return response.json();
}

export const GameService = {
  async getHomeSections(): Promise<GameSection[]> {
    if (!RAWG_API_KEY) return FALLBACK_SECTIONS;

    try {
      const [popular, indie, family, strategy] = await Promise.all([
        fetchJson('/games', { ordering: '-rating', page_size: 12 }),
        fetchJson('/games', { genres: 'indie', ordering: '-added', page_size: 12 }),
        fetchJson('/games', { genres: 'family', ordering: '-added', page_size: 12 }),
        fetchJson('/games', { genres: 'strategy', ordering: '-metacritic', page_size: 12 }),
      ]);

      return [
        {
          title: 'Trending Now',
          items: (popular.results || []).slice(0, 12).map((game: any, index: number) =>
            mapGame(game, index < 3 ? 'Top 10' : null, index === 0 ? 'Popular' : null)
          ),
        },
        {
          title: 'Indie Essentials',
          items: (indie.results || []).slice(0, 12).map((game: any) => mapGame(game, null, 'Indie')),
        },
        {
          title: 'Strategy & Puzzle',
          items: (strategy.results || []).slice(0, 12).map((game: any) => mapGame(game, null, 'Smart Pick')),
        },
        {
          title: 'Kids & Family',
          items: (family.results || []).slice(0, 12).map((game: any) => mapGame(game, null, 'Family')),
        },
      ].filter((section) => section.items.length > 0);
    } catch (error) {
      console.warn('[GameService] Falling back to static sections:', error);
      return FALLBACK_SECTIONS;
    }
  },

  async getGameDetails(id: string): Promise<GameDetails> {
    if (!RAWG_API_KEY) {
      return FALLBACK_DETAILS[id] || Object.values(FALLBACK_DETAILS)[0];
    }

    try {
      const data = await fetchJson(`/games/${id}`, {});
      return {
        id: String(data.id),
        title: data.name || 'Unknown Game',
        subtitle: data.genres?.[0]?.name || data.esrb_rating?.name || 'Game',
        description: (data.description_raw || data.description || 'No description available.').replace(/<[^>]+>/g, ''),
        heroUrl: data.background_image_additional || data.background_image || '',
        posterUrl: data.background_image || data.background_image_additional || '',
      };
    } catch (error) {
      console.warn('[GameService] Falling back to static details:', error);
      return FALLBACK_DETAILS[id] || Object.values(FALLBACK_DETAILS)[0];
    }
  },
};
