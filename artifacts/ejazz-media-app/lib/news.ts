import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

export const NEWS_CATEGORIES = [
  { id: 12, label: 'Top Stories' },
  { id: 8874, label: 'Business' },
  { id: 8871, label: 'Entertainment' },
  { id: 191, label: 'International' },
  { id: 3181, label: 'Africa' },
] as const;

/** Top Stories, which is the carousel's category and no longer a chip. */
export const TOP_STORIES_ID = 12;

/**
 * The categories that get a chip.
 *
 * Top Stories is not one of them (owner, 2026-11-23: *"top stories shouldn't be a tab in
 * news. let it just take that section at the top with the 3 sliders"*). It still names the
 * carousel's query and still labels a story that belongs to it, which is why it stays in
 * NEWS_CATEGORIES above -- it is simply not somewhere you navigate to twice.
 */
export const NEWS_CHIP_CATEGORIES = NEWS_CATEGORIES.filter(({ id }) => id !== TOP_STORIES_ID);

const ALLOWED_CATEGORY_IDS = NEWS_CATEGORIES.map(({ id }) => id);
const CATEGORY_LABELS = new Map<number, string>(NEWS_CATEGORIES.map(({ id, label }) => [id, label]));
const NEWS_API_URL = process.env.EXPO_PUBLIC_EJAZZ_NEWS_API_URL?.trim() ?? '';
const NEWS_REQUEST_TIMEOUT_MS = 10_000;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type Story = {
  id: string;
  slug: string;
  categoryId: number;
  category: string;
  title: string;
  excerpt: string;
  time: string;
  dateLabel: string;
  imageUrl: string | null;
  publishedAt: string;
  author: string;
  content: string[];
  link: string;
};

type WordPressRendered = { rendered?: string };

type WordPressPost = {
  id: number;
  slug?: string;
  date?: string;
  link?: string;
  categories?: number[];
  title?: WordPressRendered;
  excerpt?: WordPressRendered;
  content?: WordPressRendered;
  _embedded?: {
    author?: Array<{ name?: string }>;
    'wp:featuredmedia'?: Array<{ source_url?: string }>;
  };
};

type PostsPage = {
  stories: Story[];
  nextPage?: number;
};

function decodeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#8220;|&#8221;/gi, '"')
    .replace(/&#039;|&apos;|&#8216;|&#8217;/gi, "'")
    .replace(/&hellip;|&#8230;/gi, '…')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function apiUrl(path: string, params: Record<string, string>) {
  if (!NEWS_API_URL) {
    const error = new Error('The News API URL is empty or undefined in this app build.');
    console.error('[EJazz News] Cannot start News API request.', error);
    throw error;
  }
  const base = NEWS_API_URL.replace(/\/+$/, '');
  const postsBase = /\/posts(?:\?|$)/.test(base)
    ? base.replace(/\/posts(?:\?.*)?$/, '/posts')
    : `${base}/posts`;
  const url = new URL(path ? `${postsBase}/${path}` : postsBase);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function formatCardDate(date: string) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
    .format(parsed)
    .toUpperCase();
}

function isWordPressPost(value: unknown): value is WordPressPost {
  if (!value || typeof value !== 'object') return false;
  const post = value as Partial<WordPressPost>;
  return typeof post.id === 'number' && typeof post.title?.rendered === 'string';
}

function mapPost(post: WordPressPost): Story {
  const categoryId =
    post.categories?.find((id) => ALLOWED_CATEGORY_IDS.includes(id as (typeof ALLOWED_CATEGORY_IDS)[number])) ??
    12;
  const contentText = decodeHtml(post.content?.rendered ?? '');
  const excerpt = decodeHtml(post.excerpt?.rendered ?? '');
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;
  const contentParagraphs = contentText.split(/\n{2,}/).filter(Boolean);
  const excerptCore = excerpt.slice(0, 60).trim().toLowerCase();
  const firstParagraphCore = (contentParagraphs[0] ?? '').slice(0, 60).trim().toLowerCase();
  const isLeadParagraphDuplicateOfExcerpt =
    excerptCore.length > 0 && firstParagraphCore.length > 0 && firstParagraphCore.startsWith(excerptCore.slice(0, 40));
  const dedupedContentParagraphs = isLeadParagraphDuplicateOfExcerpt
    ? contentParagraphs.slice(1)
    : contentParagraphs;

  return {
    id: String(post.id),
    slug: post.slug ?? String(post.id),
    categoryId,
    category: (CATEGORY_LABELS.get(categoryId) ?? 'Top Stories').toUpperCase(),
    title: decodeHtml(post.title?.rendered ?? ''),
    excerpt: excerpt || contentText.slice(0, 180),
    time: `${Math.max(1, Math.ceil(wordCount / 220))} MIN READ`,
    dateLabel: formatCardDate(post.date ?? ''),
    imageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
    publishedAt: post.date ?? '',
    author: post._embedded?.author?.[0]?.name?.trim() || 'EJAZZ EDITORIAL',
    content: dedupedContentParagraphs,
    link: post.link ?? '',
  };
}

async function requestJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_REQUEST_TIMEOUT_MS);

  try {
    console.log('[EJazz News] Fetching News API.', { url, platform: Platform.OS });
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'EJazzMediaApp/0.1.0' }),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(
        `News API returned HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 160)}` : ''}`,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error: unknown) {
      throw new Error(`News API returned invalid JSON: ${describeError(error)}`);
    }
    console.log('[EJazz News] News API request succeeded.', { url, status: response.status });
    return { data, response };
  } catch (error: unknown) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `News API request timed out after ${NEWS_REQUEST_TIMEOUT_MS}ms.`
      : describeError(error);
    console.error('[EJazz News] News API request failed.', { url, error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPostsPage(page: number, categoryId?: number): Promise<PostsPage> {
  const categories = categoryId ? String(categoryId) : ALLOWED_CATEGORY_IDS.join(',');
  const { data, response } = await requestJson(apiUrl('', {
    categories,
    per_page: '10',
    _embed: '1',
    page: String(page),
  }));
  if (!Array.isArray(data) || !data.every(isWordPressPost)) {
    const error = new Error('News API response did not contain a valid WordPress posts array.');
    console.error('[EJazz News] Invalid posts response.', { page, categoryId, data });
    throw error;
  }
  const totalPages = Number(response.headers.get('x-wp-totalpages') ?? page);
  return {
    stories: data.map(mapPost),
    nextPage: page < totalPages ? page + 1 : undefined,
  };
}

async function requestFeaturedStories() {
  const { data } = await requestJson(apiUrl('', {
    categories: '12',
    per_page: '5',
    _embed: '1',
  }));
  if (!Array.isArray(data) || !data.every(isWordPressPost)) {
    console.error('[EJazz News] Invalid featured stories response.', data);
    throw new Error('News API response did not contain valid featured stories.');
  }
  return data.map(mapPost);
}

async function requestPost(id: string) {
  const { data } = await requestJson(apiUrl(encodeURIComponent(id), { _embed: '1' }));
  if (!isWordPressPost(data)) {
    console.error('[EJazz News] Invalid article response.', { id, data });
    throw new Error('News API response did not contain a valid article.');
  }
  return mapPost(data);
}

async function requestRelatedStories(categoryId: number, postId: string) {
  const { data } = await requestJson(apiUrl('', {
    categories: String(categoryId),
    exclude: postId,
    per_page: '4',
    _embed: '1',
  }));
  if (!Array.isArray(data) || !data.every(isWordPressPost)) {
    console.error('[EJazz News] Invalid related stories response.', { categoryId, postId, data });
    throw new Error('News API response did not contain valid related stories.');
  }
  return data.map(mapPost);
}

/**
 * SEARCH, ON THE SERVER (owner, task #2: search "scoped to a category or the whole archive").
 *
 * The screen used to filter the stories it had already loaded, which means a search could
 * only ever find what you had already scrolled past -- ten stories, or thirty. This asks
 * WordPress instead, so a search reaches the whole archive.
 *
 * `categoryId: null` means the whole archive, and DELIBERATELY drops the five-category
 * filter that every other list here applies: it is the one way to reach an article in a
 * category the app does not show a chip for, which is the point of "a way to reach ANY
 * article". A story found that way still maps to a known category label, because that is
 * what the card shows.
 */
async function requestSearchPage(page: number, query: string, categoryId: number | null): Promise<PostsPage> {
  const { data, response } = await requestJson(apiUrl('', {
    search: query,
    ...(categoryId ? { categories: String(categoryId) } : {}),
    per_page: '10',
    _embed: '1',
    page: String(page),
  }));
  if (!Array.isArray(data) || !data.every(isWordPressPost)) {
    console.error('[EJazz News] Invalid search response.', { page, query, categoryId, data });
    throw new Error('News API response did not contain a valid WordPress posts array.');
  }
  const totalPages = Number(response.headers.get('x-wp-totalpages') ?? page);
  return { stories: data.map(mapPost), nextPage: page < totalPages ? page + 1 : undefined };
}

/** Two characters is the shortest search worth sending; anything less matches everything. */
export const MIN_SEARCH_LENGTH = 2;

export function useNewsSearch(query: string, categoryId: number | null) {
  const term = query.trim();
  return useInfiniteQuery({
    queryKey: ['ejazz-news', 'search', term, categoryId ?? 'all'],
    queryFn: ({ pageParam }) => requestSearchPage(pageParam, term, categoryId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: term.length >= MIN_SEARCH_LENGTH,
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 1,
  });
}

/**
 * A WordPress collection BESIDE /posts -- /categories, today.
 *
 * `apiUrl()` builds post URLs and knows how to find /posts whether or not the configured
 * value already ends in it; this reuses that reasoning for a sibling, so a deployment that
 * points the app at a different WordPress needs no second setting.
 */
function wpCollectionUrl(resource: string, params: Record<string, string>) {
  if (!NEWS_API_URL) throw new Error('The News API URL is empty or undefined in this app build.');
  const root = NEWS_API_URL.replace(/\/+$/, '').replace(/\/posts(?:\?.*)?$/, '');
  const url = new URL(`${root}/${resource}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

/**
 * Every podcast show that has a CATEGORY of its own on the site, and its ids.
 *
 * One request for the whole category list rather than one per show, because the screen has
 * to know the answer before it draws: a show with no category gets no chip at all. Two of
 * them have none and are not meant to -- owner, 2026-11-23: *"each podcast has a
 * corresponding category on the website except finance & future tech and xtreme BPM"* -- and
 * matching on the name means that stays true by itself as shows come and go, with nothing
 * hardcoded to fall out of date.
 *
 * A show can own MORE THAN ONE category: measured on the live site, "Pop Radar" is 9156 with
 * twelve stories and 9161 with eight. Both are returned and WordPress ORs them, where taking
 * the first would have quietly dropped eight stories.
 */
export function usePodcastCategories(shows: ReadonlyArray<{ slug: string; name: string }>) {
  const names = shows.map((show) => `${show.slug}:${show.name}`).join('|');
  return useQuery({
    queryKey: ['ejazz-news', 'podcast-categories', names],
    enabled: shows.length > 0 && Boolean(NEWS_API_URL),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data } = await requestJson(wpCollectionUrl('categories', { per_page: '100' }));
      const rows = Array.isArray(data) ? (data as { id?: unknown; name?: unknown }[]) : [];
      const found: Record<string, number[]> = {};
      for (const show of shows) {
        const wanted = show.name.trim().toLowerCase();
        const ids = rows
          .filter((row) => String(row.name ?? '').trim().toLowerCase() === wanted)
          .map((row) => row.id)
          .filter((id): id is number => typeof id === 'number');
        if (ids.length) found[show.slug] = ids;
      }
      return found;
    },
  });
}

async function requestShowPage(page: number, categoryIds: number[]): Promise<PostsPage> {
  const { data, response } = await requestJson(apiUrl('', {
    categories: categoryIds.join(','),
    per_page: '10',
    _embed: '1',
    page: String(page),
  }));
  if (!Array.isArray(data) || !data.every(isWordPressPost)) {
    console.error('[EJazz News] Invalid show posts response.', { page, categoryIds, data });
    throw new Error('News API response did not contain a valid WordPress posts array.');
  }
  const totalPages = Number(response.headers.get('x-wp-totalpages') ?? page);
  return { stories: data.map(mapPost), nextPage: page < totalPages ? page + 1 : undefined };
}

/** The stories filed under one show's category or categories. */
export function useNewsForShow(categoryIds: number[] | undefined) {
  const ids = categoryIds ?? [];
  return useInfiniteQuery({
    queryKey: ['ejazz-news', 'show-stories', ids.join(',') || 'none'],
    queryFn: ({ pageParam }) => requestShowPage(pageParam, ids),
    enabled: ids.length > 0,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 1,
  });
}

export function useLatestNews(categoryId?: number) {
  return useInfiniteQuery({
    queryKey: ['ejazz-news', 'latest', categoryId ?? 'all'],
    queryFn: ({ pageParam }) => requestPostsPage(pageParam, categoryId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 2,
  });
}

export function useFeaturedNews() {
  return useQuery({
    queryKey: ['ejazz-news', 'featured'],
    queryFn: requestFeaturedStories,
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 2,
  });
}

export function useArticle(id?: string) {
  return useQuery({
    queryKey: ['ejazz-news', 'article', id],
    queryFn: () => requestPost(id as string),
    enabled: Boolean(id),
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 2,
  });
}

export function useRelatedNews(categoryId?: number, postId?: string) {
  return useQuery({
    queryKey: ['ejazz-news', 'related', categoryId, postId],
    queryFn: () => requestRelatedStories(categoryId as number, postId as string),
    enabled: Boolean(categoryId && postId),
    staleTime: NEWS_CACHE_TTL_MS,
    retry: 2,
  });
}