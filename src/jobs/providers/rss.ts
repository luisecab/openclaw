import { parseHTML } from "linkedom";

import type { Job, JobProvider, JobSearchProviderConfig, JobSearchQuery } from "../types.js";

const DEFAULT_SOURCE = "RSS";

type DomElement = {
  querySelector: (selector: string) => DomElement | null;
  querySelectorAll: (selector: string) => DomElement[];
  textContent?: string | null;
  getAttribute: (name: string) => string | null;
};

type DomDocument = {
  querySelector: (selector: string) => DomElement | null;
  querySelectorAll: (selector: string) => DomElement[];
};

function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function textFrom(parent: DomElement, selector: string): string {
  const el = parent.querySelector(selector);
  if (!el) return "";
  return normalizeText(el.textContent);
}

function getRssItemLink(item: DomElement): string {
  const link = textFrom(item, "link");
  if (link) return link;
  const guid = textFrom(item, "guid");
  if (guid) return guid;
  return "";
}

function getAtomItemLink(item: DomElement): string {
  const linkEls = Array.from(item.querySelectorAll("link"));
  const alternate = linkEls.find(
    (el) => (el.getAttribute("rel") ?? "alternate").toLowerCase() === "alternate",
  );
  if (alternate?.getAttribute("href")) return alternate.getAttribute("href") ?? "";
  const href = linkEls.find((el) => el.getAttribute("href"))?.getAttribute("href");
  if (href) return href;
  return textFrom(item, "link");
}

function parseDate(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function parseRssJobs(params: {
  xml: string;
  provider: JobSearchProviderConfig;
  sourceLabel: string;
}): Job[] {
  const { document } = parseXmlDocument(params.xml);
  const channel = document.querySelector("channel");
  const feedTitle = normalizeText(channel?.querySelector("title")?.textContent ?? "");
  const company = params.provider.company?.trim() || feedTitle || params.sourceLabel;
  const items = Array.from(document.querySelectorAll("item"));
  return items
    .map((item) => {
      const title = textFrom(item, "title") || "Untitled role";
      const url = getRssItemLink(item);
      const guid = textFrom(item, "guid") || url || title;
      const location = textFrom(item, "location") || textFrom(item, "job\\:location");
      const published = textFrom(item, "pubDate") || textFrom(item, "date");
      const postedAt = parseDate(published);
      return {
        id: guid,
        title,
        company,
        location: location || undefined,
        url: url || guid,
        postedAt,
        source: params.sourceLabel,
        tags: params.provider.tags,
      } satisfies Job;
    })
    .filter((job) => job.url && job.id);
}

function parseAtomJobs(params: {
  xml: string;
  provider: JobSearchProviderConfig;
  sourceLabel: string;
}): Job[] {
  const { document } = parseXmlDocument(params.xml);
  const feed = document.querySelector("feed");
  const feedTitle = normalizeText(feed?.querySelector("title")?.textContent ?? "");
  const company = params.provider.company?.trim() || feedTitle || params.sourceLabel;
  const entries = Array.from(document.querySelectorAll("entry"));
  return entries
    .map((entry) => {
      const title = textFrom(entry, "title") || "Untitled role";
      const url = getAtomItemLink(entry);
      const id = textFrom(entry, "id") || url || title;
      const location =
        textFrom(entry, "location") ||
        textFrom(entry, "job\\:location") ||
        textFrom(entry, "category");
      const published = textFrom(entry, "published") || textFrom(entry, "updated");
      const postedAt = parseDate(published);
      return {
        id,
        title,
        company,
        location: location || undefined,
        url: url || id,
        postedAt,
        source: params.sourceLabel,
        tags: params.provider.tags,
      } satisfies Job;
    })
    .filter((job) => job.url && job.id);
}

function parseXmlDocument(xml: string): { document: DomDocument } {
  const { document } = parseHTML(xml);
  return { document: document as unknown as DomDocument };
}

export function createRssJobProvider(config: JobSearchProviderConfig): JobProvider {
  if (config.kind !== "rss") {
    throw new Error(`Invalid provider kind for RSS: ${config.kind}`);
  }
  const sourceLabel = config.label?.trim() || config.id || DEFAULT_SOURCE;
  const feedUrl = config.feedUrl.trim();
  return {
    id: config.id,
    label: sourceLabel,
    fetchJobs: async (_query: JobSearchQuery) => {
      const res = await fetch(feedUrl);
      if (!res.ok) {
        throw new Error(`RSS fetch failed (${res.status}) for ${feedUrl}`);
      }
      const xml = await res.text();
      if (xml.includes("<entry")) {
        return parseAtomJobs({ xml, provider: config, sourceLabel });
      }
      return parseRssJobs({ xml, provider: config, sourceLabel });
    },
  } satisfies JobProvider;
}

export const rssParser = {
  parseRssJobs,
  parseAtomJobs,
};
