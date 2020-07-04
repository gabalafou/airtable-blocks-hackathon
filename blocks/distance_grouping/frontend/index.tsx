import { FieldType } from '@airtable/blocks/models';
import {
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    Input,
    Label,
    Button,
    FieldPicker,
    colors,
    useSettingsButton,
} from '@airtable/blocks/ui';
import React, { useState, useEffect, useMemo } from 'react';

import Settings from './settings';


const BATCH_SIZE = 50;
async function batchUpdateRecords(table, updates) {
    if (table.hasPermissionToUpdateRecords(updates)) {
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

function Main() {
    const base = useBase();
    const globalConfig = useGlobalConfig();

    const blockResultCode = globalConfig.get('blockResultCode');

    const [shouldUseMockDistanceTable, setShouldUseMockDistanceTable] = useState(true);
    const [tableId, setTableId] = useState(shouldUseMockDistanceTable ? 'tblm9dueBPkf4dvCO' : '');
    const [viewId, setViewId] = useState(shouldUseMockDistanceTable ? 'viw5cGnD9Xggf6hkV' : '');
    let [distanceTable, setDistanceTable] = useState(null);

    const table = base.getTableByIdIfExists(tableId);
    const view = table ? table.getViewByIdIfExists(viewId) : null;
    const [groupField, setGroupField] = useState(null);

    const [groupSize, setGroupSize] = useState(1);
    const [shouldEqualizeGroups, setShouldEqualizeGroups] = useState(true);
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
        if (records && groupSize) {
            console.log('testing effect with effect cache [records, groupSize]', [records, groupSize]);
        }
    }, [records, groupSize]);

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
        if (distanceTable && groupSize) {
            console.log('finding optimal partition');
            const allPartitions = createPartitions(records, groupSize);
            const validPartitions = shouldEqualizeGroups ?
                allPartitions.filter(isValidPartition) :
                allPartitions;
            const partitionScores = validPartitions.map(partition => scorePartition(distanceTable, partition));
            const minimumScore = Math.min(...partitionScores);
            const indexMinimum = partitionScores.indexOf(minimumScore);

            return allPartitions[indexMinimum];
        }
    }, [distanceTable, groupSize]);

    const nextPage = () => setPageIndex(pageIndex + 1);
    const prevPage = () => setPageIndex(pageIndex - 1);

    // TODO? - logic to disable inputs

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    <div>
                        <input
                            id="mock-distance-matrix-checkbox"
                            type="checkbox"
                            checked={shouldUseMockDistanceTable}
                            onChange={event => setShouldUseMockDistanceTable(event.currentTarget.checked)}
                        />
                        <Label htmlFor="mock-distance-matrix-checkbox">Use mock distance matrix</Label>
                    </div>
                    <div>
                        <Label htmlFor="league-size-input">League size (no. teams)</Label>
                        <Input
                            id="league-size-input"
                            type="number"
                            step={1}
                            min={2}
                            max={records.length - 1}
                            value={String(groupSize)}
                            onChange={({ currentTarget: { value } }) => {
                                if (value) {
                                    setGroupSize(Number(value));
                                }
                            }}
                        />
                    </div>
                    <div>
                        <input
                            id="equalize-group-checkbox"
                            type="checkbox"
                            checked={shouldEqualizeGroups}
                            onChange={event => setShouldEqualizeGroups(event.currentTarget.checked)}
                        />
                        <Label htmlFor="equalize-group-checkbox">Equalize groups</Label>
                    </div>
                    {optimalPartition &&
                        <>
                            <ListSublist list={optimalPartition} />
                            <div>Save results</div>
                            <FieldPicker
                                table={table}
                                field={groupField}
                                allowedTypes={[FieldType.SINGLE_SELECT]}
                                onChange={field => {
                                    setGroupField(field);
                                }}
                            />
                            {groupField &&
                                <Button onClick={savePartition}>Save</Button>
                            }
                        </>
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
                <ul>{sublist.map(record =>
                <li key={record.id}>{record.name}</li>)}
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

function parseLocation(loc) {
    loc = loc.replace('(', '');
    loc = loc.replace(')', '');
    loc = loc.replace(/\s/, '');
    return loc.split(',').map(Number);
}

function calculateDistance(p1, p2) {
    const [p1x, p1y] = parseLocation(p1);
    const [p2x, p2y] = parseLocation(p2);
    const a = p2y - p1y;
    const b = p2x - p1x;

    // Pythagoras: c^2 = sqrt(a^2 + b^2)
    return Math.sqrt((a ** 2) + (b ** 2));
}

function scorePartition(distanceTable, partition) {
    return partition.reduce((score, group) => {
        let distanceSum = 0;
        // group.reduce((distanceSum, record, index) => {

        // }, )
        group.forEach((record1) => {
            group.forEach((record2) => {
                distanceSum += distanceTable[record1.id][record2.id];
            });
        });
        return score + distanceSum;
    }, 0)
}

// reject partitions where the group sizes differ by more than 1
function isValidPartition(partition) {
    const max = Math.max(...partition.map(group => group.length));
    const min = Math.min(...partition.map(group => group.length));
    return Math.abs(max - min) <= 1;
}

function createPartitions(items, size) {
    if (size >= items.length) {
        throw new Error('Group size must be smaller than total');
    }

    const div = Math.floor(items.length / size);
    const rem = items.length % size;

    const divisions = new Array(div).fill(size);
    if (rem === 0) {
        divisions.pop();
    }
    return group(items, divisions);
}

function pick(list, items) {
    var length = list.length, selected = [], rest = [];

    for (var i = 0; i < length; i++) {
        if (items.indexOf(i) < 0) rest.push(list[i]);
        else selected.push(list[i]);
    }

    return [selected, rest];
}


function getIndices(length) {
    var indices = [];

    for (var i = 0; i < length; i++)
        indices.push(i);
    return indices;
}


function group(options, divisions) {
    var subgroup = [], groups = [], n = 0;
    var indices = getIndices(options.length);
    var division = divisions.shift(), remaining = divisions.length;
    indices.forEach(select);
    return groups;

    function select(index) {
        subgroup.push(index);

        if (++n < division) indices.slice(index + 1).forEach(select);
        else {
            var subgroups = pick(options, subgroup);

            if (remaining) {
                var children = group(subgroups.pop(), divisions.slice());
                var length = children.length;
                for (var i = 0; i < length; i++)
                    groups.push(subgroups.concat(children[i]));
            } else groups.push(subgroups);
        }

        subgroup.pop();
        n--;
    }
}
