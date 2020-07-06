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
    Box,
    FormField,
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
        <Box margin={2}>
            <Heading>Distance Matrix settings</Heading>
            <FormField label="Table">
                <TablePickerSynced globalConfigKey="selectedTableId" />
            </FormField>
            <FormField label="View">
                <ViewPickerSynced table={table} globalConfigKey="selectedViewId" />
            </FormField>
            <FormField label="Location field"
                description="Pick a field containing addresses or coordinates."
            >
                <FieldPickerSynced table={table} globalConfigKey="locationFieldId" />
            </FormField>
            <FormField
                label="Google Maps API key"
                description="This key must have Maps and Distance Matrix enabled"
            >
                <Input
                    placeholder="Google Maps API Key"
                    value={apiKey || ''}
                    onChange={event => setApiKey(event.currentTarget.value)}
                    disabled={!canSetApiKey}
                />
            </FormField>
            <Button variant="primary" onClick={onDone}>Done</Button>
        </Box>
    )
}
