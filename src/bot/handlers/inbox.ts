import { MatrixClient } from 'matrix-bot-sdk';
import { Db } from '../../db/migrate';
import { sendMessage, sendThreadReply } from '../matrixClient';
import { insertInboxItem, markProcessed } from '../../db/queries/inbox';
import { processCapturedMessage, PipelineContext } from '../../ai/pipeline';
import { createProjectRoom } from '../../matrix/rooms';
import { updateProjectRoomId, getProjectByName } from '../../db/queries/projects';
import { loadConfigYaml, env } from '../../config';

// Track pending clarifications: Map<userId, { roomId, originalEventId, context }>
const pendingClarifications = new Map<string, {
  roomId: string;
  originalEventId: string;
  context: PipelineContext;
  capturedBy: string;
}>();

export async function handleInboxMessage(
  client: MatrixClient,
  db: Db,
  roomId: string,
  eventId: string,
  userId: string,
  content: string,
): Promise<void> {
  const username = getUsernameFromId(userId);

  // Check if this is a clarification reply
  const pending = pendingClarifications.get(userId);
  if (pending && pending.roomId === roomId) {
    pendingClarifications.delete(userId);
    await processFinalMessage(
      client, db, roomId, pending.originalEventId,
      content, pending.capturedBy, pending.context,
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

  // Run pipeline
  await processFinalMessage(client, db, roomId, eventId, content, username, undefined);
}

async function processFinalMessage(
  client: MatrixClient,
  db: Db,
  roomId: string,
  eventId: string,
  content: string,
  capturedBy: string,
  clarificationContext?: PipelineContext,
): Promise<void> {
  try {
    const result = await processCapturedMessage(
      content, capturedBy, roomId, db, clarificationContext,
    );

    if (result.needsClarification) {
      // Store pending clarification state
      const cfg = loadConfigYaml();
      const userId = Object.entries(cfg.rooms.inbox)
        .find(([, rid]) => rid === roomId)?.[0];

      if (userId) {
        pendingClarifications.set(`@${userId}:${env.MATRIX_HOMESERVER_URL.replace(/https?:\/\//, '')}`, {
          roomId,
          originalEventId: eventId,
          context: { pendingClarification: { originalMessage: content, classification: {} } },
          capturedBy,
        });
      }

      const questions = result.clarifyingQuestions.join('\n');
      await sendThreadReply(client, roomId, eventId, `🤔 ${questions}`);
      return;
    }

    // If a new project room is needed, create it
    if (result.newProjectRoom && result.projectName) {
      const cfg = loadConfigYaml();
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
