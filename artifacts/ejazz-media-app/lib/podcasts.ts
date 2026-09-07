import { useQuery } from '@tanstack/react-query';

const REQUEST_TIMEOUT_MS = 10_000;

export type PodcastSlug = 'xtreme-bpm' | 'finance-future-tech';

export type PodcastEpisode = {
  id: string;
  title: string;
  description: string;
  dateLabel: string;
  audioUrl: string;
};

export type PodcastShow = {
  slug: PodcastSlug;
  name: string;
  channelTitle: string;
  description: string;
  artworkUrl: string;
  episodes: PodcastEpisode[];
};

export const PODCAST_SHOWS: ReadonlyArray<{
  slug: PodcastSlug;
  name: string;
  feedUrl: string;
}> = [
  {
    slug: 'xtreme-bpm',
    name: 'The Xtreme BPM',
    feedUrl: 'https://anchor.fm/s/281a6d78/podcast/rss',
  },
  {
    slug: 'finance-future-tech',
    name: 'Finance & Future Tech',
    feedUrl: 'https://anchor.fm/s/ecdbbb44/podcast/rss',
  },
];

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function plainText(value: string) {
  return decodeXml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tagValue(block: string, tag: string) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'))?.[1] ?? '';
}

function attributeValue(tag: string, attribute: string) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeXml(
    tag.match(new RegExp(`${escapedAttribute}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '',
  );
}

function formatEpisodeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function parsePodcastFeed(xml: string, slug: PodcastSlug): PodcastShow {
  const config = PODCAST_SHOWS.find((show) => show.slug === slug);
  if (!config) throw new Error('Unknown podcast');
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i)?.[1];
  if (!channel) throw new Error('Invalid podcast feed');

  const itunesImageTag = channel.match(/<itunes:image\b[^>]*>/i)?.[0] ?? '';
  const channelImageBlock = tagValue(channel, 'image');
  const artworkUrl = attributeValue(itunesImageTag, 'href')
    || plainText(tagValue(channelImageBlock, 'url'));
  const itemBlocks = channel.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const episodes = itemBlocks
    .slice(0, 50)
    .map((item, index): PodcastEpisode | null => {
      const enclosureTag = item.match(/<enclosure\b[^>]*>/i)?.[0] ?? '';
      const audioUrl = attributeValue(enclosureTag, 'url');
      const title = plainText(tagValue(item, 'title'));
      if (!audioUrl || !title) return null;
      const guid = plainText(tagValue(item, 'guid'));
      return {
        id: guid || `${slug}-${index}-${audioUrl}`,
        title,
        description: plainText(tagValue(item, 'description')),
        dateLabel: formatEpisodeDate(plainText(tagValue(item, 'pubDate'))),
        audioUrl,
      };
    })
    .filter((episode): episode is PodcastEpisode => episode !== null);

  return {
    slug,
    name: config.name,
    channelTitle: plainText(tagValue(channel, 'title')) || config.name,
    description: plainText(tagValue(channel, 'description')),
    artworkUrl,
    episodes,
  };
}

async function fetchPodcastFeed(slug: PodcastSlug) {
  const config = PODCAST_SHOWS.find((show) => show.slug === slug);
  if (!config) throw new Error('Unknown podcast');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.feedUrl, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Podcast feed unavailable');
    return parsePodcastFeed(await response.text(), slug);
  } catch {
    throw new Error('Podcast feed temporarily unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export function usePodcastFeed(slug: PodcastSlug) {
  return useQuery({
    queryKey: ['podcasts', slug],
    queryFn: () => fetchPodcastFeed(slug),
    staleTime: 15 * 60_000,
    retry: 1,
  });
}