import { describe, expect, it } from "vitest";

import { applyJobDedupe, createEmptyJobSeenStore } from "./dedupe.js";
import { formatJobDigest } from "./digest.js";
import { rssParser } from "./providers/rss.js";
import type { JobSearchProviderConfig } from "./types.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Acme Jobs</title>
    <item>
      <title>Senior TypeScript Engineer</title>
      <link>https://jobs.example.com/roles/1</link>
      <guid>role-1</guid>
      <pubDate>Mon, 01 Jan 2025 10:00:00 GMT</pubDate>
      <location>Remote</location>
    </item>
  </channel>
</rss>`;

describe("rssParser", () => {
  it("parses RSS feed entries", () => {
    const provider: JobSearchProviderConfig = {
      kind: "rss",
      id: "acme",
      feedUrl: "https://example.com/feed.xml",
    };
    const jobs = rssParser.parseRssJobs({
      xml: SAMPLE_RSS,
      provider,
      sourceLabel: "Acme",
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Senior TypeScript Engineer");
    expect(jobs[0]?.company).toBe("Acme Jobs");
    expect(jobs[0]?.location).toBe("Remote");
  });
});

describe("applyJobDedupe", () => {
  it("filters seen jobs", () => {
    const nowMs = Date.now();
    const store = createEmptyJobSeenStore();
    store.seen["Acme:1"] = {
      url: "https://jobs.example.com/roles/1",
      seenAt: nowMs,
      title: "Senior TypeScript Engineer",
      source: "Acme",
    };

    const { fresh } = applyJobDedupe({
      jobs: [
        {
          id: "1",
          title: "Senior TypeScript Engineer",
          company: "Acme",
          url: "https://jobs.example.com/roles/1",
          source: "Acme",
        },
        {
          id: "2",
          title: "Staff Engineer",
          company: "Acme",
          url: "https://jobs.example.com/roles/2",
          source: "Acme",
        },
      ],
      store,
      nowMs,
    });

    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.id).toBe("2");
  });
});

describe("formatJobDigest", () => {
  it("groups by source and sorts by recency", () => {
    const digest = formatJobDigest([
      {
        id: "1",
        title: "Role A",
        company: "Acme",
        url: "https://example.com/a",
        source: "Source A",
        postedAt: "2025-01-02T00:00:00.000Z",
      },
      {
        id: "2",
        title: "Role B",
        company: "Beta",
        url: "https://example.com/b",
        source: "Source B",
        postedAt: "2025-01-03T00:00:00.000Z",
      },
    ]);

    expect(digest).toContain("Source A (1)");
    expect(digest).toContain("Source B (1)");
    expect(digest).toContain("Role B");
    expect(digest).toContain("Role A");
  });
});
