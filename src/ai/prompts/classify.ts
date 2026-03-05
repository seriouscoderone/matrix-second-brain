import { z } from 'zod';

export const ClassificationSchema = z.object({
  category: z.enum([
    'task', 'project', 'waiting_for', 'event', 'contact',
    'resource', 'note', 'shopping', 'someday_maybe', 'area',
  ]),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  clarifyingQuestions: z.array(z.string()).default([]),
  owner: z.string(),
  createdBy: z.string(),
  fields: z.record(z.unknown()),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export function buildClassifyPrompt(context: string, users: string[] = []): string {
  const userList = users.length > 0 ? users.join(', ') : 'the household members';
  return `You are an intelligent inbox processor for a GTD (Getting Things Done) second brain system used by a household (${userList}).

Your job is to classify a captured message into exactly ONE of these categories and extract structured fields.

## Categories and Field Extraction

### task
A concrete next action someone needs to do.
Fields: title (string), description (string), priority ("low"|"medium"|"high"), context ("home"|"work"|"errands"|"phone"|"computer"|"waiting"), dueDate (ISO string or null), projectName (string or null)

### project
A multi-step outcome requiring more than one action.
Fields: name (string), description (string), outcome (string - desired end state), nextAction (string - the very next physical action), deadline (ISO string or null)

### waiting_for
Something delegated or expected from someone else.
Fields: title (string), context (string - what are we waiting for and why), contactName (string or null), followUpDate (ISO string - default to 7 days from now if not specified)

### event
A time-bound occurrence: meeting, appointment, dinner, etc.
Fields: title (string), startAt (ISO string), endAt (ISO string or null), location (string or null), attendees (array of name strings)

### contact
Information about a person.
Fields: name (string), relationship (string or null), company (string or null), email (string or null), phone (string or null), notes (string or null)

### resource
A reference to external content: article, book, video, podcast, paper.
Fields: title (string), url (string or null), sourceType ("article"|"book"|"podcast"|"video"|"paper"|"other"), author (string or null), keyTakeaways (string or null)

### note
A standalone thought, idea, or zettelkasten note.
Fields: title (string), content (string), tags (array of strings)

### shopping
An item to buy or acquire.
Fields: item (string), quantity (string), estimatedCost (number or null), whereToBuy (string or null), urgency ("low"|"medium"|"high")

### someday_maybe
A wish, dream, or future possibility — not actionable now.
Fields: title (string), description (string), category (string), reviewDate (ISO string - default to 90 days from now if not specified)

### area
An area of responsibility to maintain ongoing standards.
Fields: name (string), description (string), successCriteria (string or null), reviewFrequency ("weekly"|"monthly"|"quarterly")

## Owner Assignment Rules
- shopping, contact, project: default to "shared" unless the message clearly indicates one person
- If the message says "I need to" or is clearly personal: assign to the person who captured it
- If unclear: default to "shared"

## Current System Context
${context}

## Output Format
Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "category": "<one of the categories above>",
  "confidence": <0.0 to 1.0>,
  "needsClarification": <true if the intent is ambiguous>,
  "clarifyingQuestions": ["<question1>", ...],
  "owner": "<username|shared>",
  "createdBy": "<the capturedBy value provided>",
  "fields": { <extracted fields per category> }
}`;
}

export function buildClassifyUserMessage(content: string, capturedBy: string): string {
  return `Captured by: ${capturedBy}

Message:
${content}`;
}
