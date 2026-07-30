import { MaimemoClient } from "./client.js";

export async function handleToolCall(
  client: MaimemoClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_vocabulary": {
      const word = String(args.word);
      return client.request("/api/v1/vocabulary", { query: { spelling: word } });
    }

    case "query_vocabularies": {
      const spellings = (args.spellings as string[]) ?? [];
      const ids = (args.ids as string[]) ?? [];
      return client.request("/api/v1/vocabulary/query", {
        method: "POST",
        body: { spellings, ids },
      });
    }

    case "list_notes": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/notes", { query: { voc_id: vocId } });
    }

    case "create_note": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/notes", {
        method: "POST",
        body: {
          note: {
            voc_id: vocId,
            note_type: String(args.note_type),
            note: String(args.note),
          },
        },
      });
    }

    case "update_note": {
      return client.request(`/api/v1/notes/${args.id}`, {
        method: "POST",
        body: {
          note: {
            note_type: String(args.note_type),
            note: String(args.note),
          },
        },
      });
    }

    case "delete_note": {
      return client.request(`/api/v1/notes/${args.id}`, { method: "DELETE" });
    }

    case "list_interpretations": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/interpretations", { query: { voc_id: vocId } });
    }

    case "create_interpretation": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/interpretations", {
        method: "POST",
        body: {
          interpretation: {
            voc_id: vocId,
            interpretation: String(args.interpretation),
            tags: (args.tags as string[]) ?? [],
            status: String(args.status),
          },
        },
      });
    }

    case "update_interpretation": {
      return client.request(`/api/v1/interpretations/${args.id}`, {
        method: "POST",
        body: {
          interpretation: {
            interpretation: String(args.interpretation),
            tags: (args.tags as string[]) ?? [],
            status: String(args.status),
          },
        },
      });
    }

    case "delete_interpretation": {
      return client.request(`/api/v1/interpretations/${args.id}`, { method: "DELETE" });
    }

    case "list_phrases": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/phrases", { query: { voc_id: vocId } });
    }

    case "create_phrase": {
      const vocId = await client.resolveVocId(
        args.word as string | undefined,
        args.voc_id as string | undefined,
      );
      return client.request("/api/v1/phrases", {
        method: "POST",
        body: {
          phrase: {
            voc_id: vocId,
            phrase: String(args.phrase),
            interpretation: String(args.interpretation),
            tags: (args.tags as string[]) ?? [],
            origin: (args.origin as string) ?? "",
          },
        },
      });
    }

    case "update_phrase": {
      return client.request(`/api/v1/phrases/${args.id}`, {
        method: "POST",
        body: {
          phrase: {
            phrase: String(args.phrase),
            interpretation: String(args.interpretation),
            tags: (args.tags as string[]) ?? [],
            origin: String(args.origin),
          },
        },
      });
    }

    case "delete_phrase": {
      return client.request(`/api/v1/phrases/${args.id}`, { method: "DELETE" });
    }

    case "list_notepads": {
      const limit = (args.limit as number) ?? 10;
      const offset = (args.offset as number) ?? 0;
      const ids = (args.ids as string[]) ?? [];
      const query: Record<string, string> = {
        limit: String(limit),
        offset: String(offset),
      };
      ids.forEach((id, i) => {
        query[`ids[${i}]`] = id;
      });
      return client.request("/api/v1/notepads", { query });
    }

    case "get_notepad": {
      return client.request(`/api/v1/notepads/${args.id}`, { method: "GET" });
    }

    case "create_notepad": {
      return client.request("/api/v1/notepads", {
        method: "POST",
        body: {
          notepad: {
            status: (args.status as string) ?? "PUBLISHED",
            content: String(args.content),
            title: String(args.title),
            brief: (args.brief as string) ?? "",
            tags: (args.tags as string[]) ?? [],
          },
        },
      });
    }

    case "update_notepad": {
      return client.request(`/api/v1/notepads/${args.id}`, {
        method: "POST",
        body: {
          notepad: {
            status: String(args.status),
            content: String(args.content),
            title: String(args.title),
            brief: (args.brief as string) ?? "",
            tags: (args.tags as string[]) ?? [],
          },
        },
      });
    }

    case "delete_notepad": {
      return client.request(`/api/v1/notepads/${args.id}`, { method: "DELETE" });
    }

    case "get_study_progress": {
      return client.request("/api/v1/study/get_study_progress", {
        method: "POST",
        body: {},
      });
    }

    case "get_today_items": {
      const vocIds = await client.resolveVocIds(
        args.spellings as string[] | undefined,
        args.voc_ids as string[] | undefined,
      );
      const body: Record<string, unknown> = {
        voc_ids: vocIds,
        spellings: [],
        limit: (args.limit as number) ?? 50,
      };
      if (args.is_finished !== undefined) body.is_finished = args.is_finished;
      if (args.is_new !== undefined) body.is_new = args.is_new;
      return client.request("/api/v1/study/get_today_items", {
        method: "POST",
        body,
      });
    }

    case "query_study_records": {
      const vocIds = await client.resolveVocIds(
        args.spellings as string[] | undefined,
        args.voc_ids as string[] | undefined,
      );
      const body: Record<string, unknown> = {
        voc_ids: vocIds,
        spellings: [],
        as_count: (args.as_count as boolean) ?? false,
        limit: (args.limit as number) ?? 50,
      };
      if (args.next_study_start || args.next_study_end) {
        body.next_study_date = {
          start: args.next_study_start,
          end: args.next_study_end,
        };
      }
      return client.request("/api/v1/study/query_study_records", {
        method: "POST",
        body,
      });
    }

    case "add_words": {
      const vocIds = await client.resolveVocIds(
        args.spellings as string[] | undefined,
        args.voc_ids as string[] | undefined,
      );
      return client.request("/api/v1/study/add_words", {
        method: "POST",
        body: {
          words: vocIds.map((id) => ({ id })),
          advance: (args.advance as boolean) ?? false,
        },
      });
    }

    case "advance_study": {
      const vocIds = await client.resolveVocIds(
        args.spellings as string[] | undefined,
        args.voc_ids as string[] | undefined,
      );
      return client.request("/api/v1/study/advance_study", {
        method: "POST",
        body: { voc_ids: vocIds },
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
