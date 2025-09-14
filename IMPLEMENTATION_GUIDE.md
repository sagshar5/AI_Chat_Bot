# Amazon Connect Real-Time AI Assistant Implementation Guide

## 📋 Executive Summary

This solution provides **real-time AI-powered customer support suggestions** for Amazon Connect agents through an intelligent chat assistant that automatically processes customer messages and delivers contextual responses powered by AWS Bedrock and Amazon Kendra.

### Key Benefits
- **Zero Manual Intervention**: Automatic message monitoring and AI suggestion delivery
- **Real-Time Performance**: Sub-second response times via WebSocket architecture
- **Scalable Design**: Serverless architecture supporting multiple agents and contacts
- **Enterprise Ready**: Built on AWS managed services with proper security and monitoring

---

## 🏗️ Solution Architecture

### High-Level Architecture Flow
```
Customer Message → Amazon Connect → Contact Flow → Lambda (Streaming) 
    ↓
SNS Topic → Lambda (AI Processor) → Bedrock + Kendra → WebSocket API
    ↓
Custom CCP Interface → Real-Time AI Suggestions
```

### Core Components
1. **Custom CCP Frontend** - React-based interface embedding Amazon Connect CCP
2. **Contact Flow Integration** - Automatic streaming enablement via Lambda
3. **Message Processing Pipeline** - SNS-driven serverless architecture
4. **AI Engine** - AWS Bedrock (Claude) + Amazon Kendra knowledge base
5. **Real-Time Delivery** - WebSocket API Gateway for instant suggestions

---

## 🛠️ Prerequisites

### AWS Services Required
- Amazon Connect instance with chat capability
- AWS Lambda (Node.js 20.x runtime)
- Amazon SNS
- Amazon DynamoDB
- API Gateway (REST + WebSocket)
- AWS Bedrock (Claude 3.5 Sonnet)
- Amazon Kendra (optional - for knowledge base)
- IAM roles and policies

### Development Environment
- Node.js 18+ and npm
- AWS CLI configured
- Code editor (VS Code recommended)
- Modern web browser for testing

---

## 📦 Step-by-Step Implementation

### Phase 1: AWS Infrastructure Setup

#### Step 1.1: Create DynamoDB Table
```bash
aws dynamodb create-table \
    --table-name WebSocketConnections \
    --attribute-definitions \
        AttributeName=connectionId,AttributeType=S \
    --key-schema \
        AttributeName=connectionId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region us-east-1
```

#### Step 1.2: Create SNS Topic
```bash
aws sns create-topic --name streamingTopic --region us-east-1
```
**Note the Topic ARN** for later use.

#### Step 1.3: Create IAM Roles

**Lambda Execution Role:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "connect:StartContactStreaming",
                "dynamodb:PutItem",
                "dynamodb:DeleteItem",
                "dynamodb:Scan",
                "execute-api:ManageConnections",
                "bedrock:InvokeModel",
                "kendra:Query"
            ],
            "Resource": "*"
        }
    ]
}
```

### Phase 2: Lambda Functions Deployment

#### Step 2.1: Contact Flow Lambda (Streaming Enabler)

**File: `contact-flow-lambda.js`**
```javascript
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
```

**Deploy:**
```bash
zip contact-flow-lambda.zip contact-flow-lambda.js
aws lambda create-function \
    --function-name ConnectStreamingEnabler \
    --runtime nodejs20.x \
    --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
    --handler contact-flow-lambda.handler \
    --zip-file fileb://contact-flow-lambda.zip
```

#### Step 2.2: AI Processing Lambda

**File: `ai-processor-lambda.py`**
```python
import os
import json
import boto3

bedrock = boto3.client('bedrock-runtime')
kendra = boto3.client('kendra')

INDEX_ID = "YOUR_KENDRA_INDEX_ID"
INFERENCE_PROFILE_ID = "arn:aws:bedrock:us-east-1:YOUR_ACCOUNT:application-inference-profile/YOUR_PROFILE_ID"

def lambda_handler(event, context):
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 204, 'headers': headers, 'body': ''}
    
    try:
        body = json.loads(event.get('body', '{}'))
        question = body.get('customerMessage', '').strip()
        
        if not question:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'customerMessage is required'})
            }
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    
    # Query Kendra for context (optional)
    try:
        resp = kendra.query(
            IndexId=INDEX_ID,
            QueryText=question,
            PageSize=3
        )
        
        excerpts = [
            item['DocumentExcerpt']['Text']
            for item in resp.get('ResultItems', [])
            if 'DocumentExcerpt' in item
        ]
    except Exception as e:
        excerpts = []
    
    # Prepare context
    kb_text = "\n---\n".join(excerpts) if excerpts else "No relevant context found."
    
    # Prepare Claude prompt
    messages = [
        {
            "role": "user",
            "content": f"""You are a helpful customer service assistant. Based on the following context, provide a clear and helpful response to the customer's question.

Context:
{kb_text}

Customer Question: {question}

Please provide a concise, helpful response that addresses the customer's question using the provided context. If the context doesn't contain relevant information, provide a general helpful response and suggest they contact support for more specific assistance."""
        }
    ]
    
    # Invoke Bedrock
    try:
        response = bedrock.invoke_model(
            modelId=INFERENCE_PROFILE_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": messages,
                "temperature": 0.1,
                "top_p": 0.9
            }),
            contentType='application/json'
        )
        
        response_body = response['body'].read().decode('utf-8')
        result = json.loads(response_body)
        answer = result['content'][0]['text'].strip()
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Bedrock invocation failed: {str(e)}'})
        }
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({'suggestedAnswer': answer})
    }
```

#### Step 2.3: SNS Processor Lambda

**File: `sns-processor-lambda.js`**
```javascript
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: 'https://YOUR_WEBSOCKET_API_ID.execute-api.us-east-1.amazonaws.com/prod'
});
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    for (const record of event.Records) {
        if (record.EventSource === 'aws:sns') {
            const message = JSON.parse(record.Sns.Message);
            
            if (message.Type === 'MESSAGE' && message.ParticipantRole === 'CUSTOMER') {
                // Call AI API
                const aiResponse = await fetch('https://YOUR_AI_API_ID.execute-api.us-east-1.amazonaws.com/processChat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customerMessage: message.Content })
                });
                
                const aiResult = await aiResponse.json();
                
                // Get WebSocket connections for this contact
                const connections = await dynamodb.send(new ScanCommand({
                    TableName: 'WebSocketConnections',
                    FilterExpression: 'contactId = :contactId',
                    ExpressionAttributeValues: {
                        ':contactId': { S: message.ContactId }
                    }
                }));
                
                // Send suggestion to all connections for this contact
                if (connections.Items && connections.Items.length > 0) {
                    for (const item of connections.Items) {
                        try {
                            await apiGateway.send(new PostToConnectionCommand({
                                ConnectionId: item.connectionId.S,
                                Data: JSON.stringify({
                                    suggestion: aiResult.suggestedAnswer || 'No suggestion available'
                                })
                            }));
                        } catch (error) {
                            console.error('Failed to send to connection:', error);
                        }
                    }
                }
            }
        }
    }
    
    return { statusCode: 200 };
};
```

#### Step 2.4: WebSocket Lambda

**File: `websocket-lambda.js`**
```javascript
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const { requestContext, body } = event;
    const { connectionId, routeKey } = requestContext;
    
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
                
            default:
                return { statusCode: 400 };
        }
    } catch (error) {
        console.error('WebSocket error:', error);
        return { statusCode: 500 };
    }
};
```

### Phase 3: API Gateway Setup

#### Step 3.1: Create REST API for AI Processing
```bash
aws apigateway create-rest-api --name "ConnectAIProcessor" --region us-east-1
```

#### Step 3.2: Create WebSocket API
```bash
aws apigatewayv2 create-api \
    --name "ConnectAIWebSocket" \
    --protocol-type WEBSOCKET \
    --route-selection-expression '$request.body.action'
```

**Create Routes:**
```bash
# Replace YOUR_API_ID with actual WebSocket API ID
aws apigatewayv2 create-route --api-id YOUR_API_ID --route-key '$connect'
aws apigatewayv2 create-route --api-id YOUR_API_ID --route-key '$disconnect'
aws apigatewayv2 create-route --api-id YOUR_API_ID --route-key 'subscribe'
```

### Phase 4: Frontend Implementation

#### Step 4.1: Custom CCP Interface

**File: `index.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Amazon Connect AI Assistant</title>
    <link rel="stylesheet" href="styles.css">
    <script src="https://github.com/amazon-connect/amazon-connect-streams/releases/download/v2.18.7/connect-streams-min.js"></script>
</head>
<body>
    <!-- Configuration Screen -->
    <div id="configScreen" class="config-screen">
        <div class="config-panel">
            <h2>🔧 Amazon Connect Configuration</h2>
            <form id="configForm">
                <div class="form-group">
                    <label for="ccpUrl">CCP URL:</label>
                    <input type="url" id="ccpUrl" placeholder="https://your-instance-name.my.connect.aws/ccp-v2/" required>
                </div>
                <div class="form-group">
                    <label for="region">AWS Region:</label>
                    <select id="region">
                        <option value="us-east-1">US East (N. Virginia)</option>
                        <option value="us-west-2">US West (Oregon)</option>
                        <option value="eu-west-1">Europe (Ireland)</option>
                    </select>
                </div>
                <button type="submit" class="connect-button">🚀 Connect to Amazon Connect</button>
            </form>
        </div>
    </div>

    <!-- Main Application -->
    <div id="mainApp" class="main-app" style="display: none;">
        <!-- Amazon Connect CCP Container -->
        <div class="ccp-container">
            <div id="ccpContainer" class="ccp-iframe-container"></div>
        </div>

        <!-- AI Suggestions Panel -->
        <div class="ai-panel">
            <div class="ai-header">
                <h2>🤖 AI Assistant</h2>
                <button id="configButton" class="config-button">⚙️ Config</button>
            </div>

            <!-- Connection Status -->
            <div class="status-section">
                <div class="status-item">
                    <span class="status-label">Agent:</span>
                    <span class="status-value" id="agentStatus">Initializing...</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Contact:</span>
                    <span class="status-value" id="contactStatus">No active contact</span>
                </div>
            </div>

            <!-- AI Suggestion Display -->
            <div class="suggestion-container">
                <h4>💡 AI Suggestion:</h4>
                <div class="suggestion-display" id="aiSuggestion">
                    🎯 Ready to provide AI suggestions for customer messages
                </div>
            </div>

            <!-- Manual Testing -->
            <div class="manual-input-section">
                <h4>📝 Manual Test:</h4>
                <textarea id="manualMessage" placeholder="Test message..." rows="3"></textarea>
                <button id="testButton" class="test-button">🎯 Try Random Test Message</button>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
```

#### Step 4.2: Frontend Logic

**File: `app.js`** (Key sections)
```javascript
class AmazonConnectAI {
    constructor() {
        this.websocket = null;
        this.init();
    }

    connectWebSocket() {
        this.websocket = new WebSocket('wss://YOUR_WEBSOCKET_API_ID.execute-api.us-east-1.amazonaws.com/prod');
        
        this.websocket.onopen = () => {
            console.log('✅ WebSocket connected successfully!');
        };
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.suggestion) {
                this.updateAISuggestion(`💡 ${data.suggestion}`);
            }
        };
    }

    setupChatMonitoring(contact) {
        const contactId = contact.getContactId();
        
        // Subscribe to WebSocket immediately when contact starts
        this.subscribeToContact(contactId);
        
        // Monitor messages for processing
        const monitorMessages = () => {
            contact.getTranscript({
                success: (data) => {
                    if (data && data.transcript && data.transcript.length > 0) {
                        const messages = data.transcript;
                        const customerMessages = messages.filter(msg =>
                            msg.ParticipantRole === 'CUSTOMER' && msg.Type === 'MESSAGE'
                        );

                        if (customerMessages.length > 0) {
                            const latestMessage = customerMessages[customerMessages.length - 1];
                            if (latestMessage.Content !== this.state.lastMessage) {
                                this.handleNewMessage(latestMessage.Content, contact);
                            }
                        }
                    }
                }
            });
        };

        setInterval(monitorMessages, 2000);
    }

    subscribeToContact(contactId) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                action: 'subscribe',
                contactId: contactId
            }));
        }
    }
}
```

### Phase 5: Amazon Connect Configuration

#### Step 5.1: Contact Flow Setup
1. **Open Amazon Connect Admin Console**
2. **Go to Contact Flows → Create contact flow**
3. **Add "Invoke AWS Lambda function" block**
4. **Configure Lambda ARN**: `arn:aws:lambda:us-east-1:YOUR_ACCOUNT:function:ConnectStreamingEnabler`
5. **Connect to chat flow and publish**

#### Step 5.2: Domain Allowlist Configuration
1. **Go to Application Integration → Third-party applications**
2. **Add approved origins:**
   - Development: `http://localhost:3000`, `http://localhost:5173`
   - Production: Your actual domain
3. **Save and wait for propagation**

### Phase 6: Testing and Validation

#### Step 6.1: Component Testing
```bash
# Test Lambda functions
aws lambda invoke --function-name ConnectStreamingEnabler --payload '{"Details":{"ContactData":{"ContactId":"test-123","InstanceARN":"arn:aws:connect:us-east-1:123456789012:instance/test"}}}' response.json

# Check DynamoDB table
aws dynamodb scan --table-name WebSocketConnections

# Monitor logs
aws logs filter-log-events --log-group-name "/aws/lambda/ConnectSNSProcessor" --start-time $(date -d '10 minutes ago' +%s)000
```

#### Step 6.2: End-to-End Testing
1. **Open Custom CCP** in browser
2. **Configure Amazon Connect** instance URL
3. **Login as agent** in embedded CCP
4. **Start chat contact** from customer side
5. **Send customer message**
6. **Verify AI suggestion** appears in real-time

---

## 🔧 Configuration Parameters

### Environment Variables
```bash
# Lambda Environment Variables
WEBSOCKET_API_ENDPOINT=wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod
AI_API_ENDPOINT=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/processChat
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:YOUR_ACCOUNT:streamingTopic
DYNAMODB_TABLE=WebSocketConnections
KENDRA_INDEX_ID=YOUR_KENDRA_INDEX_ID
BEDROCK_MODEL_ID=arn:aws:bedrock:us-east-1:YOUR_ACCOUNT:application-inference-profile/YOUR_PROFILE_ID
```

### Replace Placeholders
- `YOUR_ACCOUNT_ID`: AWS Account ID
- `YOUR_API_ID`: API Gateway IDs
- `YOUR_KENDRA_INDEX_ID`: Kendra Index ID (if using)
- `YOUR_PROFILE_ID`: Bedrock Inference Profile ID

---

## 📊 Monitoring and Troubleshooting

### CloudWatch Metrics
- Lambda function invocations and errors
- API Gateway request counts and latencies
- DynamoDB read/write capacity
- WebSocket connection counts

### Common Issues
1. **WebSocket not connecting**: Check API Gateway deployment and CORS
2. **No AI suggestions**: Verify SNS subscription and Lambda permissions
3. **DynamoDB empty**: Check WebSocket subscription timing
4. **Contact streaming fails**: Verify Contact Flow Lambda integration

### Debug Commands
```bash
# Check recent Lambda logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/"

# Monitor WebSocket connections
aws dynamodb scan --table-name WebSocketConnections --projection-expression "connectionId,contactId"

# Test AI API directly
curl -X POST https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/processChat \
  -H "Content-Type: application/json" \
  -d '{"customerMessage": "Hello, I need help with my account"}'
```

---

## 💰 Cost Optimization

### Estimated Monthly Costs (1000 chats/month)
- **Lambda**: $5-10
- **API Gateway**: $3-5
- **DynamoDB**: $1-3
- **SNS**: $1-2
- **Bedrock**: $20-50 (depending on usage)
- **Total**: ~$30-70/month

### Cost Optimization Tips
1. **Use DynamoDB On-Demand** for variable workloads
2. **Implement connection cleanup** with TTL
3. **Monitor Bedrock token usage**
4. **Use Lambda Provisioned Concurrency** only if needed

---

## 🔒 Security Considerations

### IAM Best Practices
- **Principle of least privilege** for all Lambda roles
- **Resource-specific permissions** where possible
- **Regular access review** and rotation

### Data Protection
- **Encrypt data in transit** (HTTPS/WSS)
- **Encrypt data at rest** (DynamoDB encryption)
- **No PII logging** in CloudWatch logs
- **Secure API endpoints** with proper authentication

### Network Security
- **VPC endpoints** for internal communication
- **WAF protection** for public APIs
- **Rate limiting** on API Gateway

---

## 🚀 Production Deployment

### Deployment Checklist
- [ ] All Lambda functions deployed with production settings
- [ ] API Gateway endpoints configured and deployed
- [ ] DynamoDB table created with appropriate capacity
- [ ] SNS topic and subscriptions configured
- [ ] IAM roles and policies applied
- [ ] Amazon Connect contact flow updated
- [ ] Domain allowlist configured
- [ ] Monitoring and alerting set up
- [ ] End-to-end testing completed

### Scaling Considerations
- **Lambda concurrency limits** for high-volume scenarios
- **DynamoDB auto-scaling** for connection management
- **API Gateway throttling** for rate limiting
- **Multi-region deployment** for disaster recovery

---

## 📞 Support and Maintenance

### Monitoring Dashboard
Create CloudWatch dashboard monitoring:
- Lambda function performance
- API Gateway metrics
- WebSocket connection health
- AI processing latency
- Error rates and alerts

### Regular Maintenance
- **Weekly**: Review CloudWatch logs and metrics
- **Monthly**: Analyze costs and optimize resources
- **Quarterly**: Update Lambda runtimes and dependencies
- **Annually**: Security review and access audit

---

## 🎯 Conclusion

This solution provides a **production-ready, scalable AI assistant** for Amazon Connect that:

- **Automatically processes** customer messages in real-time
- **Delivers intelligent suggestions** to agents instantly
- **Scales seamlessly** with your contact center volume
- **Integrates natively** with Amazon Connect workflows
- **Maintains enterprise security** standards

The serverless architecture ensures **high availability**, **cost efficiency**, and **minimal operational overhead** while providing **sub-second response times** for AI-powered customer support assistance.

For additional support or customization requirements, please contact your AWS Solutions Architect team.