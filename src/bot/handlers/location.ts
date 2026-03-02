import { MatrixClient } from 'matrix-bot-sdk';
import { Db } from '../../db/migrate';
import { sendMessage } from '../matrixClient';
import { checkProximityAndAlert } from '../../location/proximity';

export async function handleLocationEvent(
  client: MatrixClient,
  db: Db,
  roomId: string,
  userId: string,
  geoUri: string,
): Promise<void> {
  // Parse geo:lat,lon from geo_uri
  const coords = parseGeoUri(geoUri);
  if (!coords) {
    console.warn(`Invalid geo_uri: ${geoUri}`);
    return;
  }

  const { lat, lon } = coords;
  console.log(`📍 Location event from ${userId}: ${lat}, ${lon}`);

  await checkProximityAndAlert(userId, lat, lon, db, async (message: string) => {
    await sendMessage(client, roomId, message);
  });
}

function parseGeoUri(geoUri: string): { lat: number; lon: number } | null {
  // Format: geo:lat,lon or geo:lat,lon;u=accuracy
  const match = geoUri.match(/^geo:([-\d.]+),([-\d.]+)/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);

  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}
