import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
  {
    name: "get_vocabulary",
    description: "Query a single Maimemo vocabulary by spelling.",
    inputSchema: {
      type: "object",
      properties: { word: { type: "string", description: "Word spelling" } },
      required: ["word"],
    },
  },
  {
    name: "query_vocabularies",
    description: "Batch query vocabularies by spellings or IDs (max 1000).",
    inputSchema: {
      type: "object",
      properties: {
        spellings: { type: "array", items: { type: "string" }, description: "Word spellings" },
        ids: { type: "array", items: { type: "string" }, description: "Vocabulary IDs" },
      },
    },
  },
  {
    name: "list_notes",
    description: "List all notes (mnemonics) for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
      },
    },
  },
  {
    name: "create_note",
    description: "Create a note (mnemonic) for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
        note_type: { type: "string", description: "Note type, e.g. 谐音" },
        note: { type: "string", description: "Note content" },
      },
      required: ["note_type", "note"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note ID" },
        note_type: { type: "string", description: "Note type" },
        note: { type: "string", description: "Note content" },
      },
      required: ["id", "note_type", "note"],
    },
  },
  {
    name: "delete_note",
    description: "Delete a note by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Note ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_interpretations",
    description: "List all interpretations for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
      },
    },
  },
  {
    name: "create_interpretation",
    description: "Create an interpretation for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
        interpretation: { type: "string", description: "Interpretation content" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        status: { type: "string", enum: ["PUBLISHED", "UNPUBLISHED"], description: "Status" },
      },
      required: ["interpretation", "status"],
    },
  },
  {
    name: "update_interpretation",
    description: "Update an existing interpretation by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Interpretation ID" },
        interpretation: { type: "string", description: "Interpretation content" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        status: { type: "string", enum: ["PUBLISHED", "UNPUBLISHED", "DELETED"], description: "Status" },
      },
      required: ["id", "interpretation", "status"],
    },
  },
  {
    name: "delete_interpretation",
    description: "Delete an interpretation by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Interpretation ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_phrases",
    description: "List all example phrases for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
      },
    },
  },
  {
    name: "create_phrase",
    description: "Create an example phrase for a vocabulary.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word spelling" },
        voc_id: { type: "string", description: "Vocabulary ID" },
        phrase: { type: "string", description: "Phrase text" },
        interpretation: { type: "string", description: "Phrase translation" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        origin: { type: "string", description: "Source/origin" },
      },
      required: ["phrase", "interpretation"],
    },
  },
  {
    name: "update_phrase",
    description: "Update an existing phrase by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Phrase ID" },
        phrase: { type: "string", description: "Phrase text" },
        interpretation: { type: "string", description: "Phrase translation" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        origin: { type: "string", description: "Source/origin" },
      },
      required: ["id", "phrase", "interpretation", "origin"],
    },
  },
  {
    name: "delete_phrase",
    description: "Delete a phrase by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Phrase ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_notepads",
    description: "List notepads (wordbooks) with optional pagination and ID filtering.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Page size", default: 10 },
        offset: { type: "number", description: "Offset", default: 0 },
        ids: { type: "array", items: { type: "string" }, description: "Filter by IDs" },
      },
    },
  },
  {
    name: "get_notepad",
    description: "Get a single notepad by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Notepad ID" } },
      required: ["id"],
    },
  },
  {
    name: "create_notepad",
    description: "Create a notepad (wordbook).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title" },
        content: { type: "string", description: "Content" },
        brief: { type: "string", description: "Brief description" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        status: { type: "string", enum: ["PUBLISHED", "UNPUBLISHED"], description: "Status" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_notepad",
    description: "Update a notepad by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Notepad ID" },
        title: { type: "string", description: "Title" },
        content: { type: "string", description: "Content" },
        brief: { type: "string", description: "Brief description" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        status: { type: "string", enum: ["PUBLISHED", "UNPUBLISHED", "DELETED"], description: "Status" },
      },
      required: ["id", "title", "content", "status"],
    },
  },
  {
    name: "delete_notepad",
    description: "Delete a notepad by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Notepad ID" } },
      required: ["id"],
    },
  },
  {
    name: "get_study_progress",
    description: "Get today's study progress.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_today_items",
    description: "Get today's study items.",
    inputSchema: {
      type: "object",
      properties: {
        is_finished: { type: "boolean", description: "Filter finished items" },
        is_new: { type: "boolean", description: "Filter new items" },
        voc_ids: { type: "array", items: { type: "string" }, description: "Vocabulary IDs" },
        spellings: { type: "array", items: { type: "string" }, description: "Word spellings" },
        limit: { type: "number", description: "Max items", default: 50 },
      },
    },
  },
  {
    name: "query_study_records",
    description: "Query study records.",
    inputSchema: {
      type: "object",
      properties: {
        next_study_start: { type: "string", description: "Next study date start (ISO 8601)" },
        next_study_end: { type: "string", description: "Next study date end (ISO 8601)" },
        voc_ids: { type: "array", items: { type: "string" }, description: "Vocabulary IDs" },
        spellings: { type: "array", items: { type: "string" }, description: "Word spellings" },
        as_count: { type: "boolean", description: "Return only count" },
        limit: { type: "number", description: "Max records", default: 50 },
      },
    },
  },
  {
    name: "add_words",
    description: "Add words to today's study plan.",
    inputSchema: {
      type: "object",
      properties: {
        voc_ids: { type: "array", items: { type: "string" }, description: "Vocabulary IDs" },
        spellings: { type: "array", items: { type: "string" }, description: "Word spellings" },
        advance: { type: "boolean", description: "Also advance review" },
      },
    },
  },
  {
    name: "advance_study",
    description: "Advance review for specified words.",
    inputSchema: {
      type: "object",
      properties: {
        voc_ids: { type: "array", items: { type: "string" }, description: "Vocabulary IDs" },
        spellings: { type: "array", items: { type: "string" }, description: "Word spellings" },
      },
    },
  },
];
