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

async function createDistanceTable(apiKey, records, locationField) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    const recordsToLatLngs = new Map(
        records.map(record => {
            const geocodeCacheValue = record.getCellValue(locationField);
            const locationData = parseGeocodeCacheValue(geocodeCacheValue);
            const { o: { lat, lng } } = locationData;
            const latLng = new google.maps.LatLng(lat, lng);
            return [record, latLng];
        })
    );

    const distanceTable = {};
    const latLngs = Array.from(recordsToLatLngs.values());

    records.forEach(rec => distanceTable[rec.id] = {});

    // work through the table, working in chunks of size X
    const requestSizeLimit = 23;
    let originIndex = 0;
    let origins = [];
    let destinations = [];
    const requestPromises = [];

    const service = new google.maps.DistanceMatrixService();

    recordsToLatLngs.forEach((...origin) => {
        let destinationIndex = 0;
        origins.push(origin[0]); // push origin latLng
        recordsToLatLngs.forEach((...destination) => {
            if (destinations.length < recordsToLatLngs.size) {
                destinations.push(destination[0]);
            }
            const isAtEndOfRow = destinationIndex === recordsToLatLngs.size - 1;
            const requestSize = origins.length * destinations.length;
            let shouldFlush = false;
            if (isAtEndOfRow) {
                const requestSizeWithAnotherRow = requestSize + recordsToLatLngs.size;
                shouldFlush = requestSizeWithAnotherRow > requestSizeLimit;
            } else {
                shouldFlush = requestSize === requestSizeLimit;
            }

            if (shouldFlush) {
                requestPromises.push(new Promise(resolve => {
                    service.getDistanceMatrix({
                        origins,
                        destinations,
                        travelMode: 'DRIVING',
                    }, ((originIndex, destinationIndex) => (response, status) => {
                        console.log('google maps response', response, status);
                        if (status == 'OK') {
                            const { rows } = response;

                            const distanceTableRowStartIndex = originIndex + 1 - rows.length;
                            rows.forEach((row, i) => {
                                const { elements } = row;
                                const distanceTableRowIndex = distanceTableRowStartIndex + i;
                                console.log({distanceTableRowIndex});
                                const rowRecord = records[distanceTableRowIndex]
                                const distanceTableColumnStartIndex = destinationIndex + 1 - elements.length;
                                elements.forEach((element, j) => {
                                    const distanceTableColumnIndex = distanceTableColumnStartIndex + j;
                                    console.log({distanceTableColumnIndex})
                                    const columnRecord = records[distanceTableColumnIndex];
                                    distanceTable[rowRecord.id][columnRecord.id] = element.distance.value;
                                });
                            })

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
                        resolve([response, status]);
                    })(originIndex, destinationIndex));
                }));

                if (isAtEndOfRow) {
                    origins = [];
                }
                destinations = [];
            }
            destinationIndex++;
        });
        originIndex++;
    });

    return Promise.all(requestPromises).then(responses => {
        console.log('all distance matrix api responses', responses);
        return distanceTable;
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
    const [distanceTable, setDistanceTable] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const records = useRecords(view);

    const recordsById = records && Object.assign({}, ...records.map(record => ({[record.id]: record})));

    const renderDistanceTable = distanceTable => {
        const recordIds = Object.keys(distanceTable);
        return (
            <table>
                <tr>
                    <th></th>
                    {recordIds.map(originRecordId =>
                        <th key={originRecordId}>
                            {recordsById[originRecordId].name}
                        </th>
                    )}
                </tr>
                {recordIds.map((originRecordId) =>
                    <tr key={originRecordId}>
                        <th>{recordsById[originRecordId].name}</th>
                        {recordIds.map((targetRecordId) =>
                            <td key={targetRecordId}>
                                {distanceTable[originRecordId][targetRecordId]}
                            </td>
                        )}
                    </tr>
                )}
            </table>
        );
    };

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
                    {locationField && <>
                        <div>Next, we will need your Google Maps API key.</div>
                        <Input
                            placeholder="Google Maps API Key"
                            value={apiKey}
                            onChange={event => setApiKey(event.currentTarget.value)}
                            disabled={!canSetApiKey}
                        />
                    </>}
                    {apiKey &&
                        <Button
                            onClick={() => {
                                createDistanceTable(apiKey, records, locationField)
                                    .then(distanceTable => {
                                        console.log('distanceTable');
                                        console.log(distanceTable);
                                        return distanceTable;
                                    })
                                    .then(setDistanceTable);
                            }}
                        >
                            Fetch distance matrix from Google Maps
                        </Button>
                    }
                    {distanceTable && renderDistanceTable(distanceTable)}
                </div>
            );
        }
    }
}

initializeBlock(() => <DistanceMatrixApp />);
