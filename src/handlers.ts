import type { MaimemoClient } from "./client.js";
import { MaimemoError } from "./errors.js";
import { getTokenStatus } from "./token-status.js";
import { schemas, type ToolArgs, type ToolName } from "./tools.js";

type Handler<N extends ToolName> = (
  client: MaimemoClient,
  args: ToolArgs<N>,
) => Promise<unknown>;

type HandlerMap = { [N in ToolName]: Handler<N> };

/** Shared helper: turn `{ word } | { voc_id }` into a concrete vocabulary ID. */
const vocIdOf = (client: MaimemoClient, a: { word?: string; voc_id?: string }) =>
  client.resolveVocId(a.word, a.voc_id);

const handlers: HandlerMap = {
  // ---- Vocabulary -------------------------------------------------------
  get_vocabulary: (client, a) =>
    client.request("/api/v1/vocabulary", { query: { spelling: a.word } }),

  query_vocabularies: (client, a) =>
    client.request("/api/v1/vocabulary/query", {
      method: "POST",
      body: { spellings: a.spellings ?? [], ids: a.ids ?? [] },
    }),

  // ---- Notes ------------------------------------------------------------
  list_notes: async (client, a) =>
    client.request("/api/v1/notes", { query: { voc_id: await vocIdOf(client, a) } }),

  create_note: async (client, a) =>
    client.request("/api/v1/notes", {
      method: "POST",
      body: { note: { voc_id: await vocIdOf(client, a), note_type: a.note_type, note: a.note } },
    }),

  update_note: (client, a) =>
    client.request(`/api/v1/notes/${encodeURIComponent(a.id)}`, {
      method: "POST",
      body: { note: { note_type: a.note_type, note: a.note } },
    }),

  delete_note: (client, a) =>
    client.request(`/api/v1/notes/${encodeURIComponent(a.id)}`, { method: "DELETE" }),

  // ---- Interpretations --------------------------------------------------
  list_interpretations: async (client, a) =>
    client.request("/api/v1/interpretations", { query: { voc_id: await vocIdOf(client, a) } }),

  create_interpretation: async (client, a) =>
    client.request("/api/v1/interpretations", {
      method: "POST",
      body: {
        interpretation: {
          voc_id: await vocIdOf(client, a),
          interpretation: a.interpretation,
          tags: a.tags ?? [],
          status: a.status,
        },
      },
    }),

  update_interpretation: (client, a) =>
    client.request(`/api/v1/interpretations/${encodeURIComponent(a.id)}`, {
      method: "POST",
      body: {
        interpretation: {
          interpretation: a.interpretation,
          tags: a.tags ?? [],
          status: a.status,
        },
      },
    }),

  delete_interpretation: (client, a) =>
    client.request(`/api/v1/interpretations/${encodeURIComponent(a.id)}`, { method: "DELETE" }),

  // ---- Phrases ----------------------------------------------------------
  list_phrases: async (client, a) =>
    client.request("/api/v1/phrases", { query: { voc_id: await vocIdOf(client, a) } }),

  create_phrase: async (client, a) =>
    client.request("/api/v1/phrases", {
      method: "POST",
      body: {
        phrase: {
          voc_id: await vocIdOf(client, a),
          phrase: a.phrase,
          interpretation: a.interpretation,
          tags: a.tags ?? [],
          origin: a.origin ?? "",
        },
      },
    }),

  update_phrase: (client, a) =>
    client.request(`/api/v1/phrases/${encodeURIComponent(a.id)}`, {
      method: "POST",
      body: {
        phrase: {
          phrase: a.phrase,
          interpretation: a.interpretation,
          tags: a.tags ?? [],
          origin: a.origin ?? "",
        },
      },
    }),

  delete_phrase: (client, a) =>
    client.request(`/api/v1/phrases/${encodeURIComponent(a.id)}`, { method: "DELETE" }),

  // ---- Notepads ---------------------------------------------------------
  list_notepads: (client, a) => {
    const query: Record<string, string> = {
      limit: String(a.limit),
      offset: String(a.offset),
    };
    (a.ids ?? []).forEach((id, i) => {
      query[`ids[${i}]`] = id;
    });
    return client.request("/api/v1/notepads", { query });
  },

  get_notepad: (client, a) =>
    client.request(`/api/v1/notepads/${encodeURIComponent(a.id)}`),

  create_notepad: (client, a) =>
    client.request("/api/v1/notepads", {
      method: "POST",
      body: {
        notepad: {
          status: a.status,
          content: a.content,
          title: a.title,
          brief: a.brief ?? "",
          tags: a.tags ?? [],
        },
      },
    }),

  update_notepad: (client, a) =>
    client.request(`/api/v1/notepads/${encodeURIComponent(a.id)}`, {
      method: "POST",
      body: {
        notepad: {
          status: a.status,
          content: a.content,
          title: a.title,
          brief: a.brief ?? "",
          tags: a.tags ?? [],
        },
      },
    }),

  delete_notepad: (client, a) =>
    client.request(`/api/v1/notepads/${encodeURIComponent(a.id)}`, { method: "DELETE" }),

  // ---- Study ------------------------------------------------------------
  get_study_progress: (client) =>
    client.request("/api/v1/study/get_study_progress", { method: "POST", body: {} }),

  // These two endpoints accept spellings natively, so we pass them straight
  // through instead of burning an extra vocabulary lookup against the quota.
  get_today_items: (client, a) =>
    client.request("/api/v1/study/get_today_items", {
      method: "POST",
      body: {
        voc_ids: a.voc_ids ?? [],
        spellings: a.spellings ?? [],
        limit: a.limit,
        ...(a.is_finished === undefined ? {} : { is_finished: a.is_finished }),
        ...(a.is_new === undefined ? {} : { is_new: a.is_new }),
      },
    }),

  query_study_records: (client, a) =>
    client.request("/api/v1/study/query_study_records", {
      method: "POST",
      body: {
        voc_ids: a.voc_ids ?? [],
        spellings: a.spellings ?? [],
        as_count: a.as_count,
        limit: a.limit,
        ...(a.next_study_start || a.next_study_end
          ? {
              next_study_date: {
                start: a.next_study_start,
                end: a.next_study_end,
              },
            }
          : {}),
      },
    }),

  add_words: async (client, a) => {
    const vocIds = await client.resolveVocIds(a.spellings ?? [], a.voc_ids ?? []);
    return client.request("/api/v1/study/add_words", {
      method: "POST",
      body: { words: vocIds.map((id) => ({ id })), advance: a.advance },
    });
  },

  advance_study: async (client, a) => {
    const vocIds = await client.resolveVocIds(a.spellings ?? [], a.voc_ids ?? []);
    return client.request("/api/v1/study/advance_study", {
      method: "POST",
      body: { voc_ids: vocIds },
    });
  },

  // ---- Token health ------------------------------------------------------
  // Local addition: MaiMemo has no token-introspection endpoint, so expiry is
  // tracked by probing and recording the first moment the token was seen working.
  get_token_status: (client, a) => getTokenStatus(client, { probe: a.probe }),
};

/**
 * Validates arguments against the tool's schema, then dispatches. Validation
 * errors are surfaced as `invalid_input` so the model can self-correct.
 */
export async function handleToolCall(
  client: MaimemoClient,
  name: string,
  rawArgs: unknown,
): Promise<unknown> {
  if (!(name in schemas)) {
    throw new MaimemoError(`Unknown tool: ${name}`, { code: "invalid_input" });
  }

  const toolName = name as ToolName;
  const parsed = schemas[toolName].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    throw new MaimemoError(
      `Invalid arguments for ${toolName}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
      { code: "invalid_input" },
    );
  }

  const handler = handlers[toolName] as Handler<ToolName>;
  return handler(client, parsed.data as ToolArgs<ToolName>);
}
