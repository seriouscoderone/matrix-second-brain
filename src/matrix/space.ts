import { MatrixClientLike } from './rooms';
import { addRoomToSpace } from './rooms';

export async function createSpace(
  name: string,
  client: MatrixClientLike,
): Promise<string> {
  const spaceId = await client.createRoom({
    name,
    topic: `${name} — Second Brain Space`,
    preset: 'private_chat',
    creation_content: { type: 'm.space' },
    power_level_content_override: {
      events: {
        'm.space.child': 50,
        'm.room.name': 50,
        'm.room.topic': 50,
      },
    },
  });

  return spaceId;
}

export { addRoomToSpace };
