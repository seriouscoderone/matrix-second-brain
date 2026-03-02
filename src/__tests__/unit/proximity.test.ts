import { haversine, findNearbyPlaces } from '../../location/proximity';

// Mock the DB query modules
jest.mock('../../db/queries/places');
jest.mock('../../db/queries/shopping');
jest.mock('../../config', () => ({
  env: {
    ALERT_RADIUS_METERS: 500,
  },
}));

import { getAllPlaces } from '../../db/queries/places';
import { getPendingItemsForPlace } from '../../db/queries/shopping';

const mockedGetAllPlaces = getAllPlaces as jest.MockedFunction<typeof getAllPlaces>;
const mockedGetPendingItems = getPendingItemsForPlace as jest.MockedFunction<typeof getPendingItemsForPlace>;

// ─── Haversine Tests ──────────────────────────────────────────────────────────

describe('haversine', () => {
  it('returns 0 meters for the same location', () => {
    const d = haversine(37.7749, -122.4194, 37.7749, -122.4194);
    expect(d).toBe(0);
  });

  it('returns ~200m for San Francisco to 200m north', () => {
    // 200m north of SF is approximately +0.0018 degrees latitude
    const sfLat = 37.7749;
    const sfLon = -122.4194;
    const offsetLat = sfLat + 0.0018; // ~200m north
    const d = haversine(sfLat, sfLon, offsetLat, sfLon);
    expect(d).toBeGreaterThan(200 * 0.95);
    expect(d).toBeLessThan(200 * 1.05);
  });

  it('returns ~559km for SF to LA', () => {
    const sfLat = 37.7749;
    const sfLon = -122.4194;
    const laLat = 34.0522;
    const laLon = -118.2437;
    const d = haversine(sfLat, sfLon, laLat, laLon);
    const expectedKm = 559;
    expect(d).toBeGreaterThan(expectedKm * 1000 * 0.95);
    expect(d).toBeLessThan(expectedKm * 1000 * 1.05);
  });

  it('is symmetric: haversine(a,b,c,d) === haversine(c,d,a,b)', () => {
    const d1 = haversine(37.7749, -122.4194, 34.0522, -118.2437);
    const d2 = haversine(34.0522, -118.2437, 37.7749, -122.4194);
    expect(d1).toBeCloseTo(d2, 6);
  });

  it('returns ~111320m for 1 degree of longitude at equator', () => {
    const d = haversine(0, 0, 0, 1);
    expect(d).toBeGreaterThan(111320 * 0.95);
    expect(d).toBeLessThan(111320 * 1.05);
  });
});

// ─── findNearbyPlaces Tests ──────────────────────────────────────────────────

describe('findNearbyPlaces', () => {
  const mockDb = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns alerts when user is within radius and place has pending items', async () => {
    mockedGetAllPlaces.mockResolvedValue([
      {
        id: 'place-1',
        name: 'Whole Foods',
        lat: '37.7749',
        lon: '-122.4194',
        address: '1765 California St',
        tags: null,
        owner: 'shared',
        createdBy: 'test',
        createdAt: new Date(),
      },
    ]);
    mockedGetPendingItems.mockResolvedValue([
      {
        id: 'item-1',
        item: 'Milk',
        quantity: '1',
        estimatedCost: null,
        whereToBuy: 'Whole Foods',
        urgency: 'medium',
        status: 'pending',
        placeId: 'place-1',
        projectId: null,
        owner: 'shared',
        createdBy: 'alice',
        createdAt: new Date(),
        matrixMessageId: null,
      },
    ]);

    // User is at essentially the same location as Whole Foods
    const alerts = await findNearbyPlaces(37.7749, -122.4194, mockDb);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].place.name).toBe('Whole Foods');
    expect(alerts[0].items).toHaveLength(1);
    expect(alerts[0].items[0].item).toBe('Milk');
  });

  it('returns empty array when user is outside radius', async () => {
    mockedGetAllPlaces.mockResolvedValue([
      {
        id: 'place-1',
        name: 'Whole Foods',
        lat: '37.7749',
        lon: '-122.4194',
        address: '1765 California St',
        tags: null,
        owner: 'shared',
        createdBy: 'test',
        createdAt: new Date(),
      },
    ]);

    // User is in LA - far away
    const alerts = await findNearbyPlaces(34.0522, -118.2437, mockDb);
    expect(alerts).toHaveLength(0);
    expect(mockedGetPendingItems).not.toHaveBeenCalled();
  });

  it('does not include place when it has no pending items', async () => {
    mockedGetAllPlaces.mockResolvedValue([
      {
        id: 'place-1',
        name: 'Whole Foods',
        lat: '37.7749',
        lon: '-122.4194',
        address: '1765 California St',
        tags: null,
        owner: 'shared',
        createdBy: 'test',
        createdAt: new Date(),
      },
    ]);
    mockedGetPendingItems.mockResolvedValue([]);

    const alerts = await findNearbyPlaces(37.7749, -122.4194, mockDb);
    expect(alerts).toHaveLength(0);
  });
});
