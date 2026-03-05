import { LLMProvider, LLMMessage, LLMResponse } from './interface';

interface MockClassification {
  category: string;
  confidence: number;
  needsClarification: boolean;
  clarifyingQuestions: string[];
  owner: string;
  createdBy: string;
  fields: Record<string, unknown>;
}

const KEYWORD_RULES: Array<{ keywords: RegExp; category: string }> = [
  { keywords: /\b(buy|purchase|get|pick\s*up)\b/i, category: 'shopping' },
  { keywords: /\b(meet|meeting|call|conference|dinner|lunch|at\s+\d|on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i, category: 'event' },
  { keywords: /\b(follow\s*up|waiting\s+for|waiting\s+on|hear\s+back)\b/i, category: 'waiting_for' },
  { keywords: /\b(project|start\s+a\s+project|begin)\b/i, category: 'project' },
  { keywords: /\b(remind\s+me|don'?t\s+forget|task|todo|to-do)\b/i, category: 'task' },
  { keywords: /\b(https?:\/\/|article|book|podcast|video|read|watch|listen)\b/i, category: 'resource' },
  { keywords: /\b(contact|person|met|spoke\s+with)\b/i, category: 'contact' },
  { keywords: /\b(note:|zettel|idea:|thought:)\b/i, category: 'note' },
  { keywords: /\b(someday|maybe|eventually|one\s+day|wish\s+I\s+could)\b/i, category: 'someday_maybe' },
];

function classify(content: string): string {
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.test(content)) {
      return rule.category;
    }
  }
  return 'task';
}

function extractTitle(content: string): string {
  // If content is a classify prompt ("Captured by: ...\n\nMessage:\n<actual>"), extract the actual message
  const msgMatch = content.match(/^Message:\s*\n(.+)/m);
  const text = msgMatch ? msgMatch[1].trim() : content.trim();
  const firstLine = text.split('\n')[0];
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

function buildMockFields(category: string, content: string): Record<string, unknown> {
  const now = new Date();
  const title = extractTitle(content);

  switch (category) {
    case 'task':
      return {
        title,
        description: content,
        priority: 'medium',
        context: 'computer',
        dueDate: null,
        projectName: null,
      };
    case 'project':
      return {
        name: title,
        description: content,
        outcome: 'Successfully completed',
        nextAction: 'Define scope and milestones',
        deadline: null,
      };
    case 'waiting_for':
      return {
        title,
        context: content,
        contactName: null,
        followUpDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    case 'event':
      return {
        title,
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString(),
        location: null,
        attendees: [],
      };
    case 'contact':
      return {
        name: title,
        relationship: null,
        company: null,
        email: null,
        phone: null,
        notes: content,
      };
    case 'resource':
      return {
        title,
        url: null,
        sourceType: 'article',
        author: null,
        keyTakeaways: null,
      };
    case 'note':
      return {
        title,
        content,
        tags: [],
      };
    case 'shopping':
      return {
        item: title,
        quantity: '1',
        estimatedCost: null,
        whereToBuy: null,
        urgency: 'medium',
      };
    case 'someday_maybe':
      return {
        title,
        description: content,
        category: 'general',
        reviewDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };
    case 'area':
      return {
        name: title,
        description: content,
        successCriteria: null,
        reviewFrequency: 'monthly',
      };
    default:
      return { title, description: content };
  }
}

function ownerForCategory(category: string): string {
  if (['shopping', 'contact', 'project'].includes(category)) return 'shared';
  return 'alice';
}

export class MockProvider implements LLMProvider {
  async chat(_systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const content = lastUserMessage?.content ?? '';

    // Detect call type by user message prefix (more reliable than system prompt keywords)

    // Clarification check: user message starts with "Evaluate whether"
    if (content.trimStart().toLowerCase().startsWith('evaluate whether')) {
      const result = {
        needsClarification: false,
        questions: [],
        confidence: 0.9,
      };
      return { content: JSON.stringify(result), model: 'mock' };
    }

    // Enrichment call: user message starts with "Enrich this"
    if (content.trimStart().toLowerCase().startsWith('enrich this')) {
      // For enrichment, extract and return the JSON fields block as-is
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
          return { content: JSON.stringify(parsed), model: 'mock' };
        } catch {
          // fall through to default
        }
      }
      return { content: '{}', model: 'mock' };
    }

    // Default: classification (user message starts with "Captured by:")
    const capturedByMatch = content.match(/^Captured by:\s*(\S+)/);
    const capturedBy = capturedByMatch ? capturedByMatch[1] : 'unknown';
    const category = classify(content);
    const fields = buildMockFields(category, content);
    const classification: MockClassification = {
      category,
      confidence: 0.85,
      needsClarification: false,
      clarifyingQuestions: [],
      owner: ownerForCategory(category),
      createdBy: capturedBy,
      fields,
    };

    return {
      content: JSON.stringify(classification),
      model: 'mock',
    };
  }

  async complete(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', content: userMessage }]);
  }
}
