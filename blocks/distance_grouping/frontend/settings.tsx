import {
    useSynced,
    Input,
    Button,
    Label,
} from '@airtable/blocks/ui';
import React from 'react';


export default function Settings(props) {
    const { onDone } = props;
    const [blockResultCode, setBlockResultCode, canSetBlockResultCode] = useSynced('blockResultCode') as [string, (string) => void, boolean];

    return (
        <div>
            <Label htmlFor="block-result-code-input">Enter the result code from running the distance matrix block</Label>
            <Input
                id="block-result-code-input"
                value={blockResultCode || ''}
                onChange={event => setBlockResultCode(event.currentTarget.value)}
            />
            <Button variant="primary" onClick={onDone}>Done</Button>
        </div>
    );
}
