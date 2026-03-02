import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  LogService,
  LogLevel,
  RichConsoleLogger,
} from 'matrix-bot-sdk';
import * as path from 'path';
import { env } from '../config';

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.INFO);

let matrixClient: MatrixClient;

export function createMatrixClient(): MatrixClient {
  const storage = new SimpleFsStorageProvider(
    path.join(process.cwd(), 'data', 'bot.json'),
  );

  matrixClient = new MatrixClient(
    env.MATRIX_HOMESERVER_URL,
    env.MATRIX_BOT_ACCESS_TOKEN,
    storage,
  );

  AutojoinRoomsMixin.setupOnClient(matrixClient);

  return matrixClient;
}

export function getMatrixClient(): MatrixClient {
  if (!matrixClient) throw new Error('Matrix client not initialized');
  return matrixClient;
}

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  text: string,
): Promise<string> {
  return client.sendMessage(roomId, {
    msgtype: 'm.text',
    body: text,
    format: 'org.matrix.custom.html',
    formatted_body: text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'),
  });
}

export async function sendThreadReply(
  client: MatrixClient,
  roomId: string,
  threadEventId: string,
  text: string,
): Promise<string> {
  return client.sendMessage(roomId, {
    msgtype: 'm.text',
    body: text,
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: threadEventId,
      is_falling_back: true,
      'm.in_reply_to': { event_id: threadEventId },
    },
  });
}
