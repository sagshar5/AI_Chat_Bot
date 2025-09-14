import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: 'https://8aflb62rj5.execute-api.us-east-1.amazonaws.com/prod'
});
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    for (const record of event.Records) {
        if (record.EventSource === 'aws:sns') {
            const message = JSON.parse(record.Sns.Message);
            
            if (message.Type === 'MESSAGE' && message.ParticipantRole === 'CUSTOMER') {
                console.log('📨 Processing customer message:', message.Content);
                console.log('📞 Contact ID:', message.ContactId);
                
                // Call AI API
                console.log('🤖 Calling AI API...');
                const aiResponse = await fetch('https://n89e9u33fg.execute-api.us-east-1.amazonaws.com/processChat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customerMessage: message.Content })
                });
                
                const aiResult = await aiResponse.json();
                console.log('✅ AI API response:', aiResult);
                
                // Get WebSocket connections for this contact
                console.log('🔍 Searching for WebSocket connections for contact:', message.ContactId);
                const connections = await dynamodb.send(new ScanCommand({
                    TableName: 'WebSocketConnections',
                    FilterExpression: 'contactId = :contactId',
                    ExpressionAttributeValues: {
                        ':contactId': { S: message.ContactId }
                    }
                }));
                
                console.log('📊 Found connections:', connections.Items?.length || 0);
                if (connections.Items) {
                    connections.Items.forEach((item, index) => {
                        console.log(`Connection ${index + 1}:`, {
                            connectionId: item.connectionId.S,
                            contactId: item.contactId.S
                        });
                    });
                }
                
                // Send suggestion to all connections for this contact
                if (connections.Items && connections.Items.length > 0) {
                    for (const item of connections.Items) {
                        const suggestionData = {
                            suggestion: aiResult.suggestedAnswer || 'No suggestion available'
                        };
                        
                        console.log('📤 Sending to WebSocket:', {
                            connectionId: item.connectionId.S,
                            data: suggestionData
                        });
                        
                        try {
                            await apiGateway.send(new PostToConnectionCommand({
                                ConnectionId: item.connectionId.S,
                                Data: JSON.stringify(suggestionData)
                            }));
                            console.log('✅ Successfully sent to connection:', item.connectionId.S);
                        } catch (error) {
                            console.error('❌ Failed to send to connection:', item.connectionId.S, error);
                        }
                    }
                } else {
                    console.log(`❌ No WebSocket connections found for contact: ${message.ContactId}`);
                }
            }
        }
    }
    
    return { statusCode: 200 };
};