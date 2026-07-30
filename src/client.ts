export class MaimemoClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl = "https://open.maimemo.com/open/") {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "DELETE";
      query?: Record<string, string | number | boolean | undefined | null>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url.toString(), init);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    if (!text) return {} as T;

    const json = JSON.parse(text) as {
      data?: T;
      errors?: unknown[];
      success?: boolean;
    };
    if (json.errors && json.errors.length > 0) {
      throw new Error(JSON.stringify(json.errors, null, 2));
    }
    if (json.success === false) {
      throw new Error("Request failed (success: false)");
    }
    return (json.data as T) ?? (json as unknown as T);
  }

  async resolveVocId(word?: string, vocId?: string): Promise<string> {
    if (vocId) return vocId;
    if (!word) throw new Error("Either word or voc_id must be provided");
    const res = await this.request<{ voc?: { id: string } }>(
      "/api/v1/vocabulary",
      { query: { spelling: word } },
    );
    if (!res.voc?.id) throw new Error(`Word "${word}" not found`);
    return res.voc.id;
  }

  async resolveVocIds(spellings?: string[], ids?: string[]): Promise<string[]> {
    const resolvedIds = [...(ids ?? [])];
    if (spellings && spellings.length > 0) {
      const res = await this.request<{ voc: { spelling: string; id: string }[] }>(
        "/api/v1/vocabulary/query",
        {
          method: "POST",
          body: { spellings, ids: [] },
        },
      );
      const map = new Map(res.voc.map((v) => [v.spelling, v.id]));
      const missing = spellings.filter((s) => !map.has(s));
      if (missing.length > 0) {
        throw new Error(`Words not found: ${missing.join(", ")}`);
      }
      resolvedIds.push(...spellings.map((s) => map.get(s)!));
    }
    return resolvedIds;
  }
}
