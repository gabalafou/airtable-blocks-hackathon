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
import React, { useState } from 'react';

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
    const requestSizeLimit = 30;
    let originIndex = 0;
    let origins = [];
    let destinations = [];
    const requestPromises = [];

    const service = new google.maps.DistanceMatrixService();

    recordsToLatLngs.forEach((...origin) => {
        let destinationIndex = 0;
        origins.push(origins[0]); // push origin latLng
        recordsToLatLngs.forEach((...destination) => {
            destinations.push(destination[0]);
            const isAtEnd = destinationIndex === recordsToLatLngs.size - 1;
            const requestSize = origins.length * destinations.length;
            const sizeIncreaseOfAddingAnotherOrigin = destinations.length;
            const shouldFlush =
                (isAtEnd && (requestSize + sizeIncreaseOfAddingAnotherOrigin) > requestSizeLimit) ||
                requestSize === requestSizeLimit;

            if (shouldFlush) {
                requestPromises.push(new Promise(resolve => {
                    service.getDistanceMatrix({
                        origins,
                        destinations,
                        travelMode: 'DRIVING',
                    }, (response, status) => {
                        console.log('google maps response', response, status);
                        if (status == 'OK') {
                            const { rows } = response;

                            rows.forEach((row, i) => {
                                const { elements } = row;
                                const distanceTableRowIndex = originIndex - i;
                                elements.forEach((element, j) => {
                                    const distanceTableColumnIndex = destinationIndex - j;
                                    distanceTable[distanceTableRowIndex][distanceTableColumnIndex] =
                                        element.distance.value;
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
                    });
                }));

                origins = [];
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
                                    .then(setDistanceTable);
                            }}
                        >
                            Fetch distance matrix from Google Maps
                        </Button>
                    }
                    {distanceTable &&
                        <table>
                            <tr>
                                <th></th>
                                {Object.keys(distanceTable).map(originRecordId =>
                                    <th key={originRecordId}>
                                        {recordsById[originRecordId].name}
                                    </th>
                                )}
                            </tr>
                            {Object.keys(distanceTable).map((originRecordId, outerIndex, keys) =>
                                <tr key={originRecordId}>
                                    <th>{recordsById[originRecordId].name}</th>
                                    {Object.keys(distanceTable[originRecordId]).map((targetRecordId, innerIndex) =>
                                        <>
                                            {outerIndex === innerIndex &&
                                                <td key={originRecordId}>1</td>
                                            }
                                            <td key={targetRecordId}>
                                                {distanceTable[originRecordId][targetRecordId]}
                                            </td>
                                        </>
                                    )}
                                    {outerIndex === keys.length &&
                                        <td key={originRecordId}>1</td>
                                    }
                                </tr>
                            )}
                        </table>
                    }
                </div>
            );
        }
    }
}

initializeBlock(() => <DistanceMatrixApp />);
