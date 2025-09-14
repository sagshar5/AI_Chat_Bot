import { ConnectClient, StartContactStreamingCommand } from '@aws-sdk/client-connect';

const connect = new ConnectClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const contactId = event.Details.ContactData.ContactId;
    
    const command = new StartContactStreamingCommand({
        ContactId: contactId,
        InstanceId: event.Details.ContactData.InstanceARN.split('/')[1],
        ChatStreamingConfiguration: {
            StreamingEndpointArn: 'arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:streamingTopic'
        }
    });
    
    try {
        await connect.send(command);
        return { success: true };
    } catch (error) {
        console.error('StartContactStreaming failed:', error);
        return { success: false };
    }
};