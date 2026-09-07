import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export const NEWS_CATEGORIES = [
  { id: 12, label: 'Top Stories' },
  { id: 8874, label: 'Business' },
  { id: 8871, label: 'Entertainment' },
  { id: 191, label: 'International' },
  { id: 3181, label: 'Africa' },
] as const;

const ALLOWED_CATEGORY_IDS = NEWS_CATEGORIES.map(({ id }) => id);
const CATEGORY_LABELS = new Map<number, string>(NEWS_CATEGORIES.map(({ id, label }) => [id, label]));
const NEWS_API_URL = process.env.EXPO_PUBLIC_EJAZZ_NEWS_API_URL?.trim() ?? '';
const NEWS_REQUEST_TIMEOUT_MS = 10_000;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

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
  if (!NEWS_API_URL) throw new Error('news-unavailable');
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
    content: contentText.split(/\n{2,}/).filter(Boolean),
    link: post.link ?? '',
  };
}

async function requestJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('news-unavailable');
    const data: unknown = await response.json();
    return { data, response };
  } catch {
    throw new Error('news-unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPostsPage(page: number, categoryId?: number): Promise<PostsPage> {
  try {
    const categories = categoryId ? String(categoryId) : ALLOWED_CATEGORY_IDS.join(',');
    const { data, response } = await requestJson(apiUrl('', {
      categories,
      per_page: '10',
      _embed: '1',
      page: String(page),
    }));
    if (!Array.isArray(data) || !data.every(isWordPressPost)) throw new Error('news-unavailable');
    const totalPages = Number(response.headers.get('x-wp-totalpages') ?? page);
    return {
      stories: data.map(mapPost),
      nextPage: page < totalPages ? page + 1 : undefined,
    };
  } catch {
    throw new Error('news-unavailable');
  }
}

async function requestFeaturedStories() {
  try {
    const { data } = await requestJson(apiUrl('', {
      categories: '12',
      per_page: '5',
      _embed: '1',
    }));
    if (!Array.isArray(data) || !data.every(isWordPressPost)) throw new Error('news-unavailable');
    return data.map(mapPost);
  } catch {
    throw new Error('news-unavailable');
  }
}

async function requestPost(id: string) {
  try {
    const { data } = await requestJson(apiUrl(encodeURIComponent(id), { _embed: '1' }));
    if (!isWordPressPost(data)) throw new Error('news-unavailable');
    return mapPost(data);
  } catch {
    throw new Error('news-unavailable');
  }
}

async function requestRelatedStories(categoryId: number, postId: string) {
  try {
    const { data } = await requestJson(apiUrl('', {
      categories: String(categoryId),
      exclude: postId,
      per_page: '4',
      _embed: '1',
    }));
    if (!Array.isArray(data) || !data.every(isWordPressPost)) throw new Error('news-unavailable');
    return data.map(mapPost);
  } catch {
    throw new Error('news-unavailable');
  }
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