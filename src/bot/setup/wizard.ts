import { MatrixClient } from 'matrix-bot-sdk';
import { sendMessage } from '../matrixClient';
import { createSpace } from '../../matrix/space';
import { createInboxRoom, addRoomToSpace } from '../../matrix/rooms';
import { saveConfigYaml, loadConfigYaml, ConfigYaml } from '../../config';
import { env } from '../../config';

type WizardStep = 'space_name' | 'invite_users' | 'done';

interface WizardState {
  step: WizardStep;
  spaceName?: string;
  invitedUsers?: string[];
}

const wizardStates = new Map<string, WizardState>();

export function isInSetup(userId: string): boolean {
  return wizardStates.has(userId);
}

export async function handleSetupCommand(
  client: MatrixClient,
  roomId: string,
  userId: string,
  force = false,
): Promise<void> {
  // Only the admin can run !setup
  if (userId !== env.ADMIN_MATRIX_ID) {
    await sendMessage(client, roomId, '⛔ Only the admin can run `!setup`.');
    return;
  }

  // Prevent accidental re-setup — existing config means Space already exists
  if (!force) {
    const existing = loadConfigYaml();
    if (existing.space.id) {
      await sendMessage(
        client,
        roomId,
        `⚠️ Already configured — Space "${existing.space.name}" (${existing.space.id}).\nSend \`!setup force\` to reconfigure.`,
      );
      return;
    }
  }

  wizardStates.set(userId, { step: 'space_name' });
  await sendMessage(
    client,
    roomId,
    "Hi! Let's set up your Second Brain.\nWhat should I name your Space?",
  );
}

export async function handleWizardReply(
  client: MatrixClient,
  roomId: string,
  userId: string,
  content: string,
): Promise<void> {
  const state = wizardStates.get(userId);
  if (!state) return;

  if (state.step === 'space_name') {
    state.spaceName = content.trim();
    state.step = 'invite_users';
    wizardStates.set(userId, state);

    await sendMessage(
      client,
      roomId,
      `Great! Who else should have access? Share their Matrix IDs (comma-separated), or type "just me".`,
    );
    return;
  }

  if (state.step === 'invite_users') {
    const raw = content.trim().toLowerCase();
    let invitedUsers: string[] = [userId];

    if (raw !== 'just me') {
      const extraUsers = content
        .split(/[,\s]+/)
        .map(u => u.trim())
        .filter(u => u.startsWith('@'));
      invitedUsers = [userId, ...extraUsers];
    }

    state.invitedUsers = invitedUsers;
    state.step = 'done';
    wizardStates.set(userId, state);

    await sendMessage(client, roomId, '⏳ Setting up your Second Brain Space...');

    try {
      // Create Space
      const matrixClientLike = {
        createRoom: (opts: Record<string, unknown>) => (client as unknown as { createRoom(o: unknown): Promise<string> }).createRoom(opts),
        sendStateEvent: (rid: string, type: string, content: Record<string, unknown>, stateKey?: string) =>
          client.sendStateEvent(rid, type, stateKey ?? '', content),
        inviteUser: (rid: string, uid: string) => client.inviteUser(rid, uid),
      };

      const spaceId = await createSpace(state.spaceName!, matrixClientLike, userId, env.MATRIX_BOT_USER_ID);

      // Invite users to the Space
      for (const matrixId of invitedUsers) {
        await client.inviteUser(matrixId, spaceId);
      }

      // Create digest room and add it to the Space
      const digestRoomId = await (client as unknown as { createRoom(o: unknown): Promise<string> }).createRoom({
        name: 'digest',
        topic: 'Daily and weekly digests',
        preset: 'private_chat',
        invite: invitedUsers,
      });
      await addRoomToSpace(spaceId, digestRoomId, matrixClientLike);

      // Create inbox rooms for each user
      const inboxRooms: Record<string, string> = {};
      for (const matrixId of invitedUsers) {
        const username = matrixId.split(':')[0].replace('@', '');
        const inboxRoomId = await createInboxRoom(username, spaceId, [matrixId], matrixClientLike);
        inboxRooms[username] = inboxRoomId;
      }

      // Save config
      const cfg: ConfigYaml = {
        space: { id: spaceId, name: state.spaceName! },
        rooms: { digest: digestRoomId, inbox: inboxRooms },
        users: invitedUsers,
        cron: {
          daily_digest: '0 8 * * *',
          weekly_review: '0 9 * * 1',
          enrichment: '0 */6 * * *',
        },
      };
      saveConfigYaml(cfg);

      const userList = invitedUsers
        .map(u => {
          const username = u.split(':')[0].replace('@', '');
          return `  • @${username} → #inbox-${username}`;
        })
        .join('\n');

      await sendMessage(
        client,
        roomId,
        `✅ Done! I've created the "${state.spaceName}" Space:\n\n${userList}\n\nDM me anything in your inbox room to get started.`,
      );
    } catch (err) {
      console.error('Setup wizard error:', err);
      await sendMessage(client, roomId, `❌ Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    wizardStates.delete(userId);
    return;
  }
}
