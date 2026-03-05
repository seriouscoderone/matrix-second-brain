import { Db } from '../db/migrate';
import * as schema from '../db/schema';
import type { NewTask, NewProject, NewWaitingFor, NewEvent, NewContact, NewResource, NewNote, NewShoppingItem, NewSomedayMaybe, NewArea } from '../db/schema';
import { env } from '../config';
import { LLMProvider } from './providers/interface';
import { BedrockProvider } from './providers/bedrock';
import { AnthropicProvider } from './providers/anthropic';
import { MockProvider } from './providers/mock';
import { ClassificationSchema, buildClassifyPrompt, buildClassifyUserMessage } from './prompts/classify';
import { ClarifySchema, buildClarifyPrompt, buildClarifyUserMessage } from './prompts/clarify';
import { buildEnrichPrompt, buildEnrichUserMessage } from './prompts/enrich';
import { loadContext } from './context';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PipelineResult {
  category: string;
  title: string;
  recordId: string;
  needsClarification: boolean;
  clarifyingQuestions: string[];
  owner: string;
  createdBy: string;
  newProjectRoom?: boolean;
  projectName?: string;
}

export interface PipelineContext {
  pendingClarification?: {
    originalMessage: string;
    classification: Record<string, unknown>;
  };
}

// ─── Provider Factory ───────────────────────────────────────────────────────

export function createProvider(): LLMProvider {
  switch (env.LLM_PROVIDER) {
    case 'bedrock':
      return new BedrockProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'mock':
      return new MockProvider();
    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }
}

// ─── JSON Parsing Helper ────────────────────────────────────────────────────

function parseJsonResponse(raw: string): unknown {
  // Strip markdown code fences if the LLM wrapped its response
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

// ─── Zettel ID Generator ────────────────────────────────────────────────────

function generateZettelId(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const h = now.getHours().toString().padStart(2, '0');
  const min = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  return `${y}${m}${d}${h}${min}${s}`;
}

// ─── DB Writers ─────────────────────────────────────────────────────────────

async function writeTask(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.tasks).values({
    title: (fields.title as string) || 'Untitled task',
    description: (fields.description as string) || null,
    priority: validateEnum(['low', 'medium', 'high'], fields.priority as string, 'medium') as 'low' | 'medium' | 'high',
    context: validateEnum(
      ['home', 'work', 'errands', 'phone', 'computer', 'waiting'],
      fields.context as string,
      null,
    ) as 'home' | 'work' | 'errands' | 'phone' | 'computer' | 'waiting' | null,
    dueDate: parseDate(fields.dueDate),
    owner,
    createdBy,
  }).returning({ id: schema.tasks.id, title: schema.tasks.title });
  return record;
}

async function writeProject(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.projects).values({
    name: (fields.name as string) || 'Untitled project',
    description: (fields.description as string) || null,
    outcome: (fields.outcome as string) || null,
    nextAction: (fields.nextAction as string) || null,
    deadline: parseDate(fields.deadline),
    owner,
    createdBy,
  }).returning({ id: schema.projects.id, name: schema.projects.name });
  return { id: record.id, title: record.name };
}

async function writeWaitingFor(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.waitingFor).values({
    title: (fields.title as string) || 'Untitled waiting-for',
    context: (fields.context as string) || null,
    followUpDate: parseDate(fields.followUpDate),
    owner,
    createdBy,
  }).returning({ id: schema.waitingFor.id, title: schema.waitingFor.title });
  return record;
}

async function writeEvent(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const startAt = parseDate(fields.startAt) ?? new Date();
  const [record] = await db.insert(schema.events).values({
    title: (fields.title as string) || 'Untitled event',
    startAt,
    endAt: parseDate(fields.endAt),
    location: (fields.location as string) || null,
    notes: null,
    owner,
    createdBy,
  }).returning({ id: schema.events.id, title: schema.events.title });
  return record;
}

async function writeContact(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.contacts).values({
    name: (fields.name as string) || 'Unknown contact',
    relationship: (fields.relationship as string) || null,
    company: (fields.company as string) || null,
    email: (fields.email as string) || null,
    phone: (fields.phone as string) || null,
    notes: (fields.notes as string) || null,
    owner,
    createdBy,
  }).returning({ id: schema.contacts.id, name: schema.contacts.name });
  return { id: record.id, title: record.name };
}

async function writeResource(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.resources).values({
    title: (fields.title as string) || 'Untitled resource',
    url: (fields.url as string) || null,
    sourceType: validateEnum(
      ['article', 'book', 'podcast', 'video', 'paper', 'other'],
      fields.sourceType as string,
      'article',
    ) as 'article' | 'book' | 'podcast' | 'video' | 'paper' | 'other',
    author: (fields.author as string) || null,
    keyTakeaways: (fields.keyTakeaways as string) || null,
    owner,
    createdBy,
  }).returning({ id: schema.resources.id, title: schema.resources.title });
  return record;
}

async function writeNote(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
  const [record] = await db.insert(schema.notes).values({
    zettelId: generateZettelId(),
    title: (fields.title as string) || 'Untitled note',
    content: (fields.content as string) || '',
    tags: tags.length > 0 ? tags : null,
    owner,
    createdBy,
  }).returning({ id: schema.notes.id, title: schema.notes.title });
  return record;
}

async function writeShopping(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.shoppingItems).values({
    item: (fields.item as string) || 'Unknown item',
    quantity: (fields.quantity as string) || '1',
    estimatedCost: fields.estimatedCost != null ? String(fields.estimatedCost) : null,
    whereToBuy: (fields.whereToBuy as string) || null,
    urgency: validateEnum(['low', 'medium', 'high'], fields.urgency as string, 'medium') as 'low' | 'medium' | 'high',
    owner,
    createdBy,
  }).returning({ id: schema.shoppingItems.id, item: schema.shoppingItems.item });
  return { id: record.id, title: record.item };
}

async function writeSomedayMaybe(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.somedayMaybe).values({
    title: (fields.title as string) || 'Untitled idea',
    description: (fields.description as string) || null,
    category: (fields.category as string) || null,
    reviewDate: parseDate(fields.reviewDate),
    owner,
    createdBy,
  }).returning({ id: schema.somedayMaybe.id, title: schema.somedayMaybe.title });
  return record;
}

async function writeArea(
  db: Db,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  const [record] = await db.insert(schema.areas).values({
    name: (fields.name as string) || 'Untitled area',
    description: (fields.description as string) || null,
    successCriteria: (fields.successCriteria as string) || null,
    reviewFrequency: validateEnum(
      ['weekly', 'monthly', 'quarterly'],
      fields.reviewFrequency as string,
      'monthly',
    ) as 'weekly' | 'monthly' | 'quarterly',
    owner,
    createdBy,
  }).returning({ id: schema.areas.id, name: schema.areas.name });
  return { id: record.id, title: record.name };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function validateEnum<T extends string>(allowed: T[], value: string | null | undefined, fallback: T | null): T | null {
  if (value && allowed.includes(value as T)) return value as T;
  return fallback;
}

// ─── Category Writer Dispatch ───────────────────────────────────────────────

async function writeRecord(
  db: Db,
  category: string,
  fields: Record<string, unknown>,
  owner: string,
  createdBy: string,
): Promise<{ id: string; title: string }> {
  switch (category) {
    case 'task': return writeTask(db, fields, owner, createdBy);
    case 'project': return writeProject(db, fields, owner, createdBy);
    case 'waiting_for': return writeWaitingFor(db, fields, owner, createdBy);
    case 'event': return writeEvent(db, fields, owner, createdBy);
    case 'contact': return writeContact(db, fields, owner, createdBy);
    case 'resource': return writeResource(db, fields, owner, createdBy);
    case 'note': return writeNote(db, fields, owner, createdBy);
    case 'shopping': return writeShopping(db, fields, owner, createdBy);
    case 'someday_maybe': return writeSomedayMaybe(db, fields, owner, createdBy);
    case 'area': return writeArea(db, fields, owner, createdBy);
    default: throw new Error(`Unknown category: ${category}`);
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function processCapturedMessage(
  content: string,
  capturedBy: string,
  matrixRoomId: string,
  db: Db,
  clarificationContext?: PipelineContext,
  users?: string[],
): Promise<PipelineResult> {
  const provider = createProvider();

  // If we have clarification context, include the full conversation thread
  const messageToProcess = clarificationContext?.pendingClarification
    ? `Conversation thread:\n${clarificationContext.pendingClarification.originalMessage}\n\nLatest reply: ${content}`
    : content;

  // Stage 1: Check if clarification is needed (skip if this IS a clarification response)
  if (!clarificationContext?.pendingClarification) {
    try {
      const clarifyResponse = await provider.complete(
        buildClarifyPrompt(),
        buildClarifyUserMessage(messageToProcess),
      );
      const clarifyRaw = parseJsonResponse(clarifyResponse.content);
      const clarifyResult = ClarifySchema.parse(clarifyRaw);

      if (clarifyResult.needsClarification && clarifyResult.confidence > 0.5) {
        return {
          category: 'unknown',
          title: '',
          recordId: '',
          needsClarification: true,
          clarifyingQuestions: clarifyResult.questions,
          owner: 'shared',
          createdBy: capturedBy,
        };
      }
    } catch (err) {
      // If clarification check fails, proceed with classification anyway
      console.warn('Clarification check failed, proceeding:', err);
    }
  }

  // Stage 2: Load DB context for the classifier
  let dbContext: string;
  try {
    dbContext = await loadContext(db);
  } catch {
    dbContext = 'No existing records in the system yet.';
  }

  // Stage 3: Classify + extract fields
  const classifyResponse = await provider.complete(
    buildClassifyPrompt(dbContext, users),
    buildClassifyUserMessage(messageToProcess, capturedBy),
  );

  const classifyRaw = parseJsonResponse(classifyResponse.content);
  const classification = ClassificationSchema.parse(classifyRaw);

  // Stage 4: Enrich fields
  let enrichedFields = classification.fields;
  try {
    const enrichResponse = await provider.complete(
      buildEnrichPrompt(classification.category, classification.fields, dbContext),
      buildEnrichUserMessage(classification.category, classification.fields),
    );
    const enrichedRaw = parseJsonResponse(enrichResponse.content);
    if (typeof enrichedRaw === 'object' && enrichedRaw !== null) {
      enrichedFields = enrichedRaw as Record<string, unknown>;
    }
  } catch (err) {
    // If enrichment fails, use the original fields
    console.warn('Enrichment failed, using original fields:', err);
  }

  // Stage 5: Write to DB
  const { id: recordId, title } = await writeRecord(
    db,
    classification.category,
    enrichedFields,
    classification.owner,
    classification.createdBy || capturedBy,
  );

  // Stage 6: Build result
  const result: PipelineResult = {
    category: classification.category,
    title,
    recordId,
    needsClarification: false,
    clarifyingQuestions: [],
    owner: classification.owner,
    createdBy: classification.createdBy || capturedBy,
  };

  // If this is a new project, flag that a Matrix room should be created
  if (classification.category === 'project') {
    result.newProjectRoom = true;
    result.projectName = (enrichedFields.name as string) || title;
  }

  return result;
}
