// Amazon Connect AI Assistant - Vanilla JS Implementation
class AmazonConnectAI {
    constructor() {
        this.config = {
            ccpUrl: '',
            region: 'us-east-1',
            allowFramedSoftphone: true,
            disableRingtone: false,
            ringtoneUrl: null
        };

        this.state = {
            isInitialized: false,
            messageCount: 0,
            lastMessage: '',
            agentStatus: 'Initializing...',
            contactStatus: 'No active contact',
            ccpInitialized: false
        };

        this.elements = {};
        this.messageIntervals = new Map();

        this.init();
    }

    init() {
        this.bindElements();
        this.bindEvents();
        this.showConfigScreen();
    }

    bindElements() {
        // Configuration elements
        this.elements.configScreen = document.getElementById('configScreen');
        this.elements.configForm = document.getElementById('configForm');
        this.elements.ccpUrlInput = document.getElementById('ccpUrl');
        this.elements.regionSelect = document.getElementById('region');
        this.elements.allowFramedSoftphoneCheckbox = document.getElementById('allowFramedSoftphone');

        // Main app elements
        this.elements.mainApp = document.getElementById('mainApp');
        this.elements.ccpContainer = document.getElementById('ccpContainer');
        this.elements.loadingScreen = document.getElementById('loadingScreen');
        this.elements.loadingSubtitle = document.getElementById('loadingSubtitle');

        // Status elements
        this.elements.agentStatus = document.getElementById('agentStatus');
        this.elements.contactStatus = document.getElementById('contactStatus');
        this.elements.messageCount = document.getElementById('messageCount');
        this.elements.connectionStatus = document.getElementById('connectionStatus');
        this.elements.connectionLabel = document.getElementById('connectionLabel');

        // Message elements
        this.elements.messageSection = document.getElementById('messageSection');
        this.elements.lastMessage = document.getElementById('lastMessage');
        this.elements.aiSuggestion = document.getElementById('aiSuggestion');
        this.elements.manualMessage = document.getElementById('manualMessage');

        // Button elements
        this.elements.configButton = document.getElementById('configButton');
        this.elements.processButton = document.getElementById('processButton');
        this.elements.testButton = document.getElementById('testButton');

        // System status elements
        this.elements.ccpStatus = document.getElementById('ccpStatus');
        this.elements.monitoringStatus = document.getElementById('monitoringStatus');
    }

    bindEvents() {
        // Configuration form
        this.elements.configForm.addEventListener('submit', (e) => this.handleConfigSubmit(e));

        // Main app buttons
        this.elements.configButton.addEventListener('click', () => this.showConfigScreen());
        this.elements.processButton.addEventListener('click', () => this.processManualMessage());
        this.elements.testButton.addEventListener('click', () => this.testRandomMessage());

        // Manual message input
        this.elements.manualMessage.addEventListener('input', () => {
            this.elements.processButton.disabled = !this.elements.manualMessage.value.trim();
        });
    }

    showConfigScreen() {
        this.elements.configScreen.style.display = 'flex';
        this.elements.mainApp.style.display = 'none';

        // Reset state
        this.state.isInitialized = false;
        this.state.ccpInitialized = false;
        this.clearMessageIntervals();
    }

    showMainApp() {
        this.elements.configScreen.style.display = 'none';
        this.elements.mainApp.style.display = 'flex';
        this.elements.mainApp.classList.add('fade-in');
    }

    handleConfigSubmit(e) {
        e.preventDefault();

        const ccpUrl = this.elements.ccpUrlInput.value.trim();
        if (!ccpUrl || ccpUrl === 'https://your-instance-name.my.connect.aws/ccp-v2/') {
            alert('Please enter a valid Amazon Connect CCP URL');
            return;
        }

        // Update configuration
        this.config.ccpUrl = ccpUrl;
        this.config.region = this.elements.regionSelect.value;
        this.config.allowFramedSoftphone = this.elements.allowFramedSoftphoneCheckbox.checked;

        this.showMainApp();
        this.initializeAmazonConnect();
    }

    async initializeAmazonConnect() {
        try {
            this.updateLoadingStatus('Initializing Amazon Connect CCP...');
            console.log('🚀 Initializing Amazon Connect...');

            // Simple initialization like the working version
            this.initializeCCP();

        } catch (error) {
            console.error('❌ Amazon Connect initialization failed:', error);
            this.updateAgentStatus('Connection failed');
            this.updateLoadingStatus('Connection failed - check configuration');
        }
    }

    initializeCCP() {
        try {
            if (this.state.ccpInitialized) return;

            console.log('🎬 Initializing Amazon Connect CCP...');
            this.updateAgentStatus('Connecting to Amazon Connect...');

            // Initialize the CCP with streaming support
            connect.core.initCCP(this.elements.ccpContainer, {
                ccpUrl: this.config.ccpUrl,
                loginPopup: true,
                loginPopupAutoClose: true,
                loginOptions: {
                    autoClose: true,
                    height: 600,
                    width: 400,
                    top: 0,
                    left: 0
                },
                region: this.config.region,
                softphone: {
                    allowFramedSoftphone: this.config.allowFramedSoftphone,
                    disableRingtone: this.config.disableRingtone,
                    ringtoneUrl: this.config.ringtoneUrl,
                    disableEchoCancellation: false,
                    allowFramedVideoCall: true,
                    allowFramedScreenSharing: true,
                    allowFramedScreenSharingPopUp: true,
                    VDIPlatform: null,
                    allowEarlyGum: true
                },
                task: {
                    disableRingtone: false,
                    ringtoneUrl: this.config.ringtoneUrl
                },
                pageOptions: {
                    enableAudioDeviceSettings: false,
                    enableVideoDeviceSettings: false,
                    enablePhoneTypeSettings: true
                },
                shouldAddNamespaceToLogs: false,
                ccpAckTimeout: 5000,
                ccpSynTimeout: 3000,
                ccpLoadTimeout: 10000
            });

            this.state.ccpInitialized = true;
            this.hideLoadingScreen();
            this.setupConnectCallbacks();
            this.connectWebSocket();

        } catch (error) {
            console.error('❌ CCP initialization failed:', error);
            this.updateAgentStatus('CCP initialization failed');
        }
    }

    setupConnectCallbacks() {
        // Agent callback
        window.connect.agent((agent) => {
            console.log('👤 Agent connected:', agent.getName());
            this.updateAgentStatus(`Connected: ${agent.getName()}`);
            this.updateConnectionStatus(true);

            // Monitor agent state changes
            agent.onStateChange((agentStateChange) => {
                console.log('Agent state changed:', agentStateChange.newState);
                this.updateAgentStatus(`${agent.getName()} - ${agentStateChange.newState}`);
            });
        });

        // Contact callback
        window.connect.contact((contact) => {
            console.log('📞 Contact event:', contact.getContactId());

            if (contact.getType() === window.connect.ContactType.CHAT) {
                this.updateContactStatus(`Chat: ${contact.getContactId()}`);
                this.setupChatMonitoring(contact);
            } else if (contact.getType() === window.connect.ContactType.VOICE) {
                this.updateContactStatus(`Voice: ${contact.getContactId()}`);
            }

            // Handle contact end
            contact.onEnded(() => {
                console.log('📴 Contact ended');
                this.updateContactStatus('No active contact');
                this.clearLastMessage();
                this.clearMessageInterval(contact.getContactId());
            });
        });
    }

    setupChatMonitoring(contact) {
        const contactId = contact.getContactId();

        // Clear any existing interval for this contact
        this.clearMessageInterval(contactId);

        console.log('🔔 Starting automatic chat monitoring for contact:', contactId);
        this.updateContactStatus(`Chat: ${contactId} - Auto-monitoring active`);

        // CRITICAL: Subscribe to WebSocket immediately when contact starts
        this.subscribeToContact(contactId);

        const monitorMessages = () => {
            try {
                contact.getTranscript({
                    success: (data) => {
                        if (data && data.transcript && data.transcript.length > 0) {
                            const messages = data.transcript;
                            const customerMessages = messages.filter(msg =>
                                msg.ParticipantRole === 'CUSTOMER' &&
                                msg.Type === 'MESSAGE'
                            );

                            if (customerMessages.length > 0) {
                                const latestMessage = customerMessages[customerMessages.length - 1];

                                // Only process new messages automatically
                                if (latestMessage.Content !== this.state.lastMessage) {
                                    console.log('🔔 New customer message detected:', latestMessage.Content);
                                    this.handleNewMessage(latestMessage.Content, contact);
                                }
                            }
                        }
                    },
                    failure: (err) => {
                        console.warn('Failed to get transcript:', err);
                    }
                });
            } catch (error) {
                console.warn('Transcript monitoring error:', error);
            }
        };

        // Start monitoring messages every 2 seconds for real-time detection
        const interval = setInterval(monitorMessages, 2000);
        this.messageIntervals.set(contactId, interval);

        console.log('✅ Automatic chat monitoring active for contact:', contactId);

        // Update UI to show monitoring is active
        if (this.elements.monitoringStatus) {
            this.elements.monitoringStatus.textContent = '✅ Chat monitoring active - Auto-processing messages';
        }
    }

    handleNewMessage(message, contact) {
        this.state.lastMessage = message;
        this.state.messageCount++;

        console.log(`📨 Processing message ${this.state.messageCount}: "${message}"`);

        this.updateLastMessage(message);
        this.updateMessageCount();

        // Automatically process with AI - no manual intervention needed
        this.processMessage(message, contact);

        // Update status to show automatic processing
        this.updateContactStatus(`Chat: ${contact.getContactId()} - Processing message ${this.state.messageCount}`);
    }

    async processMessage(message, contact) {
        try {
            this.updateAISuggestion(`🔄 Message will be processed via streaming pipeline...`);
            console.log(`📡 Message sent to streaming pipeline: "${message}"`);
            
            // Message is automatically streamed via StartContactStreaming
            // AI suggestion will come back via WebSocket
            this.waitForAISuggestion(contact.getContactId());
            
        } catch (error) {
            console.error('❌ Error in streaming pipeline:', error);
            this.updateAISuggestion('❌ Error in streaming pipeline');
        }
    }

    subscribeToContact(contactId) {
        console.log('🔌 Subscribing to contact:', contactId);
        
        // Ensure WebSocket is connected
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            console.log('⚠️ WebSocket not connected, attempting to connect...');
            this.connectWebSocket();
            
            // Wait for connection and then subscribe
            setTimeout(() => {
                this.subscribeToContact(contactId);
            }, 1000);
            return;
        }
        
        // Send subscription message
        const subscribeMessage = {
            action: 'subscribe',
            contactId: contactId
        };
        
        console.log('📤 Sending WebSocket subscription:', subscribeMessage);
        this.websocket.send(JSON.stringify(subscribeMessage));
    }

    waitForAISuggestion(contactId) {
        // This method is now simplified since subscription happens immediately
        console.log('🤖 Waiting for AI suggestion for contact:', contactId);
    }

    connectWebSocket() {
        try {
            console.log('🔌 Attempting WebSocket connection...');
            this.websocket = new WebSocket('wss://8aflb62rj5.execute-api.us-east-1.amazonaws.com/prod');
            
            this.websocket.onopen = () => {
                console.log('✅ WebSocket connected successfully!');
                // Update UI to show WebSocket is connected
                if (this.elements.monitoringStatus) {
                    this.elements.monitoringStatus.textContent = '✅ WebSocket connected - Ready for AI suggestions';
                }
            };
            
            this.websocket.onmessage = (event) => {
                console.log('📨 WebSocket message received:', event.data);
                const data = JSON.parse(event.data);
                if (data.suggestion) {
                    this.updateAISuggestion(`💡 ${data.suggestion}`);
                    console.log('✅ AI suggestion received via WebSocket:', data.suggestion);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                if (this.elements.monitoringStatus) {
                    this.elements.monitoringStatus.textContent = '❌ WebSocket connection failed';
                }
            };
            
            this.websocket.onclose = (event) => {
                console.log('🔌 WebSocket disconnected:', event.code, event.reason);
                if (this.elements.monitoringStatus) {
                    this.elements.monitoringStatus.textContent = '⚠️ WebSocket disconnected';
                }
            };
            
        } catch (error) {
            console.error('❌ WebSocket connection failed:', error);
        }
    }

    async processManualMessage() {
        const message = this.elements.manualMessage.value.trim();
        if (!message) return;

        this.handleNewMessage(message, null);
    }

    async testRandomMessage() {
        const testMessages = [
            "Hi, I'm having trouble logging into my account",
            "My order hasn't arrived yet and it's been a week",
            "I want to cancel my subscription",
            "The app keeps crashing on my phone",
            "I was charged twice for the same purchase",
            "How do I reset my password?",
            "I need help with returning an item"
        ];

        const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
        this.handleNewMessage(randomMessage, null);
    }

    // UI Update Methods
    updateLoadingStatus(status) {
        this.elements.loadingSubtitle.textContent = status;
    }

    hideLoadingScreen() {
        this.elements.loadingScreen.style.display = 'none';
        this.state.isInitialized = true;
        this.updateConnectionStatus(true);
    }

    updateAgentStatus(status) {
        this.state.agentStatus = status;
        this.elements.agentStatus.textContent = status;
    }

    updateContactStatus(status) {
        this.state.contactStatus = status;
        this.elements.contactStatus.textContent = status;
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.textContent = '✓';
            this.elements.connectionLabel.textContent = 'Connected';
            this.elements.ccpStatus.textContent = '✅ Amazon Connect CCP';
        } else {
            this.elements.connectionStatus.textContent = '⏳';
            this.elements.connectionLabel.textContent = 'Connecting';
            this.elements.ccpStatus.textContent = '⏳ Amazon Connect CCP';
        }
    }

    updateLastMessage(message) {
        this.elements.lastMessage.textContent = `"${message}"`;
        this.elements.messageSection.style.display = 'block';
        this.elements.messageSection.classList.add('slide-up');
    }

    updateAISuggestion(suggestion) {
        this.elements.aiSuggestion.textContent = suggestion;
        this.elements.aiSuggestion.classList.add('slide-up');
    }

    updateMessageCount() {
        this.elements.messageCount.textContent = this.state.messageCount;
    }

    clearLastMessage() {
        this.state.lastMessage = '';
        this.elements.messageSection.style.display = 'none';
        this.elements.manualMessage.value = '';
    }

    clearMessageInterval(contactId) {
        if (this.messageIntervals.has(contactId)) {
            clearInterval(this.messageIntervals.get(contactId));
            this.messageIntervals.delete(contactId);
        }
    }

    clearMessageIntervals() {
        this.messageIntervals.forEach((interval) => clearInterval(interval));
        this.messageIntervals.clear();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Amazon Connect AI Assistant - Vanilla JS Version');
    new AmazonConnectAI();
});