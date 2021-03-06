import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    useSynced,
    Button,
    useSettingsButton,
    TextButton,
    Loader,
    Label,
    Box,
    Input,
    FormField,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

import Settings from './settings';
import {
    getDistanceMatrix,
    getDistanceMatrixService,
    LOADING,
} from './api-helpers';
import isDev from './is-dev';


function DistanceMatrixApp() {
    const [isShowingSettings, setIsShowingSettings] = useState(false);

    useSettingsButton(function toggleSettings() {
        setIsShowingSettings(!isShowingSettings);
    });

    if (isShowingSettings) {
        return <Settings onDone={() => void setIsShowingSettings(false)} />;
    }

    return <Main showSettings={() => void setIsShowingSettings(true)} />;
}


function Main(props) {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const apiKey = globalConfig.get('googleMapsApiKey');
    const [shouldUseMockService, setShouldUseMockService] = useState(isDev);

    const resultCode: string = globalConfig.get('resultCode') as string;
    if (!resultCode) {
        globalConfig.setAsync('resultCode', generateResultCode());
    }

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const [storedDistanceTable, setStoredDistanceTable, canSetStoredDistanceTable] = useSynced('distanceTable');
    const [statusTable, setStatusTable] = useState(null);

    const allRecords = useRecords(view, {
        fields: [locationField]
    });
    const records = allRecords && allRecords.filter(rec => rec.getCellValueAsString(locationField));
    const distanceTable = currentDistanceTable(records, storedDistanceTable);

    const [origins, destinations] = findMissingDistances(records, distanceTable);
    const hasMissingDistances = origins.size > 0 && destinations.size > 0;

    useEffect(() => {
        provideTableForOtherBlocks({ resultCode, tableId, viewId, distanceTable: storedDistanceTable });
    }, [tableId, viewId, storedDistanceTable]);

    isDev && console.log('render', statusTable ? 'statusTable' : 'distanceTable', statusTable || distanceTable);

    if (!locationField) {
        return (
            <GoToSettings showSettings={props.showSettings}>
                Go to settings to select locations.
            </GoToSettings>
        );
    }

    if (records.length > 16) {
        return (
            <GoToSettings showSettings={props.showSettings}>
                Too many records. Go to settings to select a smaller set of locations.
            </GoToSettings>
        );
    }

    return (
        <Box margin={2}>
            {hasMissingDistances ?
                (apiKey ?
                    <FormField label="Your table is missing data.">
                        <Button
                            onClick={() => {
                                const names = records => Array.from(records).map(({name}) => name);
                                isDev && console.log('onClickFetch', { originNames: names(origins), destinationNames: names(destinations) });
                                const getService = () => getDistanceMatrixService(apiKey, shouldUseMockService);
                                getDistanceMatrix(getService, origins, destinations, locationField, (result, isDone) => {
                                    const updatedTable = updateDistanceTable(distanceTable, result);
                                    if (isDone) {
                                        isDev && console.log('PROGRESS', 'isDone');
                                        setStatusTable(null);
                                        setStoredDistanceTable(updatedTable);
                                    } else {
                                        isDev && console.log('PROGRESS', 'setStatusTable');
                                        setStatusTable(updatedTable);
                                    }
                                });
                            }}
                            disabled={!apiKey}
                        >
                            Fetch missing data from Google
                        </Button>
                    </FormField>
                    :
                    <GoToSettings showSettings={props.showSettings}>
                        Go to settings to enter Google Distance Matrix API Key.
                    </GoToSettings>
                ) :
                <FormField
                    label="Result code (paste into blocks that accept it)"
                >
                    <Input value={resultCode}></Input>
                </FormField>
            }
            {records &&
                <DistanceTable records={records} distanceTable={statusTable || distanceTable} />
            }
            {records && isDev &&
                <DevTools
                    onClearAll={() => {
                        setStoredDistanceTable(null);
                    }}
                    onClearSome={() => {
                        if (distanceTable) {
                            const keys = Object.keys(distanceTable);
                            keys.forEach(originId => {
                                keys.forEach(destinationId => {
                                    const shouldUnsetValue = Math.random() < 0.1;
                                    if (shouldUnsetValue) {
                                        delete distanceTable[originId][destinationId];
                                    }
                                });
                            });
                            setStoredDistanceTable({ ...distanceTable });
                        }
                    }}
                    onChangeShouldUseMockService={value => setShouldUseMockService(value)}
                    shouldUseMockService={shouldUseMockService}
                />
            }
        </Box>
    );
}

function currentDistanceTable(records, storedDistanceTable) {
    const distanceTable = {};

    if (records) {
        const recordIds = records.map(({ id }) => id);
        recordIds.forEach(originId => {
            distanceTable[originId] = {};
            recordIds.forEach(destinationId => {
                const storedValue = storedDistanceTable && storedDistanceTable[originId] &&
                    storedDistanceTable[originId][destinationId];
                distanceTable[originId][destinationId] = storedValue;
            });
        });
    }

    return distanceTable;
}

function findMissingDistances(records, distanceTable) {
    const origins = new Set();
    const destinations = new Set();

    if (records) {
        records.forEach(origin => {
            records.forEach(destination => {
                if (!distanceTable ||
                    !distanceTable[origin.id] ||
                    !distanceTable[origin.id][destination.id]
                ) {
                    origins.add(origin);
                    destinations.add(destination);
                }
            });
        });
    }

    return [origins, destinations];
}

function updateDistanceTable(distanceTable, result) {
    isDev && console.log('updatingDistanceTable')

    const table = {};

    Object.keys(distanceTable).forEach(originId => {
        table[originId] = {};
        Object.keys(distanceTable[originId]).forEach(destinationId => {
            const originalValue = distanceTable[originId][destinationId];
            const updatedValue = result[originId] && result[originId][destinationId];
            table[originId][destinationId] = updatedValue != null ?
                updatedValue :
                originalValue;
        });
    })

    return table;
}

// function updateDistanceTable(records, distanceTable, result) {
//     isDev && console.log('updatingDistanceTable')

//     // update distance table
//     const recordIds = records.map(({ id }) => id);
//     recordIds.forEach(originId => {
//         if (!updatedTable[originId]) {
//             updatedTable[originId] = {};
//         }
//         recordIds.forEach(destinationId => {
//             const originalValue = updatedTable[originId][destinationId];
//             const updatedValue = result[originId] && result[originId][destinationId];
//             updatedTable[originId][destinationId] = updatedValue != null ?
//                 updatedValue :
//                 originalValue;

//         });
//     });
// }

const airtableBlocksOriginRe = new RegExp('^https://.+\.airtableblocks\.com$|^https://localhost(:.+)?$');
const subscribersToOrigins = new Map();
function provideTableForOtherBlocks(data) {
    isDev && console.log('sending distanceTable to subscribers', Array.from(subscribersToOrigins));
    subscribersToOrigins.forEach((origin, subscriber) => {
        const message = data;
        subscriber.postMessage(message, origin)
    });

    function handleMessage(event) {
        if (airtableBlocksOriginRe.test(event.origin) &&
            event.data === data.resultCode
        ) {
            isDev && console.log('received data request', event.data);
            const response = {
                request: event.data,
                ...data,
            };
            isDev && console.log('sending response', response);
            subscribersToOrigins.set(event.source, event.origin);
            event.source.postMessage(response, event.origin);
        }
    }
    // isDev && console.log("distance_matrix window.addEventListener('message', handleMessage);");
    window.addEventListener('message', handleMessage);
    return function stopListening() {
        // isDev && console.log("distance_matrix window.removeEventListener('message', handleMessage);");
        window.removeEventListener('message', handleMessage);
    }
}

function generateResultCode() {
    const instanceId = uuidv4();
    return `com.gabalafou.airtable-block-distance-matrix/${instanceId}/distanceTable`;
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

function GoToSettings(props) {
    return (
        <>
            <div>{props.children}</div>
            <TextButton aria-label="Go to settings" onClick={() => props.showSettings()}>Settings</TextButton>
        </>
    );
}

initializeBlock(() => <DistanceMatrixApp />);
