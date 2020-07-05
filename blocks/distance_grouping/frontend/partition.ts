export function createPartitions(items, size) {
  if (size >= items.length) {
    throw new Error('Group size must be smaller than total');
  }

  const div = Math.floor(items.length / size);
  const rem = items.length % size;

  console.log(div, rem);

  const divisions = new Array(div).fill(size);
  if (rem === 0) {
    divisions.pop();
  }
  console.log('about to partition', items, divisions);
  return group(items, divisions);
}

export function scorePartition(distanceTable, partition) {
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
export function isValidPartition(partition) {
    const max = Math.max(...partition.map(group => group.length));
    const min = Math.min(...partition.map(group => group.length));
    return Math.abs(max - min) <= 1;
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
