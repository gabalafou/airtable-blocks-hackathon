import {
    useGlobalConfig,
    InputSynced,
    Button,
    Heading,
    Box,
    FormField,
} from '@airtable/blocks/ui';
import React from 'react';


export default function Settings(props) {
    const { onDone } = props;
    const globalConfig = useGlobalConfig();
    const blockResultCode = globalConfig.get('blockResultCode');

    return (
        <Box margin={2}>
            <Heading>Distance Grouping settings</Heading>
            {!blockResultCode &&
                <p>Note: this block only works in conjunction with the Distance Matrix block.</p>
            }
            <FormField label="Enter result code from Distance Matrix block">
                <InputSynced
                    id="block-result-code-input"
                    globalConfigKey="blockResultCode"
                />
            </FormField>
            <Button variant="primary" onClick={onDone}>Done</Button>
        </Box>
    );
}
