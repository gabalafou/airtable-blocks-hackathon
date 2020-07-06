import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    useSynced,
    Button,
    useSettingsButton,
    Loader,
    Label,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';

import Settings from './settings';
import {
    getDistanceMatrix,
    getDistanceMatrixService,
    LOADING,
} from './api-helpers';


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

const subscribersToOrigins = new Map();

function Main() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const apiKey = globalConfig.get('googleMapsApiKey');
    const [shouldUseMockService, setShouldUseMockService] = useState(isDev);

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const [distanceTable, setDistanceTable, canSetDistanceTable] = useSynced('distanceTable');
    const [statusTable, setStatusTable] = useState(null);

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
                subscribersToOrigins.set(event.source, event.origin);
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

    useEffect(() => {
        console.log('sending distanceTable to subscribers', Array.from(subscribersToOrigins));
        subscribersToOrigins.forEach((origin, subscriber) => {
            const message = {
                tableId, viewId, distanceTable
            };
            subscriber.postMessage(message, origin)
        });
    }, [tableId, viewId, distanceTable]);

    console.log('render, distance table', distanceTable);

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
                            onChangeShouldUseMockService={value => setShouldUseMockService(value)}
                            shouldUseMockService={shouldUseMockService}
                        />
                    }
                </>
            }
        </div>
    );
}

function DevTools(props) {
    const { onClearAll, onClearSome, shouldUseMockService, onChangeShouldUseMockService } = props;
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
                onChange={event => onChangeShouldUseMockService(event.currentTarget.checked)}
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
                            if (value && value.distance) {
                                value = value.distance.text;
                            }
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
