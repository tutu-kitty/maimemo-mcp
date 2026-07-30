import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool definitions are declared once as zod schemas and projected into JSON
 * Schema for `tools/list`. This keeps validation and advertised contracts from
 * drifting apart, which was the main source of silent 400s previously.
 */

const Status = z.enum(["PUBLISHED", "UNPUBLISHED"]);
const StatusWithDeleted = z.enum(["PUBLISHED", "UNPUBLISHED", "DELETED"]);

/** Either a spelling or a raw vocabulary ID identifies a word. */
const wordRef = {
  word: z.string().min(1).optional().describe("Word spelling, e.g. \"apple\". Resolved to a vocabulary ID automatically."),
  voc_id: z.string().min(1).optional().describe("Vocabulary ID. Takes precedence over `word`."),
};

const requireWordRef = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((v) => Boolean((v as { word?: string; voc_id?: string }).word || (v as { voc_id?: string }).voc_id), {
    message: "Provide either `word` or `voc_id`.",
  });

const tagList = z.array(z.string()).max(20).optional().describe("Optional tags.");

export const schemas = {
  get_vocabulary: z.object({
    word: z.string().min(1).describe("Word spelling to look up."),
  }),

  query_vocabularies: z
    .object({
      spellings: z.array(z.string().min(1)).max(1000).optional().describe("Word spellings (max 1000)."),
      ids: z.array(z.string().min(1)).max(1000).optional().describe("Vocabulary IDs (max 1000)."),
    })
    .refine((v) => (v.spellings?.length ?? 0) + (v.ids?.length ?? 0) > 0, {
      message: "Provide at least one entry in `spellings` or `ids`.",
    }),

  list_notes: requireWordRef(z.object({ ...wordRef })),

  create_note: requireWordRef(
    z.object({
      ...wordRef,
      note_type: z.string().min(1).describe("Note type, e.g. \u8c10\u97f3 / \u8bcd\u6839 / \u8054\u60f3."),
      note: z.string().min(1).describe("Mnemonic content."),
    }),
  ),

  update_note: z.object({
    id: z.string().min(1).describe("Note ID."),
    note_type: z.string().min(1).describe("Note type."),
    note: z.string().min(1).describe("Mnemonic content."),
  }),

  delete_note: z.object({ id: z.string().min(1).describe("Note ID.") }),

  list_interpretations: requireWordRef(z.object({ ...wordRef })),

  create_interpretation: requireWordRef(
    z.object({
      ...wordRef,
      interpretation: z.string().min(1).describe("Interpretation text."),
      tags: tagList,
      status: Status.default("PUBLISHED").describe("Publication status."),
    }),
  ),

  update_interpretation: z.object({
    id: z.string().min(1).describe("Interpretation ID."),
    interpretation: z.string().min(1).describe("Interpretation text."),
    tags: tagList,
    status: StatusWithDeleted.default("PUBLISHED").describe("Publication status."),
  }),

  delete_interpretation: z.object({ id: z.string().min(1).describe("Interpretation ID.") }),

  list_phrases: requireWordRef(z.object({ ...wordRef })),

  create_phrase: requireWordRef(
    z.object({
      ...wordRef,
      phrase: z.string().min(1).describe("Example sentence containing the word."),
      interpretation: z.string().min(1).describe("Translation of the example sentence."),
      tags: tagList,
      origin: z.string().optional().describe("Source of the sentence."),
    }),
  ),

  update_phrase: z.object({
    id: z.string().min(1).describe("Phrase ID."),
    phrase: z.string().min(1).describe("Example sentence."),
    interpretation: z.string().min(1).describe("Translation."),
    tags: tagList,
    origin: z.string().optional().describe("Source of the sentence."),
  }),

  delete_phrase: z.object({ id: z.string().min(1).describe("Phrase ID.") }),

  list_notepads: z.object({
    limit: z.number().int().min(1).max(100).default(10).describe("Page size (1-100)."),
    offset: z.number().int().min(0).default(0).describe("Pagination offset."),
    ids: z.array(z.string().min(1)).max(100).optional().describe("Filter to specific notepad IDs."),
  }),

  get_notepad: z.object({ id: z.string().min(1).describe("Notepad ID.") }),

  create_notepad: z.object({
    title: z.string().min(1).describe("Notepad title."),
    content: z
      .string()
      .min(1)
      .describe(
        "Notepad body. Use Maimemo notepad markup: `#DESC` for a description line and `#LIST` followed by one word per line.",
      ),
    brief: z.string().optional().describe("Short description."),
    tags: tagList,
    status: Status.default("PUBLISHED").describe("Publication status."),
  }),

  update_notepad: z.object({
    id: z.string().min(1).describe("Notepad ID."),
    title: z.string().min(1).describe("Notepad title."),
    content: z.string().min(1).describe("Full notepad body (replaces existing content)."),
    brief: z.string().optional().describe("Short description."),
    tags: tagList,
    status: StatusWithDeleted.default("PUBLISHED").describe("Publication status."),
  }),

  delete_notepad: z.object({ id: z.string().min(1).describe("Notepad ID.") }),

  get_study_progress: z.object({}),

  get_today_items: z.object({
    is_finished: z.boolean().optional().describe("Filter by completion state."),
    is_new: z.boolean().optional().describe("Filter to newly learned words."),
    voc_ids: z.array(z.string().min(1)).max(1000).optional().describe("Vocabulary IDs."),
    spellings: z.array(z.string().min(1)).max(1000).optional().describe("Word spellings."),
    limit: z.number().int().min(1).max(1000).default(50).describe("Max items (1-1000)."),
  }),

  query_study_records: z.object({
    next_study_start: z.string().optional().describe("Next-study window start, ISO 8601."),
    next_study_end: z.string().optional().describe("Next-study window end, ISO 8601."),
    voc_ids: z.array(z.string().min(1)).max(1000).optional().describe("Vocabulary IDs."),
    spellings: z.array(z.string().min(1)).max(1000).optional().describe("Word spellings."),
    as_count: z.boolean().default(false).describe("Return only the matching record count."),
    limit: z.number().int().min(1).max(1000).default(50).describe("Max records (1-1000)."),
  }),

  add_words: z
    .object({
      voc_ids: z.array(z.string().min(1)).max(1000).optional().describe("Vocabulary IDs."),
      spellings: z.array(z.string().min(1)).max(1000).optional().describe("Word spellings."),
      advance: z.boolean().default(false).describe("Also advance review for the added words."),
    })
    .refine((v) => (v.voc_ids?.length ?? 0) + (v.spellings?.length ?? 0) > 0, {
      message: "Provide at least one entry in `voc_ids` or `spellings`.",
    }),

  advance_study: z
    .object({
      voc_ids: z.array(z.string().min(1)).max(1000).optional().describe("Vocabulary IDs."),
      spellings: z.array(z.string().min(1)).max(1000).optional().describe("Word spellings."),
    })
    .refine((v) => (v.voc_ids?.length ?? 0) + (v.spellings?.length ?? 0) > 0, {
      message: "Provide at least one entry in `voc_ids` or `spellings`.",
    }),
} as const;

export type ToolName = keyof typeof schemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof schemas)[N]>;

type Meta = {
  title: string;
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
};

const meta: Record<ToolName, Meta> = {
  get_vocabulary: {
    title: "Get vocabulary",
    description:
      "Look up one word in the Maimemo dictionary and return its ID, phonetics, interpretations, and phrases.",
    readOnly: true,
  },
  query_vocabularies: {
    title: "Batch query vocabularies",
    description: "Look up many words at once by spelling or vocabulary ID (up to 1000 per call).",
    readOnly: true,
  },
  list_notes: { title: "List notes", description: "List the mnemonics (\u52a9\u8bb0) saved for a word.", readOnly: true },
  create_note: { title: "Create note", description: "Save a new mnemonic (\u52a9\u8bb0) for a word." },
  update_note: { title: "Update note", description: "Replace the type and content of an existing mnemonic.", idempotent: true },
  delete_note: { title: "Delete note", description: "Permanently delete a mnemonic by ID.", destructive: true, idempotent: true },
  list_interpretations: { title: "List interpretations", description: "List the interpretations (\u91ca\u4e49) saved for a word.", readOnly: true },
  create_interpretation: { title: "Create interpretation", description: "Add a custom interpretation (\u91ca\u4e49) to a word." },
  update_interpretation: { title: "Update interpretation", description: "Replace an existing interpretation by ID.", idempotent: true },
  delete_interpretation: { title: "Delete interpretation", description: "Permanently delete an interpretation by ID.", destructive: true, idempotent: true },
  list_phrases: { title: "List phrases", description: "List the example sentences (\u4f8b\u53e5) saved for a word.", readOnly: true },
  create_phrase: { title: "Create phrase", description: "Add an example sentence (\u4f8b\u53e5) to a word." },
  update_phrase: { title: "Update phrase", description: "Replace an existing example sentence by ID.", idempotent: true },
  delete_phrase: { title: "Delete phrase", description: "Permanently delete an example sentence by ID.", destructive: true, idempotent: true },
  list_notepads: { title: "List notepads", description: "List your cloud notepads (\u4e91\u8bcd\u672c) with pagination.", readOnly: true },
  get_notepad: { title: "Get notepad", description: "Fetch one notepad including its full word list.", readOnly: true },
  create_notepad: { title: "Create notepad", description: "Create a cloud notepad (\u4e91\u8bcd\u672c) from a word list." },
  update_notepad: { title: "Update notepad", description: "Replace a notepad's title, content, tags, and status.", idempotent: true },
  delete_notepad: { title: "Delete notepad", description: "Permanently delete a notepad by ID.", destructive: true, idempotent: true },
  get_study_progress: { title: "Get study progress", description: "Get today's study progress summary.", readOnly: true },
  get_today_items: { title: "Get today's items", description: "List the words scheduled for study today, with optional filters.", readOnly: true },
  query_study_records: { title: "Query study records", description: "Query study records, optionally filtered by next-study date window.", readOnly: true },
  add_words: { title: "Add words to study", description: "Add words to the study plan, optionally advancing their review." },
  advance_study: { title: "Advance study", description: "Bring forward the next review for the given words." },
};

function toJsonSchema(schema: z.ZodTypeAny): Tool["inputSchema"] {
  const generated = zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  delete generated.$schema;
  return { type: "object", ...generated } as Tool["inputSchema"];
}

export const TOOLS: Tool[] = (Object.keys(schemas) as ToolName[]).map((name) => {
  const info = meta[name];
  return {
    name,
    title: info.title,
    description: info.description,
    inputSchema: toJsonSchema(schemas[name]),
    annotations: {
      title: info.title,
      readOnlyHint: info.readOnly ?? false,
      destructiveHint: info.destructive ?? false,
      idempotentHint: info.idempotent ?? false,
      openWorldHint: true,
    },
  };
});

export const TOOL_NAMES = new Set<string>(Object.keys(schemas));
