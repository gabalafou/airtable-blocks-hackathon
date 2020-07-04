import {
    FieldPickerSynced,
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    useSynced,
    TablePickerSynced,
    ViewPickerSynced,
    loadScriptFromURLAsync,
    Input,
    Heading,
    Button,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';

let googleMapsLoaded;

function parseGeocodeCacheValue(cacheValue) {
    return JSON.parse(atob(cacheValue.replace('🔵 ', '')));
}

async function fetchDistanceMatrix(service, params, options) {
    return new Promise(resolve => {
        service.getDistanceMatrix(params, (response, status) => {
            console.log('google maps response', response, status, options.retryCount);
            const { OVER_QUERY_LIMIT } = google.maps.DistanceMatrixStatus;
            if (options.retry && status === OVER_QUERY_LIMIT) {
                setTimeout(() => {
                    const retryCount = 1 + (options.retryCount || 0);
                    resolve(fetchDistanceMatrix(service, params, {...options, retryCount}));
                }, options.retry)
            } else {
                resolve([response, status]);
            }
        });
    });
}

function MockDistanceMatrixService() {
    return {
        getDistanceMatrix(params, callback) {
            const { origins, destinations } = params;
            const randomDelay = Math.random() * 1000;
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

const MAX_DIMENSIONS = 25;
const MAX_ELEMENTS = 100;

async function getDistanceMatrix(apiKey, allOrigins, allDestinations, locationField, progress) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    const distanceTable = {};
    allOrigins.forEach(rec => distanceTable[rec.id] = {});

    // work through the table, working in chunks of size X

    const origins = new Set();
    const destinations = new Set();
    const requestPromises = [];

    const service = MockDistanceMatrixService(); // new google.maps.DistanceMatrixService();

    const getLocation = record => record.getCellValue(locationField);

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
                shouldFlush = requestSize === MAX_ELEMENTS ||
                    destinations.size === MAX_DIMENSIONS ||
                    origins.size === MAX_DIMENSIONS;
            }

            if (shouldFlush) {
                origins.forEach(origin => destinations.forEach(destination => {
                    distanceTable[origin.id][destination.id] = 'FETCHING';
                    progress(distanceTable);
                }))
                const originIds = Array.from(origins).map(({ id }) => id);
                const destinationIds = Array.from(destinations).map(({ id }) => id);
                requestPromises.push(
                    fetchDistanceMatrix(service, {
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

                            progress(distanceTable);

                            // latLngs.forEach((loc1, iOuter) => {
                            //     const { elements } = rows[iOuter];
                            //     latLngs.forEach((loc2, iInner) => {
                            //         if (iOuter === iInner) {
                            //             return;
                            //         }
                            //         const distance = elements[iInner].distance.value;

                            //         distanceTable[records[iOuter].id][records[iInner].id] = distance;
                            //     });
                            // });
                        }
                        return [response, status];
                    })
                );

                // requestPromises.push(new Promise(resolve => {
                //     service.getDistanceMatrix({
                //         origins: origins_.map(getLocation).map(parseLocation),
                //         destinations: destinations_.map(getLocation).map(parseLocation),
                //         travelMode: 'DRIVING',
                //     }, ((originIds, destinationIds) => (response, status) => {
                //         console.log('google maps response', response, status);
                //         if (status == 'OK') {
                //             const { rows } = response;
                //             rows.forEach((row, i) => {
                //                 const { elements } = row;
                //                 elements.forEach((element, j) => {
                //                     distanceTable[originIds[i]][destinationIds[j]] = element.distance.value;
                //                 });
                //             });

                //             progress(distanceTable);

                //             // latLngs.forEach((loc1, iOuter) => {
                //             //     const { elements } = rows[iOuter];
                //             //     latLngs.forEach((loc2, iInner) => {
                //             //         if (iOuter === iInner) {
                //             //             return;
                //             //         }
                //             //         const distance = elements[iInner].distance.value;

                //             //         distanceTable[records[iOuter].id][records[iInner].id] = distance;
                //             //     });
                //             // });
                //         }
                //         resolve([response, status]);
                //     })(Array.from(origins).map(({id}) => id), Array.from(destinations).map(({id}) => id)));
                // }));

                if (isAtEndOfRow) {
                    origins.clear();
                }
                destinations.clear();
            }
        });
    });

    console.log('requestPromises', requestPromises);
    return Promise.all(requestPromises).then(responses => {
        console.log('all distance matrix api responses', responses);
        progress(distanceTable, true);
    });
}

const airtableBlocksOriginRe = new RegExp('^https://.+\.airtableblocks\.com$|^https://localhost(:.+)?$');

function DistanceMatrixApp() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const [apiKey, setApiKey, canSetApiKey] = useSynced('googleMapsApiKey') as [string, (string) => void, boolean];
    const [distanceTable, setDistanceTable, canSetDistanceTable] = useSynced('distanceTable');
    const [statusTable, setStatusTable] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);


    console.log('distance table', distanceTable);

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const records = useRecords(view);

    console.log('records', records);

    const origins = new Set();
    const destinations = new Set();

    if (records && locationField) {
        records.forEach(origin => {
            if (!origin.getCellValue(locationField)) {
                return;
            }

            records.forEach(destination => {
                if (!destination.getCellValue(locationField)) {
                    return;
                }

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
                const response = {
                    request: event.data,
                    tableId,
                    viewId,
                    distanceTable,
                };
                event.source.postMessage(response, event.origin);
            }
        }
        console.log("window.addEventListener('message', handleMessage);");
        window.addEventListener('message', handleMessage);
        return function stopListening() {
            console.log("window.removeEventListener('message', handleMessage);");
            window.removeEventListener('message', handleMessage);
        }
    }, [tableId, viewId, distanceTable]);

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    <Heading>Create a table of distances between your locations.</Heading>
                    <div>First, select your locations.</div>
                    <TablePickerSynced globalConfigKey="selectedTableId" />
                    <ViewPickerSynced table={table} globalConfigKey="selectedViewId" />
                    <FieldPickerSynced table={table} globalConfigKey="locationFieldId" />
                    {locationField &&
                        <>
                            <div>Your distance table needs to be filled in or is missing some entries.</div>
                            <div>To fill in the distance table below, we will need your Google Maps API key.</div>
                            <Input
                                placeholder="Google Maps API Key"
                                value={apiKey}
                                onChange={event => setApiKey(event.currentTarget.value)}
                                disabled={!canSetApiKey}
                            />
                            <Button
                                onClick={() => {
                                    console.log({origins, destinations});
                                    getDistanceMatrix(apiKey, origins, destinations, locationField, (distanceTable, isDone) => {
                                        if (isDone) {
                                            setDistanceTable(distanceTable);
                                        } else {
                                            setStatusTable(distanceTable);
                                        }
                                    });
                                }}
                                disabled={!apiKey}
                            >
                                Fetch distances from Google Maps
                            </Button>
                            {records &&
                                <DistanceTable records={records} distanceTable={distanceTable || statusTable} />

                            }
                        </>
                    }
                </div>
            );
        }
    }
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
                                    {value}
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
