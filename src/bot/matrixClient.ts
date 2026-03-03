import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  Appservice,
  LogService,
  LogLevel,
  RichConsoleLogger,
  IAppserviceRegistration,
} from 'matrix-bot-sdk';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { env } from '../config';

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.INFO);

let matrixClient: MatrixClient;
let appservice: Appservice | null = null;

export function isAppserviceMode(): boolean {
  return !!env.APPSERVICE_REGISTRATION;
}

/**
 * Create a MatrixClient using the client-server API (polling /sync).
 * Used when APPSERVICE_REGISTRATION is not set.
 */
export function createMatrixClient(): MatrixClient {
  if (!env.MATRIX_BOT_ACCESS_TOKEN) {
    throw new Error('MATRIX_BOT_ACCESS_TOKEN is required in client mode');
  }

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

/**
 * Create an Appservice that listens for events pushed by the homeserver.
 * Returns the bot's MatrixClient (same type as createMatrixClient).
 * The Appservice instance is stored for lifecycle management (begin/stop).
 */
export function createAppserviceClient(): { client: MatrixClient; appservice: Appservice } {
  const regPath = env.APPSERVICE_REGISTRATION!;
  const regData = yaml.load(fs.readFileSync(regPath, 'utf8')) as IAppserviceRegistration;

  const homeserverName = env.MATRIX_HOMESERVER_NAME
    || env.MATRIX_BOT_USER_ID.split(':')[1]; // e.g. "@bot:example.com" → "example.com"

  const storage = new SimpleFsStorageProvider(
    path.join(process.cwd(), 'data', 'appservice.json'),
  );

  appservice = new Appservice({
    port: env.APPSERVICE_PORT,
    bindAddress: env.APPSERVICE_BIND_ADDRESS,
    homeserverName,
    homeserverUrl: env.MATRIX_HOMESERVER_URL,
    storage,
    registration: regData,
  });

  matrixClient = appservice.botClient;
  AutojoinRoomsMixin.setupOnAppservice(appservice);

  return { client: matrixClient, appservice };
}

export function getAppservice(): Appservice | null {
  return appservice;
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
