import { FieldType } from '@airtable/blocks/models';
import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    Input,
    Label,
    Button,
    colors,
    useSettingsButton,
    FieldPickerSynced,
    Switch,
    SwitchSynced,
    InputSynced,
    Box,
    expandRecord,
    TextButton,
} from '@airtable/blocks/ui';
import React, { useState, useEffect, useMemo } from 'react';

import Settings from './settings';
import {
    createPartitions,
    scorePartition,
    isValidPartition,
} from './partition';


const BATCH_SIZE = 50;
async function batchUpdateRecords(table, updates) {
    if (!table.hasPermissionToUpdateRecords(updates)) {
        console.error('No permission to update');
        return;
    }
    let i = 0;
    while (i < updates.length) {
        const recordBatch = updates.slice(i, i + BATCH_SIZE);
        // awaiting the delete means that next batch won't be deleted until the current
        // batch has been fully deleted, keeping you under the rate limit
        await table.updateRecordsAsync(recordBatch);
        i += BATCH_SIZE;
    }
}

async function addChoicesToSelectField(selectField, choices) {
    const updatedOptions = {
        choices: [
            ...selectField.options.choices,
            ...choices,
        ]
    };
    if (selectField.unstable_hasPermissionToUpdateOptions(updatedOptions)) {
        await selectField.unstable_updateOptionsAsync(updatedOptions);
    }
}

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

const isDev = window.location.hostname.indexOf('devblock') > -1;

function Main() {
    const base = useBase();
    const globalConfig = useGlobalConfig();

    const blockResultCode = globalConfig.get('blockResultCode');

    const [shouldUseMockDistanceTable, setShouldUseMockDistanceTable] = useState(isDev);
    const [tableId, setTableId] = useState(shouldUseMockDistanceTable ? 'tblm9dueBPkf4dvCO' : '');
    const [viewId, setViewId] = useState(shouldUseMockDistanceTable ? 'viw5cGnD9Xggf6hkV' : '');
    let [distanceTable, setDistanceTable] = useState(null);

    const table = base.getTableByIdIfExists(tableId);
    const view = table ? table.getViewByIdIfExists(viewId) : null;
    const groupFieldId = String(globalConfig.get('groupFieldId'));
    const groupField = table && groupFieldId ? table.getFieldByIdIfExists(groupFieldId) : null;

    const numberOfGroups = Number(globalConfig.get('numberOfGroups'));
    const [pageIndex, setPageIndex] = useState(0);

    const records = useRecords(view);

    console.log('render, recordIds', records && records.map(({id}) => id));

    distanceTable = useMemo(() => {
        if (records && shouldUseMockDistanceTable) {
            return createMockDistanceTable(records, records);
        } else {
            return distanceTable;
        }
    }, [records, shouldUseMockDistanceTable])

    const savePartition = async () => {
        const updates = [];
        const colorArray = Object.keys(colors)
            .filter(colorStr => colorStr.includes('_'))
            .sort((a, b) => a.length - b.length);
        console.log(colorArray);

        const choices = [];
        for (let i = 0; i < optimalPartition.length; i++) {
            choices.push({
                name: String(i + 1),
                color: colors[colorArray[i]],
            })
        }
        const unsavedChoices = choices.filter(choice =>
            !groupField.options.choices.some(savedChoice => {
                savedChoice.name === choice.name
            })
        );
        console.log('unsavedChocies', unsavedChoices);
        if (unsavedChoices.length) {
            await addChoicesToSelectField(groupField, unsavedChoices);
        }

        optimalPartition.forEach((group, index) => {
            const groupNumber = index + 1;
            group.forEach(record => {
                updates.push({
                    id: record.id,
                    fields: {
                        [groupField.id]: {name: String(groupNumber)}
                    }
                });
            });
        });
        batchUpdateRecords(table, updates);
    }

    useEffect(() => {
        if (records && numberOfGroups) {
            console.log('testing effect with effect cache [records, numberOfGroups]', [records, numberOfGroups]);
        }
    }, [records, numberOfGroups]);

    useEffect(() => {
        function handleMessage(event) {
            console.log('main block, received message', event.data);
            if (event && event.data && event.data.request === blockResultCode) {
                const message = event.data;
                setTableId(message.tableId);
                setViewId(message.viewId);
                setDistanceTable(message.distanceTable);
            }
        }
        console.log('main block', "window.addEventListener('message', handleMessage);");
        window.addEventListener('message', handleMessage);
        requestDistanceMatrix(blockResultCode);
        return function stopListening() {
            console.log('main block', "window.removeEventListener('message', handleMessage);")
            window.removeEventListener('message', handleMessage);
        };
    }, [blockResultCode, shouldUseMockDistanceTable]);

    const optimalPartition = useMemo(() => {
        console.log('running optimal partition memo function');
        if (distanceTable && numberOfGroups) {
            console.log('finding optimal partition');
            const allPartitions = createPartitions(records, numberOfGroups);
            console.log('allPartitions', allPartitions, 'records.length', records.length, 'numberOfGroups', numberOfGroups);

            const partitionScores = allPartitions.map(partition => scorePartition(distanceTable, partition));
            console.log('partitionScores', partitionScores);

            const minimumScore = partitionScores.reduce((left, right) => {
                return Math.min(left, right);
            }, Infinity);
            const indexMinimum = partitionScores.indexOf(minimumScore);

            console.log('optimal partition', allPartitions[indexMinimum], 'score', minimumScore);
            return allPartitions[indexMinimum];
        }
    }, [distanceTable, numberOfGroups]);

    const nextPage = () => setPageIndex(pageIndex + 1);
    const prevPage = () => setPageIndex(pageIndex - 1);

    // TODO? - logic to disable inputs

    switch (pageIndex) {
        default:
        case 0: {
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
                            <div>Save results</div>
                            <FieldPickerSynced
                                table={table}
                                globalConfigKey="groupFieldId"
                                allowedTypes={[FieldType.SINGLE_SELECT]}
                            />
                            {groupField &&
                                <Button onClick={savePartition}>Save</Button>
                            }
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
    }
}

initializeBlock(() => <DistanceGroupingApp />);


function createMockDistanceTable(origins, destinations) {
    const distanceTable = {};
    origins.forEach(origin => {
        distanceTable[origin.id] = {};
        destinations.forEach(destination => {
            distanceTable[origin.id][destination.id] = Math.random() * 100;
        });
    });
    return distanceTable;
}

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
