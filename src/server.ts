import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { MaimemoClient } from "./client.js";

const TOOLS: Tool[] = [
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
        origin: { type: "string", description: "Source