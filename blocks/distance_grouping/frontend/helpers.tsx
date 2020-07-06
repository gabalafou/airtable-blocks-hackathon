const BATCH_SIZE = 50;
export async function batchUpdateRecords(table, updates) {
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

export async function addChoicesToSelectField(selectField, choices) {
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

export function createMockDistanceTable(origins, destinations) {
  const distanceTable = {};
  origins.forEach(origin => {
    distanceTable[origin.id] = {};
    destinations.forEach(destination => {
      distanceTable[origin.id][destination.id] = {
        distance: {
          value: Math.random() * 100
        }
      };
    });
  });
  return distanceTable;
}
