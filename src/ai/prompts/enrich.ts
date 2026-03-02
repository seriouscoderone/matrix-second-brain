export function buildEnrichPrompt(category: string, fields: Record<string, unknown>, context: string): string {
  const categoryGuidance = getEnrichmentGuidance(category);

  return `You are an enrichment agent for a GTD second brain system. Your job is to take partially extracted fields for a "${category}" record and fill in missing or incomplete values intelligently.

## Enrichment Rules
${categoryGuidance}

## General Rules
- Convert relative dates to ISO 8601 strings (e.g., "tomorrow" relative to today's date)
- If a contact name is mentioned, try to match it against known contacts in the context below
- Do not invent information — only infer what is reasonably implied
- Keep existing values unless they are clearly wrong
- For any field you cannot confidently fill, leave it as null

## Current System Context
${context}

## Current Fields
${JSON.stringify(fields, null, 2)}

Return ONLY the enriched fields as valid JSON (no markdown, no explanation). Use the same field names. Do not wrap in any other structure — return the flat fields object directly.`;
}

function getEnrichmentGuidance(category: string): string {
  switch (category) {
    case 'task':
      return `- Infer priority from urgency words (ASAP/urgent = high, when you get a chance = low)
- Assign context based on the nature of the task (phone call = phone, email = computer, grocery = errands, fix something at home = home)
- If a project name is mentioned or implied, set projectName
- Parse relative due dates into ISO strings`;

    case 'project':
      return `- Formulate a clear outcome statement if one is vague
- Suggest a concrete next action if missing
- Parse deadlines into ISO strings`;

    case 'waiting_for':
      return `- Match contactName to known contacts if possible
- Default followUpDate to 7 days from now if not specified
- Clarify the context of what is being waited on`;

    case 'event':
      return `- Parse date/time expressions into ISO strings for startAt and endAt
- If only a start time is given, estimate endAt as 1 hour later
- Match attendee names to known contacts
- Infer location from context if possible`;

    case 'contact':
      return `- Clean up and normalize phone numbers
- Validate email format
- Infer relationship type from context (colleague, friend, vendor, etc.)`;

    case 'resource':
      return `- Detect sourceType from URL patterns or keywords (youtube = video, arxiv = paper, etc.)
- Extract author from common patterns
- Generate initial key takeaways summary if content is provided`;

    case 'note':
      return `- Generate relevant tags from the content
- Clean up and structure the content
- Create a concise title if the provided one is too long or vague`;

    case 'shopping':
      return `- Estimate cost if the item is common and cost is missing
- Suggest where to buy based on the item type
- Infer urgency from context (running out = high, nice to have = low)
- Parse quantity from natural language (e.g., "a couple" = 2, "a few" = 3)`;

    case 'someday_maybe':
      return `- Assign a meaningful category (travel, learning, home improvement, career, health, hobby, etc.)
- Default reviewDate to 90 days from now if not specified
- Expand the description with any implied details`;

    case 'area':
      return `- Suggest success criteria if missing
- Recommend an appropriate review frequency based on the area type
- Flesh out the description`;

    default:
      return '- Fill in any missing fields with reasonable defaults';
  }
}

export function buildEnrichUserMessage(category: string, fields: Record<string, unknown>): string {
  return `Enrich this ${category}:\n${JSON.stringify(fields, null, 2)}`;
}
