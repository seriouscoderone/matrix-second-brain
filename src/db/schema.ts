import {
  boolean,
  decimal,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const ownerEnum = pgEnum('owner', ['alice', 'bob', 'shared']);
export const inboxStatusEnum = pgEnum('inbox_status', ['new', 'processed', 'archived']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'done']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const taskContextEnum = pgEnum('task_context', [
  'home', 'work', 'errands', 'phone', 'computer', 'waiting',
]);
export const projectStatusEnum = pgEnum('project_status', [
  'active', 'on_hold', 'completed', 'archived',
]);
export const visibilityEnum = pgEnum('visibility', ['shared', 'personal']);
export const urgencyEnum = pgEnum('urgency', ['low', 'medium', 'high']);
export const shoppingStatusEnum = pgEnum('shopping_status', ['pending', 'purchased']);
export const reviewFrequencyEnum = pgEnum('review_frequency', [
  'weekly', 'monthly', 'quarterly',
]);
export const sourceTypeEnum = pgEnum('source_type', [
  'article', 'book', 'podcast', 'video', 'paper', 'other',
]);

// ─── Areas ─────────────────────────────────────────────────────────────────

export const areas = pgTable('areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  successCriteria: text('success_criteria'),
  reviewFrequency: reviewFrequencyEnum('review_frequency').default('monthly'),
  lastReviewedAt: timestamp('last_reviewed_at'),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Projects ──────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: projectStatusEnum('status').default('active').notNull(),
  outcome: text('outcome'),
  nextAction: text('next_action'),
  deadline: timestamp('deadline'),
  matrixRoomId: text('matrix_room_id'),
  areaId: uuid('area_id').references(() => areas.id),
  visibility: visibilityEnum('visibility').default('shared').notNull(),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Contacts ──────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  relationship: text('relationship'),
  company: text('company'),
  email: text('email'),
  phone: text('phone'),
  lastInteractionAt: timestamp('last_interaction_at'),
  followUpDate: timestamp('follow_up_date'),
  notes: text('notes'),
  owner: ownerEnum('owner').default('shared').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Places ────────────────────────────────────────────────────────────────

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  lat: decimal('lat', { precision: 10, scale: 7 }).notNull(),
  lon: decimal('lon', { precision: 10, scale: 7 }).notNull(),
  address: text('address'),
  tags: text('tags').array(),
  owner: ownerEnum('owner').default('shared').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Tasks ─────────────────────────────────────────────────────────────────

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('pending').notNull(),
  priority: priorityEnum('priority').default('medium').notNull(),
  context: taskContextEnum('context'),
  dueDate: timestamp('due_date'),
  projectId: uuid('project_id').references(() => projects.id),
  areaId: uuid('area_id').references(() => areas.id),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Waiting For ──────────────────────────────────────────────────────────

export const waitingFor = pgTable('waiting_for', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  context: text('context'),
  followUpDate: timestamp('follow_up_date'),
  contactId: uuid('contact_id').references(() => contacts.id),
  projectId: uuid('project_id').references(() => projects.id),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Events ────────────────────────────────────────────────────────────────

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at'),
  location: text('location'),
  notes: text('notes'),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Event Attendees ──────────────────────────────────────────────────────

export const eventAttendees = pgTable(
  'event_attendees',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.contactId] })],
);

// ─── Resources ────────────────────────────────────────────────────────────

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  url: text('url'),
  sourceType: sourceTypeEnum('source_type').default('article').notNull(),
  author: text('author'),
  keyTakeaways: text('key_takeaways'),
  tags: text('tags').array(),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Notes (Zettelkasten) ─────────────────────────────────────────────────

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  zettelId: text('zettel_id').unique().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').array(),
  projectId: uuid('project_id').references(() => projects.id),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Note Links ──────────────────────────────────────────────────────────

export const noteLinks = pgTable(
  'note_links',
  {
    fromNoteId: uuid('from_note_id')
      .notNull()
      .references(() => notes.id),
    toNoteId: uuid('to_note_id')
      .notNull()
      .references(() => notes.id),
  },
  (t) => [primaryKey({ columns: [t.fromNoteId, t.toNoteId] })],
);

// ─── Shopping Items ──────────────────────────────────────────────────────

export const shoppingItems = pgTable('shopping_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  item: text('item').notNull(),
  quantity: text('quantity'),
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }),
  whereToBuy: text('where_to_buy'),
  urgency: urgencyEnum('urgency').default('medium').notNull(),
  status: shoppingStatusEnum('status').default('pending').notNull(),
  placeId: uuid('place_id').references(() => places.id),
  projectId: uuid('project_id').references(() => projects.id),
  owner: ownerEnum('owner').default('shared').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Someday / Maybe ─────────────────────────────────────────────────────

export const somedayMaybe = pgTable('someday_maybe', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  reviewDate: timestamp('review_date'),
  tags: text('tags').array(),
  owner: ownerEnum('owner').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Inbox Items ─────────────────────────────────────────────────────────

export const inboxItems = pgTable('inbox_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  rawContent: text('raw_content').notNull(),
  captureSource: text('capture_source').notNull(),
  status: inboxStatusEnum('status').default('new').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  matrixMessageId: text('matrix_message_id'),
});

// ─── Location Cooldowns ──────────────────────────────────────────────────

export const locationCooldowns = pgTable(
  'location_cooldowns',
  {
    userId: text('user_id').notNull(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id),
    lastAlertedAt: timestamp('last_alerted_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.placeId] })],
);

// ─── Type exports ─────────────────────────────────────────────────────────

export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type WaitingFor = typeof waitingFor.$inferSelect;
export type NewWaitingFor = typeof waitingFor.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type NewShoppingItem = typeof shoppingItems.$inferInsert;
export type SomedayMaybe = typeof somedayMaybe.$inferSelect;
export type NewSomedayMaybe = typeof somedayMaybe.$inferInsert;
export type InboxItem = typeof inboxItems.$inferSelect;
export type NewInboxItem = typeof inboxItems.$inferInsert;
export type LocationCooldown = typeof locationCooldowns.$inferSelect;
