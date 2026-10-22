// RSS 2.0, RSS 1.0 (RDF) and Atom (including YouTube's channel feeds) read into one shape.
import { XMLParser } from "fast-xml-parser";
import { SourceError } from "./errors.js";

export type FeedItem = {
  /** the guid / Atom id, or the link when the feed has none; what dedupe is keyed on */
  id: string;
  title: string;
  url: string;
  author: string;
  publishedAt: Date | null;
};

export type FeedDoc = { title: string; items: FeedItem[] };

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
});

/** the text of a node however the parser shaped it: a string, a {#text, @attrs} object, or an array */
function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const node = value as Node;
    if ("#text" in node) return text(node["#text"]);
    if ("@_href" in node) return text(node["@_href"]);
  }
  return "";
}

function list<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function date(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** an Atom entry's alternate link (YouTube's watch link), else its first link */
function atomLink(entry: Node): string {
  const links = list(entry.link as unknown).map((l) => (typeof l === "string" ? ({ "@_href": l } as Node) : (l as Node)));
  const alternate = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  return alternate ? text(alternate["@_href"] ?? alternate) : "";
}

export function parseFeed(xml: string): FeedDoc {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new SourceError("That isn't readable XML, so it isn't an RSS or Atom feed.");
  }

  const feed = doc.feed as Node | undefined;
  if (feed) {
    const feedAuthor = text((feed.author as Node | undefined)?.name) || text(feed.title);
    const items = list(feed.entry as Node | Node[] | undefined).map((entry): FeedItem => {
      const url = atomLink(entry);
      return {
        id: text(entry.id) || url,
        title: text(entry.title) || "(untitled)",
        url,
        author: text((entry.author as Node | undefined)?.name) || feedAuthor,
        publishedAt: date(entry.published ?? entry.updated),
      };
    });
    return { title: text(feed.title), items: items.filter((item) => item.id) };
  }

  const rdf = doc["rdf:RDF"] as Node | undefined;
  const channel = ((doc.rss as Node | undefined)?.channel ?? rdf?.channel) as Node | undefined;
  if (!channel) throw new SourceError("That address doesn't serve an RSS or Atom feed.");
  const rawItems = list((channel.item ?? rdf?.item) as Node | Node[] | undefined);
  const channelTitle = text(channel.title);
  const items = rawItems.map((item): FeedItem => {
    const url = text(item.link) || text(item.guid);
    return {
      id: text(item.guid) || url || text(item.title),
      title: text(item.title) || "(untitled)",
      url,
      author: text(item["dc:creator"]) || text(item.author) || channelTitle,
      publishedAt: date(item.pubDate ?? item["dc:date"]),
    };
  });
  return { title: channelTitle, items: items.filter((item) => item.id) };
}
