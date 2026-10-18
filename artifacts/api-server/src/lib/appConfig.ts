import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { DEFAULT_CHARTS_CONFIG, normalizeChartsConfig, type ChartsConfig } from "./countdownChartsCore";
import {
  DEFAULT_STATION_SCHEDULE,
  normalizeStationSchedule,
  requestStatus,
  type RequestStatus,
  type StationRequestSchedule,
} from "./requestWindows";

/**
 * Remote app configuration ("app controls").
 *
 * Edited in the Control Room, stored as one JSON row in `app_settings`, and read
 * by the mobile app from GET /api/app-config. Every value has a safe default so
 * an empty database (or an old app reading a newer config) never breaks anything.
 * Empty strings mean "not set / use the app's built-in value".
 */

export type StreamConfig = { url: string; backupUrl: string };
export type PodcastEntry = { slug: string; name: string; feedUrl: string };

/**
 * One slot in the day at which an automatic fun fact fires. Dayparts, not an interval:
 * the time of day is itself the context handed to the model, and an interval would drift
 * across the clock and post at 3am.
 */
export type FunFactDaypart = { id: string; label: string; time: string; enabled: boolean };
export type FunFactsConfig = {
  enabled: boolean;
  /** Days of the week it may fire on, 0 = Sunday. Empty = every day. */
  days: number[];
  /** Push audience, same values as a manual push. */
  topic: "all" | "radio" | "xtra";
  dayparts: FunFactDaypart[];
};

/** Operator-only: whether a song with no fact gets one written by AI the first time it is seen. */
export type SongFactsConfig = {
  autoGenerate: boolean;
  /** Which model writes a fact when none exists: Gemini (search-grounded), Groq (no search), or none (sheet and typed facts only). */
  provider: "gemini" | "groq" | "none";
  maxPerHour: number;
  maxPerDay: number;
  /** A Google Sheet of facts (artist, title, fact). Blank = none linked. Checked hourly. */
  sheetUrl: string;
};

/** One station's own social / web links. Blank = not shown. */
export type StationLinks = {
  instagramUrl: string;
  facebookUrl: string;
  xUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  whatsappUrl: string;
  websiteUrl: string;
};

export type AppConfig = {
  features: {
    news: boolean;
    podcasts: boolean;
    songRequests: boolean;
    share: boolean;
    pulse: boolean;
    /** "Coming Up" row on Home. */
    schedule: boolean;
    /** "Coming Up" row on the Radio screen, switched separately from Home. */
    scheduleRadio: boolean;
  };
  /**
   * Song requests. `radioEnabled`/`xtraEnabled` are the operator's own switch for the
   * station; `radio`/`xtra` say WHEN it takes requests ("always", or only inside the
   * windows). The public config turns the pair into a plain open/closed answer plus a
   * status -- see toPublicConfig(); the windows themselves never leave this side.
   */
  songRequests: {
    radioEnabled: boolean;
    xtraEnabled: boolean;
    closedMessage: string;
    radio: StationRequestSchedule;
    xtra: StationRequestSchedule;
  };
  update: {
    /** Apps older than this must update before continuing (blocking screen). */
    minVersion: string;
    /** Apps older than this see a dismissible "update available" banner. */
    latestVersion: string;
    message: string;
    storeUrl: string;
  };
  maintenance: { enabled: boolean; title: string; message: string };
  streams: { radio: StreamConfig; xtra: StreamConfig };
  featured: {
    enabled: boolean;
    kicker: string;
    title: string;
    body: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
  };
  banner: {
    enabled: boolean;
    title: string;
    message: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
    dismissible: boolean;
  };
  sponsor: {
    enabled: boolean;
    label: string;
    imageUrl: string;
    linkUrl: string;
    startAt: string;
    endAt: string;
  };
  links: {
    contactEmail: string;
    instagramUrl: string;
    whatsappUrl: string;
    websiteUrl: string;
    privacyUrl: string;
    termsUrl: string;
    shareText: string;
    /** Wording of the "share the app" invitation. Blank = the app's built-in wording. The download link is added by the app. */
    shareAppText: string;
    /** Each station's own socials, shown in the More tab under that station's name. */
    radio: StationLinks;
    xtra: StationLinks;
  };
  /** Empty list = the app uses its built-in podcast list. */
  podcasts: PodcastEntry[];
  /**
   * Operator-only. Stripped by toPublicConfig(), so it never reaches a device: the app has
   * no use for it and it would just be scheduling detail leaked to every phone.
   */
  funFacts: FunFactsConfig;
  /** Operator-only, stripped by toPublicConfig() like funFacts. */
  songFacts: SongFactsConfig;
  /**
   * Operator-only, stripped by toPublicConfig(): how far back listeners may view countdown
   * charts and how long saved days are kept. The app is told the result per chart instead.
   */
  charts: ChartsConfig;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  features: { news: true, podcasts: true, songRequests: true, share: true, pulse: true, schedule: true, scheduleRadio: true },
  charts: DEFAULT_CHARTS_CONFIG,
  songRequests: {
    radioEnabled: true,
    xtraEnabled: true,
    closedMessage: "Song requests are closed right now. Try again later.",
    radio: DEFAULT_STATION_SCHEDULE,
    xtra: DEFAULT_STATION_SCHEDULE,
  },
  update: { minVersion: "", latestVersion: "", message: "A new version of EJazz Media is available.", storeUrl: "" },
  maintenance: { enabled: false, title: "We'll be right back", message: "EJazz Media is being updated. Please check back shortly." },
  streams: {
    radio: { url: "", backupUrl: "" },
    xtra: { url: "", backupUrl: "" },
  },
  featured: { enabled: false, kicker: "FEATURED", title: "", body: "", imageUrl: "", linkUrl: "", startAt: "", endAt: "" },
  banner: { enabled: false, title: "", message: "", imageUrl: "", linkUrl: "", startAt: "", endAt: "", dismissible: true },
  sponsor: { enabled: false, label: "SPONSORED", imageUrl: "", linkUrl: "", startAt: "", endAt: "" },
  links: {
    contactEmail: "",
    instagramUrl: "",
    whatsappUrl: "",
    websiteUrl: "",
    privacyUrl: "",
    termsUrl: "",
    shareText: "",
    shareAppText: "",
    radio: { instagramUrl: "", facebookUrl: "", xUrl: "", tiktokUrl: "", youtubeUrl: "", whatsappUrl: "", websiteUrl: "" },
    xtra: { instagramUrl: "", facebookUrl: "", xUrl: "", tiktokUrl: "", youtubeUrl: "", whatsappUrl: "", websiteUrl: "" },
  },
  podcasts: [],
  // Off by default, and every daypart off: turning the feature on must be a deliberate act,
  // and nothing should start pushing to every listener because a config row got created.
  songFacts: { autoGenerate: true, provider: "gemini", maxPerHour: 40, maxPerDay: 300, sheetUrl: "" },
  funFacts: {
    enabled: false,
    days: [],
    topic: "all",
    dayparts: [
      { id: "morning", label: "Morning", time: "08:00", enabled: false },
      { id: "midday", label: "Midday", time: "12:30", enabled: false },
      { id: "drive", label: "Drive time", time: "17:00", enabled: false },
      { id: "evening", label: "Evening", time: "20:00", enabled: false },
    ],
  },
};

// ---------- sanitising helpers (no external deps; never trust stored/posted JSON) ----------

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

/** http(s) links only, so a typo or a pasted "javascript:" can never become a tappable link in the app. */
function url(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim().slice(0, 2000);
  if (!v) return "";
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : fallback;
}

function email(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim().slice(0, 200);
  if (!v) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : fallback;
}

function version(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v) return "";
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : fallback;
}

function isoDate(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v) return "";
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "show";
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same rule as songFactsSheet.validateSheetUrl, inlined to keep this file free of imports from it. */
function validateSheetUrlShape(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "docs.google.com" && u.pathname.startsWith("/spreadsheets/");
  } catch {
    return false;
  }
}

function stationLinks(value: unknown): StationLinks {
  const v = obj(value);
  return {
    instagramUrl: url(v.instagramUrl),
    facebookUrl: url(v.facebookUrl),
    xUrl: url(v.xUrl),
    tiktokUrl: url(v.tiktokUrl),
    youtubeUrl: url(v.youtubeUrl),
    whatsappUrl: url(v.whatsappUrl),
    websiteUrl: url(v.websiteUrl),
  };
}

function capNumber(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
}

/** 0 is a valid cap (generate nothing); a missing or invalid value keeps the default. */
function songFactsConfig(value: unknown): SongFactsConfig {
  const d = DEFAULT_APP_CONFIG.songFacts;
  const src = obj(value);
  return {
    autoGenerate: src.autoGenerate !== false,
    provider: src.provider === "groq" ? "groq" : src.provider === "none" ? "none" : "gemini",
    sheetUrl: typeof src.sheetUrl === "string" && validateSheetUrlShape(src.sheetUrl.trim()) ? src.sheetUrl.trim().slice(0, 500) : "",
    maxPerHour: capNumber(src.maxPerHour, d.maxPerHour, 1000),
    maxPerDay: capNumber(src.maxPerDay, d.maxPerDay, 10000),
  };
}

function funFacts(value: unknown): FunFactsConfig {
  const d = DEFAULT_APP_CONFIG.funFacts;
  const src = obj(value);
  const topicRaw = text(src.topic, d.topic, 10);
  const days = Array.isArray(src.days)
    ? [...new Set(src.days.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : d.days;

  // Dayparts are rebuilt from the defaults by id, so an unknown id from a hand-edited
  // config cannot introduce a slot the UI has no control for, and a removed one comes back
  // with its default time rather than silently disappearing.
  const incoming = new Map<string, Record<string, unknown>>();
  if (Array.isArray(src.dayparts)) {
    for (const raw of src.dayparts) {
      const item = obj(raw);
      const id = text(item.id, "", 20);
      if (id) incoming.set(id, item);
    }
  }
  const dayparts = d.dayparts.map((def) => {
    const item = incoming.get(def.id);
    if (!item) return { ...def };
    const time = text(item.time, def.time, 5);
    return {
      id: def.id,
      label: def.label,
      time: TIME_RE.test(time) ? time : def.time,
      enabled: bool(item.enabled, def.enabled),
    };
  });

  return {
    enabled: bool(src.enabled, d.enabled),
    days,
    topic: topicRaw === "radio" || topicRaw === "xtra" ? topicRaw : "all",
    dayparts,
  };
}

function podcasts(value: unknown): PodcastEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PodcastEntry[] = [];
  for (const raw of value.slice(0, 12)) {
    const item = obj(raw);
    const name = text(item.name, "", 80);
    const feedUrl = url(item.feedUrl);
    if (!name || !feedUrl) continue;
    let slug = slugify(text(item.slug, "", 40) || name);
    while (seen.has(slug)) slug = `${slug}-2`;
    seen.add(slug);
    out.push({ slug, name, feedUrl });
  }
  return out;
}

/** Merge arbitrary input over the defaults, coercing every field to its expected type. */
export function normalizeAppConfig(input: unknown): AppConfig {
  const d = DEFAULT_APP_CONFIG;
  const src = obj(input);
  const f = obj(src.features);
  const sr = obj(src.songRequests);
  const up = obj(src.update);
  const mt = obj(src.maintenance);
  const st = obj(src.streams);
  const stRadio = obj(st.radio);
  const stXtra = obj(st.xtra);
  const ft = obj(src.featured);
  const bn = obj(src.banner);
  const sp = obj(src.sponsor);
  const lk = obj(src.links);

  return {
    features: {
      news: bool(f.news, d.features.news),
      podcasts: bool(f.podcasts, d.features.podcasts),
      songRequests: bool(f.songRequests, d.features.songRequests),
      share: bool(f.share, d.features.share),
      pulse: bool(f.pulse, d.features.pulse),
      schedule: bool(f.schedule, d.features.schedule),
      scheduleRadio: bool(f.scheduleRadio, d.features.scheduleRadio),
    },
    songRequests: {
      radioEnabled: bool(sr.radioEnabled, d.songRequests.radioEnabled),
      xtraEnabled: bool(sr.xtraEnabled, d.songRequests.xtraEnabled),
      closedMessage: text(sr.closedMessage, d.songRequests.closedMessage, 200) || d.songRequests.closedMessage,
      radio: normalizeStationSchedule(sr.radio),
      xtra: normalizeStationSchedule(sr.xtra),
    },
    update: {
      minVersion: version(up.minVersion),
      latestVersion: version(up.latestVersion),
      message: text(up.message, d.update.message, 200) || d.update.message,
      storeUrl: url(up.storeUrl),
    },
    maintenance: {
      enabled: bool(mt.enabled, d.maintenance.enabled),
      title: text(mt.title, d.maintenance.title, 80) || d.maintenance.title,
      message: text(mt.message, d.maintenance.message, 300) || d.maintenance.message,
    },
    streams: {
      radio: { url: url(stRadio.url), backupUrl: url(stRadio.backupUrl) },
      xtra: { url: url(stXtra.url), backupUrl: url(stXtra.backupUrl) },
    },
    featured: {
      enabled: bool(ft.enabled, d.featured.enabled),
      kicker: text(ft.kicker, d.featured.kicker, 30),
      title: text(ft.title, "", 120),
      body: text(ft.body, "", 400),
      imageUrl: url(ft.imageUrl),
      linkUrl: url(ft.linkUrl),
      startAt: isoDate(ft.startAt),
      endAt: isoDate(ft.endAt),
    },
    banner: {
      enabled: bool(bn.enabled, d.banner.enabled),
      title: text(bn.title, "", 80),
      message: text(bn.message, "", 240),
      imageUrl: url(bn.imageUrl),
      linkUrl: url(bn.linkUrl),
      startAt: isoDate(bn.startAt),
      endAt: isoDate(bn.endAt),
      dismissible: bool(bn.dismissible, d.banner.dismissible),
    },
    sponsor: {
      enabled: bool(sp.enabled, d.sponsor.enabled),
      label: text(sp.label, d.sponsor.label, 30) || d.sponsor.label,
      imageUrl: url(sp.imageUrl),
      linkUrl: url(sp.linkUrl),
      startAt: isoDate(sp.startAt),
      endAt: isoDate(sp.endAt),
    },
    links: {
      contactEmail: email(lk.contactEmail),
      instagramUrl: url(lk.instagramUrl),
      whatsappUrl: url(lk.whatsappUrl),
      websiteUrl: url(lk.websiteUrl),
      privacyUrl: url(lk.privacyUrl),
      termsUrl: url(lk.termsUrl),
      shareText: text(lk.shareText, "", 200),
      shareAppText: text(lk.shareAppText, "", 200),
      radio: stationLinks(lk.radio),
      xtra: stationLinks(lk.xtra),
    },
    podcasts: podcasts(src.podcasts),
    funFacts: funFacts(src.funFacts),
    songFacts: songFactsConfig(src.songFacts),
    charts: normalizeChartsConfig(src.charts),
  };
}

function inWindow(startAt: string, endAt: string, now: number): boolean {
  if (startAt && Date.parse(startAt) > now) return false;
  if (endAt && Date.parse(endAt) < now) return false;
  return true;
}

/**
 * What the mobile app receives: the stored config with time windows applied
 * server-side, so an expired banner disappears even for apps with a stale cache clock.
 */
export type PublicSongRequests = {
  /** Effective: the station switch and the schedule, as one answer. */
  radioEnabled: boolean;
  xtraEnabled: boolean;
  closedMessage: string;
  radioStatus: RequestStatus;
  xtraStatus: RequestStatus;
};

export type PublicAppConfig =
  Omit<AppConfig, "funFacts" | "songFacts" | "charts" | "songRequests"> & {
    songRequests: PublicSongRequests;
  };

/**
 * The device-facing view of the config. Besides gating the timed banners, this DROPS
 * operator-only sections -- funFacts is scheduling detail the app has no use for, and
 * publishing it would hand every phone the station's posting timetable.
 */
export function toPublicConfig(config: AppConfig, now: number = Date.now()): PublicAppConfig {
  const { funFacts: _operatorOnly, songFacts: _operatorOnly2, charts: _operatorOnly3, ...publicConfig } = config;
  return {
    ...publicConfig,
    songRequests: publicSongRequests(config, now),
    featured: { ...config.featured, enabled: config.featured.enabled && inWindow(config.featured.startAt, config.featured.endAt, now) },
    banner: { ...config.banner, enabled: config.banner.enabled && inWindow(config.banner.startAt, config.banner.endAt, now) },
    sponsor: { ...config.sponsor, enabled: config.sponsor.enabled && inWindow(config.sponsor.startAt, config.sponsor.endAt, now) },
  };
}

/**
 * Song requests as a client sees them.
 *
 * `radioEnabled`/`xtraEnabled` are deliberately EFFECTIVE here, not the stored switch:
 * the station switch AND the schedule, decided server-side. Every app build already
 * reads those two booleans, so a request window closes the form on phones that are
 * already installed, with no new release. `radioStatus`/`xtraStatus` carry the detail a
 * newer build (and the website embed) can show -- when it closes, when it next opens,
 * and the opening times in words. The windows themselves stay on this side: they are
 * operator scheduling detail, and the answer, not the rules, is what a client needs.
 */
function publicSongRequests(config: AppConfig, now: number): PublicSongRequests {
  const sr = config.songRequests;
  const at = new Date(now);
  const radio = requestStatus(sr.radio, sr.radioEnabled, at);
  const xtra = requestStatus(sr.xtra, sr.xtraEnabled, at);
  return {
    radioEnabled: radio.open,
    xtraEnabled: xtra.open,
    closedMessage: sr.closedMessage,
    radioStatus: radio,
    xtraStatus: xtra,
  };
}

export async function getAppConfig(): Promise<AppConfig> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  return normalizeAppConfig(row?.config);
}

export async function saveAppConfig(input: unknown): Promise<AppConfig> {
  const config = normalizeAppConfig(input);
  const now = new Date();
  await db
    .insert(appSettingsTable)
    .values({ id: 1, config: config as unknown as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettingsTable.id,
      set: { config: config as unknown as Record<string, unknown>, updatedAt: now },
    });
  return config;
}
