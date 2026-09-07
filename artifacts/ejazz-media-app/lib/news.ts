import { useQuery } from '@tanstack/react-query';

export type Story = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  time: string;
  imageUrl: string | null;
  publishedAt: string;
  author: string;
  content: string[];
  link: string;
};

type WordPressRendered = {
  rendered?: string;
};

type WordPressPost = {
  id: number;
  date?: string;
  link?: string;
  title?: WordPressRendered;
  excerpt?: WordPressRendered;
  content?: WordPressRendered;
  _embedded?: {
    author?: Array<{ name?: string }>;
    'wp:featuredmedia'?: Array<{
      source_url?: string;
      media_details?: {
        sizes?: Record<string, { source_url?: string }>;
      };
    }>;
    'wp:term'?: Array<Array<{ taxonomy?: string; name?: string }>>;
  };
};

const NEWS_API_URL = process.env.EXPO_PUBLIC_EJAZZ_NEWS_API_URL?.trim() ?? '';
const NEWS_REQUEST_TIMEOUT_MS = 10_000;

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
    throw new Error('EJazz News is not configured.');
  }

  const base = NEWS_API_URL.replace(/\/+$/, '');
  const isPostsEndpoint = /\/posts(?:\?|$)/.test(base);
  const target = path
    ? `${isPostsEndpoint ? base.replace(/\/posts(?:\?.*)?$/, '/posts') : `${base}/posts`}/${path}`
    : isPostsEndpoint
      ? base
      : `${base}/posts`;
  const url = new URL(target);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function mapPost(post: WordPressPost): Story {
  const contentText = decodeHtml(post.content?.rendered ?? '');
  const excerpt = decodeHtml(post.excerpt?.rendered ?? '');
  const category =
    post._embedded?.['wp:term']
      ?.flat()
      .find((term) => term.taxonomy === 'category')
      ?.name?.replace(/^E-/, '') ?? 'News';
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const imageUrl =
    media?.source_url ??
    media?.media_details?.sizes?.large?.source_url ??
    media?.media_details?.sizes?.medium_large?.source_url ??
    null;
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;

  return {
    id: String(post.id),
    category: category.toUpperCase(),
    title: decodeHtml(post.title?.rendered ?? 'Untitled'),
    excerpt: excerpt || contentText.slice(0, 180),
    time: `${Math.max(1, Math.ceil(wordCount / 220))} MIN READ`,
    imageUrl,
    publishedAt: post.date ?? '',
    author: post._embedded?.author?.[0]?.name?.trim() || 'EJAZZ EDITORIAL',
    content: contentText.split(/\n{2,}/).filter(Boolean),
    link: post.link ?? '',
  };
}

async function fetchNews(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The news service took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPosts() {
  const response = await fetchNews(apiUrl('', { _embed: '1', per_page: '30', status: 'publish' }));
  if (!response.ok) {
    throw new Error(`News request failed (${response.status}).`);
  }
  const posts = (await response.json()) as WordPressPost[];
  if (!Array.isArray(posts)) {
    throw new Error('The news service returned an unexpected response.');
  }
  return posts.map(mapPost);
}

async function requestPost(id: string) {
  const response = await fetchNews(apiUrl(encodeURIComponent(id), { _embed: '1' }));
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'This story could not be found.' : `Story request failed (${response.status}).`);
  }
  return mapPost((await response.json()) as WordPressPost);
}

export function useNews() {
  return useQuery({
    queryKey: ['ejazz-news'],
    queryFn: requestPosts,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useArticle(id?: string) {
  return useQuery({
    queryKey: ['ejazz-news', id],
    queryFn: () => requestPost(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}