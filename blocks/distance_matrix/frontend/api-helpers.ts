import {
  loadScriptFromURLAsync,
} from '@airtable/blocks/ui';


let googleMapsLoaded;

const MAX_DIMENSIONS = 10;
const MAX_ELEMENTS = 25;
export const LOADING = 'loading';

export async function getDistanceMatrixService(apiKey, shouldUseMockService) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    if (shouldUseMockService) {
        return mockDistanceMatrixService();
    }

    return new google.maps.DistanceMatrixService();
}

export async function getDistanceMatrix(getService, allOrigins, allDestinations, locationField, progress) {
    const service = await getService();

    const distanceTable = {};
    allOrigins.forEach(rec => distanceTable[rec.id] = {});

    // work through the table, working in chunks of size X

    const origins = new Set();
    const destinations = new Set();

    const getLocation = record => record.getCellValue(locationField);

    const flush = async (origins, destinations) => {
        origins = new Set(origins);
        destinations = new Set(destinations);
        origins.forEach(origin => destinations.forEach(destination => {
            distanceTable[origin.id][destination.id] = LOADING;
        }));
        const originIds = Array.from(origins).map(({ id }) => id);
        const destinationIds = Array.from(destinations).map(({ id }) => id);

        const originNames = Array.from(origins).map(({ name }) => name);
        const destinationNames = Array.from(destinations).map(({ name }) => name);

        console.log('progress Fetching...', 'origins', originNames, 'destinations', destinationNames);

        progress(distanceTable);

        return fetchDistanceMatrix(service, {
            origins: Array.from(origins).map(getLocation).map(parseLocation),
            destinations: Array.from(destinations).map(getLocation).map(parseLocation),
            travelMode: 'DRIVING',
        }, {
            retry: 2000,
        }).then(([response, status]) => {
            if (status == 'OK') {
                const { rows } = response;
                rows.forEach((row, i) => {
                    const { elements } = row;
                    elements.forEach((element, j) => {
                        distanceTable[originIds[i]][destinationIds[j]] = element;
                    });
                });

                console.log('progress Fetched', 'origins', originNames, 'destination', destinationNames);
                console.log('JSON.stringify(distanceTable)', JSON.stringify(distanceTable));

                progress(distanceTable);
            }
            return [response, status];
        });
    }

    for (const origin of allOrigins) {
        origins.add(origin);
        for (const destination of allDestinations) {
            if (destinations.size < allDestinations.size) {
                destinations.add(destination);
            }
            const isAtEndOfRow = destinations.size === allDestinations.size;
            const isAtEnd = allOrigins.size === origins.size && allDestinations.size === destinations.size;
            const requestSize = origins.size * destinations.size;
            let shouldFlush = false;
            if (isAtEnd) {
                shouldFlush = true;
            } else if (isAtEndOfRow) {
                const requestSizeWithAnotherRow = requestSize + allDestinations.size;
                shouldFlush = requestSizeWithAnotherRow > MAX_ELEMENTS;
            } else {
                shouldFlush = (requestSize + 1) > MAX_ELEMENTS ||
                    (destinations.size + 1) > MAX_DIMENSIONS ||
                    (origins.size + 1) > MAX_DIMENSIONS;
            }
            if (shouldFlush) {
                await flush(origins, destinations);
                if (isAtEndOfRow) {
                    origins.clear();
                }
                destinations.clear();
            }
        }
    }

    // Final flush
    if (origins.size && destinations.size) {
        await flush(origins, destinations);
    }

    console.log('progress Done.', JSON.stringify(distanceTable));

    progress(distanceTable, true);

    return distanceTable;
}


function parseGeocodeCacheValue(cacheValue) {
  return JSON.parse(atob(cacheValue.replace('🔵 ', '')));
}

async function fetchDistanceMatrix(service, params, options) {
  console.log('fetchDistanceMatrix( params =', params, ')');
  let retryCount = 1;
  return (function recurse() {
    return new Promise(resolve => {
      service.getDistanceMatrix(params, (response, status) => {
        console.log('google maps response', response, status, retryCount);
        const { OVER_QUERY_LIMIT } = google.maps.DistanceMatrixStatus;
        if (options.retry && status === OVER_QUERY_LIMIT) {
          setTimeout(() => {
            retryCount++;
            resolve(recurse());
          }, options.retry)
        } else {
          resolve([response, status]);
        }
      });
    });
  })();

}

function mockDistanceMatrixService() {
  return {
    getDistanceMatrix(params, callback) {
      const { origins, destinations } = params;
      const randomDelay = Math.random() * 1500;
      setTimeout(() => {
        const status = Math.random() < 0.7 ? 'OK' : 'OVER_QUERY_LIMIT';
        const response = {
          rows: origins.map(origin => ({
            elements: destinations.map(destination => {
              const distance = Math.floor(Math.sqrt(
                Math.pow(10000 * origin.lat() - 10000 * destination.lat(), 2) +
                Math.pow(10000 * origin.lng() - 10000 * destination.lng(), 2)
              ));
              return {
                distance: {
                  value: distance,
                  text: `${distance} m`
                },
                status: 'OK'
              };
            })
          }))
        };
        callback(response, status);
      }, randomDelay);
    }
  };
}

// will match any two floats separated by a comma
const latLngRe = /(?<lat>\d+(\.\d+)?).*?,.*?(?<lng>\d+(\.\d+)?)/;

function parseLocation(location) {
  if (location.startsWith('🔵 ')) {
    const locationData = parseGeocodeCacheValue(location);
    const { o: { lat, lng } } = locationData;
    return new google.maps.LatLng(lat, lng);
  } else if (latLngRe.test(location)) {
    const matches = latLngRe.exec(location);
    const { lat, lng } = matches.groups;
    return new google.maps.LatLng(lat, lng);
  } else {
    return location;
  }
}