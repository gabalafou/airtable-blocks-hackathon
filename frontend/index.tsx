import { FieldType } from '@airtable/blocks/models';
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
import React, {useState, useEffect} from 'react';

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

let googleMapsLoaded;

async function geocodeAddresses(apiKey, addresses) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    const geocoder = new google.maps.Geocoder();

    const latLngPromises = addresses.map(address => new Promise(resolve => {
        console.log('about to geocode', address);
        geocoder.geocode({ address }, (results, status) => {
            console.log('geocoded', address);
            const latLng = results[0].geometry.location;
            resolve(latLng);
        });
    }));

    return Promise.all(latLngPromises);
}

async function createDistanceTable(apiKey, recordsToLatLngs) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    const distanceTable = {};
    const records = Array.from(recordsToLatLngs.keys())
    const latLngs = Array.from(recordsToLatLngs.values());

    records.forEach(rec => distanceTable[rec.id] = {});

    const origins = latLngs;
    console.log({ origins })
    const destinations = latLngs;
    const service = new google.maps.DistanceMatrixService();

    return new Promise(resolve => {
        service.getDistanceMatrix({
            origins,
            destinations,
            travelMode: 'DRIVING',
        }, (response, status) => {
            console.log('google maps response', response);
            if (status == 'OK') {
                const { rows } = response;
                latLngs.forEach((loc1, iOuter) => {
                    const { elements } = rows[iOuter];
                    latLngs.forEach((loc2, iInner) => {
                        if (iOuter === iInner) {
                            return;
                        }
                        const distance = elements[iInner].distance.value;

                        distanceTable[records[iOuter].id][records[iInner].id] = distance;
                    });
                });

                console.log('Distance Table', distanceTable);
                resolve(distanceTable);
            }
        });
    })
}


async function updateGroupedMap(apiKey, optimalPartition, recordsToLatLngs) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    console.log('going to try to draw map now');

    const map = new google.maps.Map(document.getElementById('map-grouped'), {
        mapTypeId: 'roadmap',
    });
    const bounds = new google.maps.LatLngBounds();

    optimalPartition.forEach((group, index) => {
        group.forEach(record => {
            const latLng = recordsToLatLngs.get(record);
            console.log('latLng', latLng);
            new google.maps.Marker({
                map: map,
                position: latLng,
                label: String(index + 1),
            });
            bounds.extend(latLng);
        });

    });

    console.log('finished adding markers for all addresses');

    map.fitBounds(bounds);
}



function App() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const [groupSize, setGroupSize] = useState(1);
    const [apiKey, setApiKey] = useState('AIzaSyAliMN_wq1l8QSEwyKgQcUsTaaBuZus5Ck');
    const [distanceTable, setDistanceTable] = useState(null);
    const [optimalPartition, setOptimalPartition] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);
    const [recordsToLatLngs, setRecordsToLatLngs] = useState(new Map());

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const records = useRecords(view);

    useEffect(() => {
        if (records && locationField && groupSize) {
            console.log('testing effect with effect cache [records, locationField, groupSize]', [records, locationField, groupSize]);
        }
    }, [records, locationField, groupSize]);

    // TODO: handle errors from Google
    // could be sign that user has picked wrong field


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



    // const tasks = records && completedFieldId ? records.map(record =>
    //     <Task
    //         key={record.id}
    //         record={record}
    //         onToggle={toggle}
    //         completedFieldId={completedFieldId}
    //     />
    // ) : null;

    const nextPage = () => setPageIndex(pageIndex + 1);

    useEffect(() => {
        if (pageIndex === 3) {
            updateGroupedMap(apiKey, optimalPartition, recordsToLatLngs);
        }
    }, [pageIndex, optimalPartition]);

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    <Heading>First, select your addresses.</Heading>
                    <TablePickerSynced globalConfigKey="selectedTableId" />
                    <ViewPickerSynced table={table} globalConfigKey="selectedViewId" />
                    <FieldPickerSynced table={table} globalConfigKey="locationFieldId" />
                    {locationField &&
                        <>
                            <div>These are your addresses:</div>
                            <ul>
                                {records.map(record =>
                                    <li key={record.id}>{record.getCellValue(locationField)}</li>
                                )}
                            </ul>
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
                    <Heading>Next, convert your addresses to map coordinates.</Heading>
                    <div>In order to do this, we will need your Google Maps API key.</div>
                    <Input
                        placeholder="Google Maps API Key"
                        value={apiKey}
                        onChange={event => setApiKey(event.currentTarget.value)}
                    />
                    <Button
                        onClick={() => {
                            const addresses = records.map(r => r.getCellValue(locationField));
                            const latLngs = geocodeAddresses(apiKey, addresses);
                            latLngs.then(latLngs => {
                                console.log('going to try to draw map now');

                                const map = new google.maps.Map(document.getElementById('map'), {
                                    mapTypeId: 'roadmap',
                                });
                                const bounds = new google.maps.LatLngBounds();

                                latLngs.forEach(latLng => {
                                    new google.maps.Marker({
                                        map: map,
                                        position: latLng
                                    });
                                    bounds.extend(latLng);
                                });

                                console.log('finished adding markers for all addresses');

                                map.fitBounds(bounds);

                                const latLngByRecord = new Map();
                                latLngs.forEach((latLng, index) => {
                                    latLngByRecord.set(records[index], latLng);
                                });
                                setRecordsToLatLngs(latLngByRecord);
                            });
                        }}
                    >
                        Fetch {records.length} coordinates from Google Maps
                    </Button>
                    {recordsToLatLngs.size > 0 &&
                        <>
                            <div>Your addresses have been geocoded! If the map below looks good, go on to the next step.</div>
                            <Button
                                onClick={nextPage}
                            >
                                Next
                            </Button>
                        </>
                    }
                    <div id="map" style={{ width: '100%', height: '400px' }} />
                </div>
            );
        }
        case 2: {
            return (
                <div>
                    <Heading>Next, calculate all of the distances between your addresses.</Heading>
                    <div>In order to do this, we will need your Google Maps API key.</div>
                    <Input
                        placeholder="Google Maps API Key"
                        value={apiKey}
                        onChange={event => setApiKey(event.currentTarget.value)}
                    />
                    <Button
                        onClick={() => {
                            createDistanceTable(apiKey, recordsToLatLngs)
                                .then(setDistanceTable);
                        }}
                    >
                        Fetch distance matrix from Google Maps
                    </Button>
                    {distanceTable &&
                        <div>
                            <div>Created distance table!</div>
                            <Button
                                onClick={nextPage}
                            >
                                Next
                            </Button>
                        </div>
                    }
                </div>
            );
        }
        case 3: {
            return (
                <div>
                    <Heading>Lastly, choose how many groups to divide your addresses into.</Heading>
                    <div>
                        We'll use the distance table created in the last step to calculate the optimal
                        grouping based on the driving distances between addresses.
                    </div>
                    {locationField &&
                        <Box>
                            <Label htmlFor="league-size">League size (no. teams)</Label>
                            <Input
                                id="league-size-input"
                                type="number"
                                step={1}
                                min={1}
                                max={records.length - 1}
                                value={String(groupSize)}
                                onChange={({ currentTarget: { value } }) => {
                                    if (value) {
                                        setGroupSize(Number(value));
                                    }
                                }}
                            />
                        </Box>
                    }
                    {optimalPartition && <
                        ListSublist list={optimalPartition} />
                    }
                    <div id="map-grouped" style={{ width: '100%', height: '400px' }} />
                </div>
            );
        }
    }
}

initializeBlock(() => <App />);


function ListSublist(props) {
    const {list} = props;
    return (
        <ul>{list.map((sublist, i) =>
            <li key={i}>
                Group {i+1}:
                <ul>{sublist.map(record =>
                    <li key={record.id}>{record.name}</li>)}
                </ul>
            </li>)}
        </ul>
    )
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
    return Math.sqrt( (a ** 2) + (b ** 2) );
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
