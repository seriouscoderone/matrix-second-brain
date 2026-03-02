// Matrix room creation and management
// Uses matrix-bot-sdk types

export interface CreateRoomOptions {
  name: string;
  topic?: string;
  inviteUsers?: string[];
  isPublic?: boolean;
}

export interface MatrixClientLike {
  createRoom(options: Record<string, unknown>): Promise<string>;
  sendStateEvent(roomId: string, type: string, content: Record<string, unknown>, stateKey?: string): Promise<string>;
  inviteUser(roomId: string, userId: string): Promise<void>;
}

export async function createProjectRoom(
  projectName: string,
  members: string[],
  spaceId: string,
  client: MatrixClientLike,
): Promise<string> {
  const alias = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const roomId = await client.createRoom({
    name: `project-${alias}`,
    topic: `Project: ${projectName}`,
    preset: 'private_chat',
    invite: members,
    creation_content: { type: 'm.space.child' },
  });

  // Add room to Space
  await addRoomToSpace(spaceId, roomId, client);

  return roomId;
}

export async function addRoomToSpace(
  spaceId: string,
  roomId: string,
  client: MatrixClientLike,
): Promise<void> {
  // Set m.space.child state event on the space
  await client.sendStateEvent(spaceId, 'm.space.child', {
    via: [], // Will be populated by homeserver
    suggested: false,
  }, roomId);

  // Set m.space.parent state event on the room
  await client.sendStateEvent(roomId, 'm.space.parent', {
    via: [],
    canonical: true,
  }, spaceId);
}

export async function createInboxRoom(
  username: string,
  spaceId: string,
  members: string[],
  client: MatrixClientLike,
): Promise<string> {
  const roomId = await client.createRoom({
    name: `inbox-${username}`,
    topic: `Personal inbox for ${username}`,
    preset: 'private_chat',
    invite: members,
  });

  await addRoomToSpace(spaceId, roomId, client);

  return roomId;
}
