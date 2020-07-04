import {
    FieldPickerSynced,
    useBase,
    useGlobalConfig,
    useSynced,
    TablePickerSynced,
    ViewPickerSynced,
    Input,
    Heading,
    Button,
    Label,
} from '@airtable/blocks/ui';
import React from 'react';


export default function Settings(props) {
    const { onDone } = props;
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const [apiKey, setApiKey, canSetApiKey] = useSynced('googleMapsApiKey') as [string, (string) => void, boolean];

    const table = base.getTableByIdIfExists(tableId as string);

    return (
        <div>
            <Heading>Create a table of distances between your locations.</Heading>
            <div>First, select your locations.</div>
            <TablePickerSynced globalConfigKey="selectedTableId" />
            <ViewPickerSynced table={table} globalConfigKey="selectedViewId" />
            <FieldPickerSynced table={table} globalConfigKey="locationFieldId" />
            <Label>Google Maps API key</Label>
            <Input
                placeholder="Google Maps API Key"
                value={apiKey || ''}
                onChange={event => setApiKey(event.currentTarget.value)}
                disabled={!canSetApiKey}
            />
            <Button variant="primary" onClick={onDone}>Done</Button>
        </div>
    )
}
