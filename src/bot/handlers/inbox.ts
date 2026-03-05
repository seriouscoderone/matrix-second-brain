import { MatrixClient } from 'matrix-bot-sdk';
import { Db } from '../../db/migrate';
import { sendMessage, sendThreadReply } from '../matrixClient';
import { insertInboxItem, markProcessed } from '../../db/queries/inbox';
import { processCapturedMessage, PipelineContext } from '../../ai/pipeline';
import { createProjectRoom } from '../../matrix/rooms';
import { updateProjectRoomId, getProjectByName } from '../../db/queries/projects';
import { loadConfigYaml, env } from '../../config';

// Track pending clarifications: Map<userId, { roomId, threadEventId, capturedBy }>
const pendingClarifications = new Map<string, {
  roomId: string;
  threadEventId: string;
  capturedBy: string;
}>();

// ─── Thread History ─────────────────────────────────────────────────────────

interface ThreadMessage {
  sender: string;
  body: string;
}

/**
 * Fetch the full thread history for a given root event.
 * Returns messages in chronological order (oldest first).
 */
async function getThreadHistory(
  client: MatrixClient,
  roomId: string,
  threadRootEventId: string,
): Promise<ThreadMessage[]> {
  try {
    // Get the root event first
    const rootEvent = await client.getEvent(roomId, threadRootEventId);
    const rootBody = rootEvent?.content?.body as string | undefined;

    const messages: ThreadMessage[] = [];
    if (rootBody) {
      messages.push({
        sender: rootEvent.sender as string,
        body: rootBody,
      });
    }

    // Fetch all thread replies
    const relations = await client.getRelationsForEvent(
      roomId, threadRootEventId, 'm.thread',
    );

    // Relations come in reverse chronological order — sort by origin_server_ts
    const sorted = (relations.chunk || []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (a.origin_server_ts as number) - (b.origin_server_ts as number),
    );

    for (const evt of sorted) {
      const body = evt?.content?.body as string | undefined;
      if (!body) continue;
      messages.push({
        sender: evt.sender as string,
        body,
      });
    }

    return messages;
  } catch (err) {
    console.warn('Failed to fetch thread history:', err);
    return [];
  }
}

/**
 * Format thread history into a single context string for the LLM.
 */
function formatThreadContext(messages: ThreadMessage[]): string {
  return messages
    .map(m => {
      const label = m.sender === env.MATRIX_BOT_USER_ID ? 'Bot' : getUsernameFromId(m.sender);
      return `${label}: ${m.body}`;
    })
    .join('\n');
}

// ─── Inbox Handler ──────────────────────────────────────────────────────────

export async function handleInboxMessage(
  client: MatrixClient,
  db: Db,
  roomId: string,
  eventId: string,
  userId: string,
  content: string,
): Promise<void> {
  const username = getUsernameFromId(userId);

  // Check if this user has a pending clarification in this room
  const pending = pendingClarifications.get(userId);
  if (pending && pending.roomId === roomId) {
    pendingClarifications.delete(userId);

    // Fetch the full thread history for rich context
    const threadMessages = await getThreadHistory(client, roomId, pending.threadEventId);
    const threadContext = formatThreadContext(threadMessages);

    // Build clarification context with full conversation
    const fullContext: PipelineContext = {
      pendingClarification: {
        originalMessage: threadContext || content,
        classification: {},
      },
    };

    await processFinalMessage(
      client, db, roomId, pending.threadEventId,
      userId, content, pending.capturedBy, fullContext,
    );
    return;
  }

  // Save raw inbox item
  await insertInboxItem(db, {
    rawContent: content,
    captureSource: roomId,
    status: 'new',
    createdBy: username,
    matrixMessageId: eventId,
  });

  // Run pipeline (new message — not a clarification reply)
  await processFinalMessage(client, db, roomId, eventId, userId, content, username, undefined);
}

async function processFinalMessage(
  client: MatrixClient,
  db: Db,
  roomId: string,
  eventId: string,
  userId: string,
  content: string,
  capturedBy: string,
  clarificationContext?: PipelineContext,
): Promise<void> {
  try {
    const cfg = loadConfigYaml();
    const result = await processCapturedMessage(
      content, capturedBy, roomId, db, clarificationContext, cfg.users,
    );

    if (result.needsClarification) {
      // Key by the actual userId from the Matrix event — no reconstruction needed
      pendingClarifications.set(userId, {
        roomId,
        threadEventId: eventId,
        capturedBy,
      });

      const questions = result.clarifyingQuestions.join('\n');
      await sendThreadReply(client, roomId, eventId, `🤔 ${questions}`);
      return;
    }

    // If a new project room is needed, create it
    if (result.newProjectRoom && result.projectName) {
      const members = cfg.users;
      const spaceId = cfg.space.id;

      if (spaceId) {
        try {
          const projectRoomId = await createProjectRoom(result.projectName, members, spaceId, {
            createRoom: (opts: Record<string, unknown>) =>
              (client as unknown as { createRoom(o: unknown): Promise<string> }).createRoom(opts),
            sendStateEvent: (rid: string, type: string, evt: Record<string, unknown>, key?: string) =>
              client.sendStateEvent(rid, type, key ?? '', evt),
            inviteUser: (rid: string, uid: string) => client.inviteUser(rid, uid),
          });

          // Update project room ID in DB
          const project = await getProjectByName(db, result.projectName);
          if (project) {
            await updateProjectRoomId(db, project.id, projectRoomId);
          }
        } catch (err) {
          console.error('Failed to create project room:', err);
        }
      }
    }

    await sendThreadReply(
      client,
      roomId,
      eventId,
      `✅ Saved as **${result.category}**: ${result.title}`,
    );
  } catch (err) {
    console.error('Pipeline error:', err);
    await sendThreadReply(
      client,
      roomId,
      eventId,
      `❌ Error processing message: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function getUsernameFromId(userId: string): string {
  return userId.split(':')[0].replace('@', '');
}
