-- Enums
DO $$ BEGIN
  CREATE TYPE owner AS ENUM ('alice', 'bob', 'shared');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inbox_status AS ENUM ('new', 'processed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_context AS ENUM ('home', 'work', 'errands', 'phone', 'computer', 'waiting');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'on_hold', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE visibility AS ENUM ('shared', 'personal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE urgency AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE shopping_status AS ENUM ('pending', 'purchased');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_frequency AS ENUM ('weekly', 'monthly', 'quarterly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('article', 'book', 'podcast', 'video', 'paper', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables (dependency order)

CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  success_criteria TEXT,
  review_frequency review_frequency DEFAULT 'monthly',
  last_reviewed_at TIMESTAMPTZ,
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status project_status DEFAULT 'active' NOT NULL,
  outcome TEXT,
  next_action TEXT,
  deadline TIMESTAMPTZ,
  matrix_room_id TEXT,
  area_id UUID REFERENCES areas(id),
  visibility visibility DEFAULT 'shared' NOT NULL,
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  relationship TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  last_interaction_at TIMESTAMPTZ,
  follow_up_date TIMESTAMPTZ,
  notes TEXT,
  owner owner DEFAULT 'shared' NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lon DECIMAL(10, 7) NOT NULL,
  address TEXT,
  tags TEXT[],
  owner owner DEFAULT 'shared' NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'pending' NOT NULL,
  priority priority DEFAULT 'medium' NOT NULL,
  context task_context,
  due_date TIMESTAMPTZ,
  project_id UUID REFERENCES projects(id),
  area_id UUID REFERENCES areas(id),
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS waiting_for (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  context TEXT,
  follow_up_date TIMESTAMPTZ,
  contact_id UUID REFERENCES contacts(id),
  project_id UUID REFERENCES projects(id),
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id UUID NOT NULL REFERENCES events(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (event_id, contact_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT,
  source_type source_type DEFAULT 'article' NOT NULL,
  author TEXT,
  key_takeaways TEXT,
  tags TEXT[],
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zettel_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  project_id UUID REFERENCES projects(id),
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS note_links (
  from_note_id UUID NOT NULL REFERENCES notes(id),
  to_note_id UUID NOT NULL REFERENCES notes(id),
  PRIMARY KEY (from_note_id, to_note_id)
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item TEXT NOT NULL,
  quantity TEXT,
  estimated_cost DECIMAL(10, 2),
  where_to_buy TEXT,
  urgency urgency DEFAULT 'medium' NOT NULL,
  status shopping_status DEFAULT 'pending' NOT NULL,
  place_id UUID REFERENCES places(id),
  project_id UUID REFERENCES projects(id),
  owner owner DEFAULT 'shared' NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS someday_maybe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  review_date TIMESTAMPTZ,
  tags TEXT[],
  owner owner NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_content TEXT NOT NULL,
  capture_source TEXT NOT NULL,
  status inbox_status DEFAULT 'new' NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ,
  matrix_message_id TEXT
);

CREATE TABLE IF NOT EXISTS location_cooldowns (
  user_id TEXT NOT NULL,
  place_id UUID NOT NULL REFERENCES places(id),
  last_alerted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, place_id)
);
