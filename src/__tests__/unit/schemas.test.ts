import { ClassificationSchema } from '../../ai/prompts/classify';

describe('ClassificationSchema', () => {
  const validClassification = {
    category: 'task',
    confidence: 0.85,
    needsClarification: false,
    clarifyingQuestions: [],
    owner: 'alice',
    createdBy: 'alice',
    fields: { title: 'Buy groceries', priority: 'medium' },
  };

  it('validates a correct classification with all required fields', () => {
    const result = ClassificationSchema.safeParse(validClassification);
    expect(result.success).toBe(true);
  });

  it('fails when category is missing', () => {
    const { category, ...rest } = validClassification;
    const result = ClassificationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails when confidence is out of range (>1)', () => {
    const result = ClassificationSchema.safeParse({
      ...validClassification,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('fails for invalid category enum value', () => {
    const result = ClassificationSchema.safeParse({
      ...validClassification,
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('accepts fields as any object (Record<string, unknown>)', () => {
    const result = ClassificationSchema.safeParse({
      ...validClassification,
      fields: { arbitrary: 'data', nested: { deep: true }, count: 42 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts needsClarification=true with questions', () => {
    const result = ClassificationSchema.safeParse({
      ...validClassification,
      needsClarification: true,
      clarifyingQuestions: ['What store?', 'When do you need this?'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clarifyingQuestions).toHaveLength(2);
    }
  });

  it('applies default value for clarifyingQuestions (defaults to [])', () => {
    const { clarifyingQuestions, ...rest } = validClassification;
    const result = ClassificationSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clarifyingQuestions).toEqual([]);
    }
  });
});
