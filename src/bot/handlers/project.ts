import { MatrixClient } from 'matrix-bot-sdk';
import { Db } from '../../db/migrate';
import { sendMessage, sendThreadReply } from '../matrixClient';
import { getProjectByRoomId } from '../../db/queries/projects';
import { insertTask } from '../../db/queries/tasks';

export async function handleProjectMessage(
  client: MatrixClient,
  db: Db,
  roomId: string,
  eventId: string,
  userId: string,
  content: string,
): Promise<void> {
  const username = userId.split(':')[0].replace('@', '');

  const project = await getProjectByRoomId(db, roomId);
  if (!project) {
    console.warn(`No project found for room ${roomId}`);
    return;
  }

  // Save as a task associated with this project
  const task = await insertTask(db, {
    title: content.substring(0, 200),
    description: content.length > 200 ? content : undefined,
    status: 'pending',
    priority: 'medium',
    projectId: project.id,
    owner: (project.owner === 'shared' ? 'shared' : username === 'alice' ? 'alice' : 'bob') as 'alice' | 'bob' | 'shared',
    createdBy: username,
    matrixMessageId: eventId,
  });

  await sendThreadReply(
    client,
    roomId,
    eventId,
    `✅ Saved task for project **${project.name}**: ${task.title}`,
  );
}
