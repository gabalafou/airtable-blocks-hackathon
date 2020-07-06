import isDev from './is-dev';


export function createPartitions(items, numberOfGroups) {
    const numberOfItems = items.length;
    if (numberOfGroups > numberOfItems) {
        throw new Error('Choose smaller number of groups.');
    }

    if (numberOfGroups === 1) {
        return [ [items] ];
    }

    const groupSizes = [];
    for (let i = 0; i < numberOfItems; i++) {
        const groupSizeIndex = i % numberOfGroups;
        groupSizes[groupSizeIndex] = 1 + (groupSizes[groupSizeIndex] || 0);
    }

    const divisions = groupSizes.slice(0, -1);
    isDev && console.log('grouping', items.length, divisions);
    return group(items, divisions);
}

export function scorePartition(distanceTable, partition) {
    return partition.reduce((score, group) => {
        let distanceSum = 0;
        group.forEach((record1) => {
            group.forEach((record2) => {
                const element = distanceTable[record1.id][record2.id];
                distanceSum += element.distance.value;
            });
        });
        return score + distanceSum;
    }, 0)
}

export function findOptimalPartition(records, distanceTable, numberOfGroups) {
    if (distanceTable && numberOfGroups) {
        isDev && console.log('finding optimal partition');
        const allPartitions = createPartitions(records, numberOfGroups);
        isDev && console.log('allPartitions', allPartitions, 'records.length', records.length, 'numberOfGroups', numberOfGroups);

        const partitionScores = allPartitions.map(partition => scorePartition(distanceTable, partition));
        isDev && console.log('partitionScores', partitionScores);

        const minimumScore = partitionScores.reduce((left, right) => {
            return Math.min(left, right);
        }, Infinity);
        const indexMinimum = partitionScores.indexOf(minimumScore);

        isDev && console.log('optimal partition', allPartitions[indexMinimum], 'score', minimumScore);
        return allPartitions[indexMinimum];
    }
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
