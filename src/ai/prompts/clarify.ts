import { z } from 'zod';

export const ClarifySchema = z.object({
  needsClarification: z.boolean(),
  questions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type ClarifyResult = z.infer<typeof ClarifySchema>;

export function buildClarifyPrompt(): string {
  return `You are a pre-processor for a GTD second brain inbox. Your job is to decide whether a captured message is clear enough to classify and act on, or whether it needs clarification from the user.

A message needs clarification when:
- It is too vague to determine the category (e.g., "thing about the stuff")
- It references people, projects, or events that are ambiguous
- A date/time is mentioned but unclear (e.g., "next meeting" without specifying which meeting)
- The intent could reasonably fall into multiple very different categories
- Critical information is missing (e.g., an event without any time indication)

A message does NOT need clarification when:
- The category is obvious even if some fields are missing (those can be enriched later)
- It is a simple task, note, or shopping item
- Dates are relative but parseable (e.g., "tomorrow", "next week")

Return ONLY valid JSON (no markdown, no explanation):
{
  "needsClarification": true/false,
  "questions": ["question1", "question2", ...],
  "confidence": 0.0-1.0
}

The confidence score reflects how certain you are about your assessment. If needsClarification is true, list 1-3 specific clarifying questions. If false, questions should be an empty array.`;
}

export function buildClarifyUserMessage(content: string): string {
  return `Evaluate whether this captured message needs clarification before it can be processed:

${content}`;
}
