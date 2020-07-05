import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    useSynced,
    loadScriptFromURLAsync,
    Button,
    useSettingsButton,
    Loader,
    Label,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';

import Settings from './settings';

let googleMapsLoaded;

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

const MAX_DIMENSIONS = 10;
const MAX_ELEMENTS = 25;
const LOADING = 'loading';

async function getDistanceMatrixService(apiKey, shouldUseMockService) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    if (shouldUseMockService) {
        return mockDistanceMatrixService();
    }

    return new google.maps.DistanceMatrixService();
}

async function getDistanceMatrix(getService, allOrigins, allDestinations, locationField, progress) {
    const service = await getService();

    const distanceTable = {};
    allOrigins.forEach(rec => distanceTable[rec.id] = {});

    // work through the table, working in chunks of size X

    const origins = new Set();
    const destinations = new Set();
    const requestPromises = [];

    const getLocation = record => record.getCellValue(locationField);

    const flush = (origins, destinations) => {
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

        requestPromises.push(
            new Promise(resolve => {
                const promise = fetchDistanceMatrix(service, {
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
                                distanceTable[originIds[i]][destinationIds[j]] = element.distance.value;
                            });
                        });
                        console.log('progress Fetched', 'origins', originNames, 'destination', destinationNames);
                        console.log('JSON.stringify(distanceTable)', JSON.stringify(distanceTable));
                        progress(distanceTable);
                    }
                    return [response, status];
                });
                resolve(promise);
            })
        );
    }

    allOrigins.forEach(origin => {
        origins.add(origin); // push origin latLng
        allDestinations.forEach(destination => {
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
                flush(origins, destinations);
                if (isAtEndOfRow) {
                    origins.clear();
                }
                destinations.clear();
            }
        });
    });

    // Final flush
    if (origins.size && destinations.size) {
        flush(origins, destinations);
    }

    console.log('requestPromises', requestPromises);
    return Promise.all(requestPromises).then(responses => {
        console.log('all distance matrix api responses', responses);
        progress(distanceTable, true);
    });
}

const airtableBlocksOriginRe = new RegExp('^https://.+\.airtableblocks\.com$|^https://localhost(:.+)?$');
const isDev = window.location.hostname.startsWith('devblock');

function DistanceMatrixApp() {
    const [isShowingSettings, setIsShowingSettings] = useState(false);

    useSettingsButton(function toggleSettings() {
        setIsShowingSettings(!isShowingSettings);
    });

    if (isShowingSettings) {
        return <Settings onDone={() => void setIsShowingSettings(false)} />;
    }

    return <Main />;
}

function Main() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const apiKey = globalConfig.get('googleMapsApiKey');

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const [distanceTable, setDistanceTable, canSetDistanceTable] = useSynced('distanceTable');
    const [statusTable, setStatusTable] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);

    const allRecords = useRecords(view);
    const records = allRecords && allRecords.filter(rec => rec.getCellValue(locationField));

    const origins = new Set();
    const destinations = new Set();

    if (records && locationField) {
        records.forEach(origin => {
            records.forEach(destination => {
                if (!distanceTable ||
                    !distanceTable[origin.id] ||
                    !distanceTable[origin.id].hasOwnProperty(destination.id)
                ) {
                    origins.add(origin);
                    destinations.add(destination);
                }
            });
        });
    }

    useEffect(() => {
        function handleMessage(event) {
            if (airtableBlocksOriginRe.test(event.origin) &&
                event.data === 'com.gabalafou.airtable-block.distance-matrix/test-id'
            ) {
                console.log('received data request', event.data);
                const response = {
                    request: event.data,
                    tableId,
                    viewId,
                    distanceTable,
                };
                console.log('sending response', response);
                event.source.postMessage(response, event.origin);
            }
        }
        // console.log("distance_matrix window.addEventListener('message', handleMessage);");
        window.addEventListener('message', handleMessage);
        return function stopListening() {
            // console.log("distance_matrix window.removeEventListener('message', handleMessage);");
            window.removeEventListener('message', handleMessage);
        }
    }, [tableId, viewId, distanceTable]);

    console.log('render, distance table', distanceTable);

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    {locationField &&
                        <>
                            {origins.size > 0 && destinations.size > 0 &&
                                <Button
                                    onClick={() => {
                                        const originNames = Array.from(origins).map(({name})=>name);
                                        const destinationNames = Array.from(destinations).map(({name})=>name);
                                        console.log('onClickFetch', { originNames, destinationNames });
                                        const getService = () => getDistanceMatrixService(apiKey, shouldUseMockService);
                                        getDistanceMatrix(getService, origins, destinations, locationField, (result, isDone) => {

                                            const updatedTable = { ...(distanceTable || statusTable || {}) };
                                            console.log('updatingDistanceTable')

                                            // update distance table
                                            const recordIds = records.map(({ id }) => id);
                                            recordIds.forEach(originId => {
                                                if (!updatedTable[originId]) {
                                                    updatedTable[originId] = {};
                                                }
                                                recordIds.forEach(destinationId => {
                                                    const originalValue = updatedTable[originId][destinationId];
                                                    const updatedValue = result[originId] && result[originId][destinationId];
                                                    updatedTable[originId][destinationId] = updatedValue != null ?
                                                        updatedValue :
                                                        originalValue;

                                                });
                                            });

                                            if (isDone) {
                                                console.log('PROGRESS', 'isDone');
                                                setDistanceTable(updatedTable);
                                            } else {
                                                console.log('PROGRESS', 'setStatusTable');
                                                setStatusTable(updatedTable);
                                            }
                                        });
                                    }}
                                    disabled={!apiKey}
                                >
                                    Fetch distances from Google Maps
                                </Button>
                            }
                            {records &&
                                <DistanceTable records={records} distanceTable={distanceTable || statusTable} />
                            }
                            {records && isDev &&
                                <DevTools
                                    onClearAll={() => {
                                        setStatusTable(null);
                                        setDistanceTable(null);
                                    }}
                                    onClearSome={() => {
                                        if (distanceTable) {
                                            const keys = Object.keys(distanceTable);
                                            keys.forEach(originId => {
                                                keys.forEach(destinationId => {
                                                    const value = distanceTable[originId][destinationId];
                                                    const shouldUnsetValue = Math.random() < 0.1;
                                                    if (shouldUnsetValue) {
                                                        delete distanceTable[originId][destinationId];
                                                    }
                                                });
                                            });
                                            setStatusTable(null);
                                            setDistanceTable({ ...distanceTable });
                                        }
                                    }}
                                />
                            }
                        </>
                    }
                </div>
            );
        }
    }
}

function DevTools(props) {
    const { onClearAll, onClearSome } = props;
    const [shouldUseMockService, setShouldUseMockService] = useState(isDev);
    return (
        <>
            <Button onClick={onClearAll}>
                Clear all
            </Button>
            <Button onClick={onClearSome}>
                Clear some
            </Button>
            <input
                id="mock-service-checkbox"
                type="checkbox"
                checked={shouldUseMockService}
                onChange={event => setShouldUseMockService(event.currentTarget.checked)}
            />
            <Label htmlFor="mock-service-checkbox">Use Mock Service</Label>
        </>
    );
}

function DistanceTable({records, distanceTable}) {
    return (
        <table>
            <thead>
                <tr>
                    <th></th>
                    {records.map(origin =>
                        <th key={origin.id}>
                            {origin.name}
                        </th>
                    )}
                </tr>
            </thead>
            <tbody>
                {records.map(origin =>
                    <tr key={origin.id}>
                        <th>{origin.name}</th>
                        {records.map(destination => {
                            let value = distanceTable &&
                                distanceTable[origin.id] &&
                                distanceTable[origin.id][destination.id];
                            const style = {
                                backgroundColor: value == null ? '#ccc' : 'transparent',
                                borderColor: 'white solid 1px',
                            };
                            return (
                                <td key={destination.id} style={style}>
                                    {value === LOADING ? <Loader scale={0.3} /> : value}
                                </td>
                            )
                        })}
                    </tr>
                )}
            </tbody>
        </table>
    );
};

initializeBlock(() => <DistanceMatrixApp />);
