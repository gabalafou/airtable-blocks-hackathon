import { FieldType } from '@airtable/blocks/models';
import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    Label,
    Button,
    colors,
    useSettingsButton,
    FieldPickerSynced,
    InputSynced,
    Box,
    expandRecord,
    TextButton,
    FormField,
} from '@airtable/blocks/ui';
import React, { useState, useEffect, useMemo } from 'react';

import Settings from './settings';
import {
    findOptimalPartition
} from './partition';
import {
    batchUpdateRecords,
    addChoicesToSelectField,
    createMockDistanceTable,
} from './helpers';
import isDev from './is-dev';


function DistanceGroupingApp() {
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

    const blockResultCode = globalConfig.get('blockResultCode');
    const numberOfGroups = Number(globalConfig.get('numberOfGroups'));

    const [shouldUseMockDistanceTable, setShouldUseMockDistanceTable] = useState(isDev);
    const [tableId, setTableId] = useState(shouldUseMockDistanceTable ? 'tblm9dueBPkf4dvCO' : '');
    const [viewId, setViewId] = useState(shouldUseMockDistanceTable ? 'viw5cGnD9Xggf6hkV' : '');

    const table = base.getTableByIdIfExists(tableId);
    const view = table ? table.getViewByIdIfExists(viewId) : null;
    const groupFieldId = String(globalConfig.get('groupFieldId'));
    const groupField = table && groupFieldId ? table.getFieldByIdIfExists(groupFieldId) : null;

    const records = useRecords(view);

    isDev && console.log('render, record names', records && records.map(({name}) => name));

    let [distanceTable, setDistanceTable] = useState(null);
    distanceTable = useMemo(() => {
        if (records && shouldUseMockDistanceTable) {
            return createMockDistanceTable(records, records);
        } else {
            return distanceTable;
        }
    }, [records, shouldUseMockDistanceTable])

    useEffect(() => {
        if (shouldUseMockDistanceTable) {
            return;
        } else {
            connectWithDistanceMatrixBlock(blockResultCode, message => {
                setTableId(message.tableId);
                setViewId(message.viewId);
                setDistanceTable(message.distanceTable);
            })
        }
    }, [blockResultCode, shouldUseMockDistanceTable]);

    const optimalPartition = useMemo(() => {
        isDev && console.log('running optimal partition memo function');
        return findOptimalPartition(records, distanceTable, numberOfGroups);
    }, [distanceTable, numberOfGroups]);

    return (
        <div>
            <Box>
                <Label htmlFor="number-of-groups-input">Number of groups</Label>
                <InputSynced
                    id="number-of-groups-input"
                    globalConfigKey="numberOfGroups"
                    type="number"
                    step={1}
                    min={1}
                    max={records ? records.length : ''}
                    width={80}
                    marginLeft={1}
                />
            </Box>
            {optimalPartition &&
                <>
                    <ListSublist list={optimalPartition} />
                    <SaveField
                        table={table}
                        optimalPartition={optimalPartition}
                        groupField={groupField}
                    />
                </>
            }
            {isDev &&
                <div>
                    <input
                        id="mock-distance-matrix-checkbox"
                        type="checkbox"
                        checked={shouldUseMockDistanceTable}
                        onChange={event => setShouldUseMockDistanceTable(event.currentTarget.checked)}
                    />
                    <Label htmlFor="mock-distance-matrix-checkbox">Use mock distance matrix</Label>
                </div>
            }
        </div>
    );
}

initializeBlock(() => <DistanceGroupingApp />);

function ListSublist(props) {
    const { list } = props;
    return (
        <ul>{list.map((sublist, i) =>
            <li key={i}>
                Group {i + 1}:
                <ul style={{listStyle: 'none', paddingLeft: 0}}>{sublist.map(record =>
                    <li key={record.id}>
                        <TextButton
                            aria-label="Expand record"
                            variant="dark"
                            icon="expand"
                            onClick={() => void expandRecord(record)}
                            marginRight={1}
                        />
                        {record.name}
                    </li>)}
                </ul>
            </li>)}
        </ul>
    )
}

function SaveField(props) {
    const { groupField, optimalPartition, table } = props;
    const savePartition = async () => {
        const updates = [];
        const colorArray = Object.keys(colors)
            .filter(colorStr => colorStr.includes('_'))
            .sort((a, b) => a.length - b.length);

        isDev && console.log(colorArray);

        const choices = [];
        for (let i = 0; i < optimalPartition.length; i++) {
            choices.push({
                name: String(i + 1),
                color: colors[colorArray[i]],
            })
        }
        const savedChoices = groupField.options && groupField.options.choices;
        const unsavedChoices = choices.filter(choice =>
            savedChoices && !(savedChoices as any).some(savedChoice => {
                savedChoice.name === choice.name
            })
        );

        isDev && console.log('unsavedChocies', unsavedChoices);

        if (unsavedChoices.length) {
            await addChoicesToSelectField(groupField, unsavedChoices);
        }

        optimalPartition.forEach((group, index) => {
            const groupNumber = index + 1;
            group.forEach(record => {
                updates.push({
                    id: record.id,
                    fields: {
                        [groupField.id]: { name: String(groupNumber) }
                    }
                });
            });
        });
        batchUpdateRecords(table, updates);
    }

    return (
        <>
            <FormField label="Save to single select field in table">
                <FieldPickerSynced
                    table={table}
                    globalConfigKey="groupFieldId"
                    allowedTypes={[FieldType.SINGLE_SELECT]}
                />
            </FormField>
            {
                groupField &&
                <Button onClick={savePartition}>Save</Button>
            }
        </>
    );

}

function connectWithDistanceMatrixBlock(blockResultCode, callback) {
    let intervalId;
    function handleMessage(event) {
        isDev && console.log('main block, received message', event.data);
        if (event && event.data && event.data.request === blockResultCode) {
            if (intervalId) {
                clearInterval(intervalId);
            }
            callback(event.data);
        }
    }

    isDev && console.log('Distance Grouping block', 'setting up message event listener');

    window.addEventListener('message', handleMessage);
    let intervalCount = 1;
    intervalId = setInterval(() => {
        requestDistanceMatrix(blockResultCode);
        if (++intervalCount > 10) {
            clearInterval(intervalId);
        }
    }, 1000);
    return function stopListening() {
        isDev && console.log('Distance Grouping block', "tearing down message event listener");
        window.removeEventListener('message', handleMessage);
    };
}

function requestDistanceMatrix(blockResultCode) {
    for (let i = 0; i < window.parent.frames.length; i++) {
        const frame = window.parent.frames[i];
        if (frame === window) {
            continue;
        }
        console.log('posting message with blockResultCode', blockResultCode);
        frame.postMessage(blockResultCode, '*');
    }
}
