import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const { requestContext, body } = event;
    const { connectionId, routeKey } = requestContext;
    
    const apiGateway = new ApiGatewayManagementApiClient({
        endpoint: `https://${requestContext.domainName}/${requestContext.stage}`
    });
    
    try {
        switch (routeKey) {
            case '$connect':
                console.log('WebSocket connected:', connectionId);
                return { statusCode: 200 };
                
            case '$disconnect':
                await dynamodb.send(new DeleteItemCommand({
                    TableName: 'WebSocketConnections',
                    Key: { connectionId: { S: connectionId } }
                }));
                return { statusCode: 200 };
                
            case 'subscribe':
                const { contactId } = JSON.parse(body);
                await dynamodb.send(new PutItemCommand({
                    TableName: 'WebSocketConnections',
                    Item: {
                        connectionId: { S: connectionId },
                        contactId: { S: contactId }
                    }
                }));
                return { statusCode: 200 };
                
            case 'sendSuggestion':
                return { statusCode: 200 }; // Not used anymore
                
            default:
                return { statusCode: 400 };
        }
    } catch (error) {
        console.error('WebSocket error:', error);
        return { statusCode: 500 };
    }
};