import {
    FieldPickerSynced,
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    TablePickerSynced,
    ViewPickerSynced,
    loadScriptFromURLAsync,
    Box,
    Input,
    Label,
    Heading,
    Button,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';

// async function createNewTable() {
//     const name = 'My new table';
//     const fields = [
//         // Name will be the primary field of the table.
//         { name: 'Name', type: FieldType.SINGLE_LINE_TEXT },
//         { name: 'Notes', type: FieldType.RICH_TEXT },
//         { name: 'Attachments', type: FieldType.MULTIPLE_ATTACHMENTS },
//         {
//             name: 'Number', type: FieldType.NUMBER, options: {
//                 precision: 8,
//             }
//         },
//         {
//             name: 'Select', type: FieldType.SINGLE_SELECT, options: {
//                 choices: [
//                     { name: 'A' },
//                     { name: 'B' },
//                 ],
//             }
//         },
//     ];
//     if (base.unstable_hasPermissionToCreateTable(name, fields)) {
//         await base.unstable_createTableAsync(name, fields);
//     }
// }

const BLOCK_CODE = 'com.gabalafou.airtable-block.distance-matrix/test-id';

function App() {
    const base = useBase();
    const globalConfig = useGlobalConfig();

    const [tableId, setTableId] = useState('');
    const [viewId, setViewId] = useState('');
    const [distanceTable, setDistanceTable] = useState(null);

    const table = base.getTableByIdIfExists(tableId);
    const view = table ? table.getViewByIdIfExists(viewId) : null;

    const [blockResultCode, setBlockResultCode] = useState(BLOCK_CODE);
    const [groupSize, setGroupSize] = useState(1);
    const [optimalPartition, setOptimalPartition] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);

    const records = useRecords(view);

    useEffect(() => {
        if (records && groupSize) {
            console.log('testing effect with effect cache [records, groupSize]', [records, groupSize]);
        }
    }, [records, groupSize]);

    useEffect(() => {
        function handleMessage(event) {
            if (event && event.data && event.data.request === blockResultCode) {
                const message = event.data;
                setTableId(message.tableId);
                setViewId(message.viewId);
                setDistanceTable(message.distanceTable);
            }
        }
        console.log('main block', "window.addEventListener('message', handleMessage);");
        window.addEventListener('message', handleMessage);
        return function stopListening() {
            console.log('main block', "window.removeEventListener('message', handleMessage);")
            window.removeEventListener('message', handleMessage);
        };
    }, [blockResultCode]);

    useEffect(() => {
        if (distanceTable && groupSize) {
            console.log('finding optimal partition');
            const allPartitions = createPartitions(records, groupSize);
            const partitionScores = allPartitions.map(partition => scorePartition(distanceTable, partition));
            const minimumScore = Math.min(...partitionScores);
            const indexMinimum = partitionScores.indexOf(minimumScore);
            setOptimalPartition(allPartitions[indexMinimum]);
        }
        // Do NOT add `records` to the array below or the setOptimalPartition call
        // will kick off an endless loop of re-setting `records`, calling this effect,
        // calling setOptimalPartition(), and so on and so forth.
    }, [distanceTable, groupSize]);

    // Create table of distances between each pair of locations
    // For now we'll store this table in memory.
    // TODO: store table in Airtable? store table in global config?

    const nextPage = () => setPageIndex(pageIndex + 1);
    const prevPage = () => setPageIndex(pageIndex - 1);

    // useEffect(() => {
    //     if (pageIndex === 3) {
    //         updateGroupedMap(apiKey, optimalPartition, recordsToLatLngs);
    //     }
    // }, [pageIndex, optimalPartition]);

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    <Heading>First, select your addresses.</Heading>
                    <Label>Enter the result code from running the distance matrix block</Label>
                    <Input
                        value={blockResultCode}
                        onChange={event => setBlockResultCode(event.currentTarget.value)}
                    />
                    <Button
                        onClick={() => {
                            requestDistanceMatrix(blockResultCode);
                        }}
                    >Get Distance Matrix
                    </Button>
                    {distanceTable &&
                        <>
                            <div>Received distance matrix!</div>
                            <Button
                                onClick={nextPage}
                            >
                                Next
                            </Button>
                        </>
                    }
                </div>
            );
        }
        case 1: {
            return (
                <div>
                    <Heading>Lastly, choose how many groups to divide your addresses into.</Heading>
                    <div>
                        We will use the distance table created in the last step to calculate the optimal
                        grouping based on the driving distances between addresses.
                    </div>
                    <Box>
                        <Label htmlFor="league-size">League size (no. teams)</Label>
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
                    </Box>
                    {optimalPartition && <
                        ListSublist list={optimalPartition} />
                    }
                    {/* <div id="map-grouped" style={{ width: '100%', height: '400px' }} /> */}
                    <Button onClick={prevPage}>Back</Button>
                </div>
            );
        }
    }
}

initializeBlock(() => <App />);


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
        group.forEach((record1, outerIndex) => {
            group.forEach((record2, innerIndex) => {
                if (outerIndex === innerIndex) {
                    return;
                }
                distanceSum += distanceTable[record1.id][record2.id];
            });
        });
        return score + distanceSum;
    }, 0)
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
