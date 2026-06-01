import { db, auth } from './firebase';
import {
  collection,
  getDocs,
  setDoc,
  addDoc,
  doc,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { Friend } from './friends';

export interface ChatRoom {
  id: string;
  participantIds: string[];
  participants: Record<string, { name: string; avatarId: string; status: string }>;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: number;
  };
  lastUpdated: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: number;
}

// Memory cache for mock messages during offline/local testing
const LOCAL_MOCK_CHATS: ChatRoom[] = [
  {
    id: 'friend_alex_user',
    participantIds: ['guest', 'friend_alex'],
    participants: {
      guest: { name: 'You', avatarId: 'avatar1', status: 'online' },
      friend_alex: { name: 'Alex Johnson', avatarId: 'avatar2', status: 'watching' }
    },
    lastMessage: {
      text: "I'm watching Stranger Things right now, join the lobby!",
      senderId: 'friend_alex',
      timestamp: Date.now() - 1000 * 60 * 5 // 5m ago
    },
    lastUpdated: Date.now() - 1000 * 60 * 5
  },
  {
    id: 'friend_sarah_user',
    participantIds: ['guest', 'friend_sarah'],
    participants: {
      guest: { name: 'You', avatarId: 'avatar1', status: 'online' },
      friend_sarah: { name: 'Sarah Miller', avatarId: 'avatar3', status: 'online' }
    },
    lastMessage: {
      text: 'Are we watching Wednesday tonight?',
      senderId: 'friend_sarah',
      timestamp: Date.now() - 1000 * 60 * 30 // 30m ago
    },
    lastUpdated: Date.now() - 1000 * 60 * 30
  },
  {
    id: 'friend_marcus_user',
    participantIds: ['guest', 'friend_marcus'],
    participants: {
      guest: { name: 'You', avatarId: 'avatar1', status: 'online' },
      friend_marcus: { name: 'Marcus Vance', avatarId: 'avatar4', status: 'watching' }
    },
    lastMessage: {
      text: 'Bro, that movie was epic!',
      senderId: 'guest',
      timestamp: Date.now() - 1000 * 60 * 120 // 2h ago
    },
    lastUpdated: Date.now() - 1000 * 60 * 120
  }
];

const LOCAL_MOCK_MESSAGES: Record<string, Message[]> = {
  friend_alex_user: [
    {
      id: 'm1',
      senderId: 'friend_alex',
      senderName: 'Alex Johnson',
      senderAvatar: 'avatar2',
      text: 'Hey! Did you check out the new season of Stranger Things?',
      timestamp: Date.now() - 1000 * 60 * 15
    },
    {
      id: 'm2',
      senderId: 'guest',
      senderName: 'You',
      senderAvatar: 'avatar1',
      text: 'Not yet! Is it good?',
      timestamp: Date.now() - 1000 * 60 * 10
    },
    {
      id: 'm3',
      senderId: 'friend_alex',
      senderName: 'Alex Johnson',
      senderAvatar: 'avatar2',
      text: "I'm watching Stranger Things right now, join the lobby!",
      timestamp: Date.now() - 1000 * 60 * 5
    }
  ],
  friend_sarah_user: [
    {
      id: 's1',
      senderId: 'guest',
      senderName: 'You',
      senderAvatar: 'avatar1',
      text: 'Hey Sarah, what are the plans for tonight?',
      timestamp: Date.now() - 1000 * 60 * 45
    },
    {
      id: 's2',
      senderId: 'friend_sarah',
      senderName: 'Sarah Miller',
      senderAvatar: 'avatar3',
      text: 'Are we watching Wednesday tonight?',
      timestamp: Date.now() - 1000 * 60 * 30
    }
  ],
  friend_marcus_user: [
    {
      id: 'v1',
      senderId: 'friend_marcus',
      senderName: 'Marcus Vance',
      senderAvatar: 'avatar4',
      text: 'Yo, did you finish the movie?',
      timestamp: Date.now() - 1000 * 60 * 150
    },
    {
      id: 'v2',
      senderId: 'guest',
      senderName: 'You',
      senderAvatar: 'avatar1',
      text: 'Bro, that movie was epic!',
      timestamp: Date.now() - 1000 * 60 * 120
    }
  ]
};

// Live listeners cache to trigger updates manually on mock changes
const activeChatListeners: Set<(chats: ChatRoom[]) => void> = new Set();
const activeMessageListeners: Map<string, Set<(messages: Message[]) => void>> = new Map();

export const MessagingService = {
  /**
   * Generates a unique chat room ID for 2 participants.
   * Sorted alphabetically so it's deterministic.
   */
  getChatId(uid1: string, uid2: string): string {
    const sorted = [uid1, uid2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  },

  /**
   * Initializes a chat room in Firestore between current user and a friend.
   */
  async getOrCreateChatRoom(friend: Friend, currentProfile: any): Promise<string> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const chatId = this.getChatId(currentUid, friend.uid);

    // If both are mock accounts, check if mock data is initialized
    if (currentUid === 'guest' || friend.uid.startsWith('friend_')) {
      const existing = LOCAL_MOCK_CHATS.find(c => c.id === chatId);
      if (!existing) {
        // Seed a new mock chat
        const newChat: ChatRoom = {
          id: chatId,
          participantIds: [currentUid, friend.uid],
          participants: {
            [currentUid]: {
              name: currentProfile?.name || 'You',
              avatarId: currentProfile?.avatarId || 'avatar1',
              status: 'online'
            },
            [friend.uid]: {
              name: friend.name,
              avatarId: friend.avatarId,
              status: friend.status || 'offline'
            }
          },
          lastUpdated: Date.now()
        };
        LOCAL_MOCK_CHATS.push(newChat);
        LOCAL_MOCK_MESSAGES[chatId] = [];
        
        // Notify any active chat listeners
        activeChatListeners.forEach(listener => listener([...LOCAL_MOCK_CHATS]));
      }
      return chatId;
    }

    try {
      const chatDocRef = doc(db, 'chats', chatId);
      const docSnap = await getDoc(chatDocRef);

      if (!docSnap.exists()) {
        await setDoc(chatDocRef, {
          id: chatId,
          participantIds: [currentUid, friend.uid],
          participants: {
            [currentUid]: {
              name: currentProfile?.name || 'You',
              avatarId: currentProfile?.avatarId || 'avatar1',
              status: 'online'
            },
            [friend.uid]: {
              name: friend.name,
              avatarId: friend.avatarId,
              status: friend.status || 'offline'
            }
          },
          lastUpdated: serverTimestamp()
        });
      }
      return chatId;
    } catch (e) {
      console.warn('[MessagingService] Firestore error in getOrCreateChatRoom, using local mock:', e);
      return chatId;
    }
  },

  /**
   * Realtime subscription to conversations list
   */
  subscribeToChats(callback: (chats: ChatRoom[]) => void) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid === 'guest') {
      // Local testing tracking
      activeChatListeners.add(callback);
      callback([...LOCAL_MOCK_CHATS].sort((a, b) => b.lastUpdated - a.lastUpdated));
      return () => {
        activeChatListeners.delete(callback);
      };
    }

    try {
      const q = query(
        collection(db, 'chats'),
        where('participantIds', 'array-contains', currentUid),
        orderBy('lastUpdated', 'desc')
      );

      return onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
          callback([...LOCAL_MOCK_CHATS]);
          return;
        }

        const chats = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            participantIds: data.participantIds,
            participants: data.participants,
            lastMessage: data.lastMessage ? {
              text: data.lastMessage.text,
              senderId: data.lastMessage.senderId,
              timestamp: data.lastMessage.timestamp?.toMillis?.() || Date.now()
            } : undefined,
            lastUpdated: data.lastUpdated?.toMillis?.() || Date.now()
          } as ChatRoom;
        });
        callback(chats);
      }, (error) => {
        console.warn('[MessagingService] error subscribing to chats, falling back to local mocks:', error);
        callback([...LOCAL_MOCK_CHATS]);
      });
    } catch (e) {
      console.warn('[MessagingService] Firestore crash in subscribeToChats, using mocks:', e);
      callback([...LOCAL_MOCK_CHATS]);
      return () => {};
    }
  },

  /**
   * Realtime subscription to message stream for a specific chat room
   */
  subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
    const currentUid = auth.currentUser?.uid;
    const isMock = !currentUid || currentUid === 'guest' || chatId.includes('friend_');

    if (isMock) {
      if (!activeMessageListeners.has(chatId)) {
        activeMessageListeners.set(chatId, new Set());
      }
      activeMessageListeners.get(chatId)!.add(callback);
      
      const mockMsgs = LOCAL_MOCK_MESSAGES[chatId] || [];
      callback([...mockMsgs].sort((a, b) => a.timestamp - b.timestamp));

      return () => {
        const listeners = activeMessageListeners.get(chatId);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) activeMessageListeners.delete(chatId);
        }
      };
    }

    try {
      const messagesColRef = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesColRef, orderBy('timestamp', 'asc'), limit(100));

      return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            senderId: data.senderId,
            senderName: data.senderName,
            senderAvatar: data.senderAvatar,
            text: data.text,
            timestamp: data.timestamp?.toMillis?.() || Date.now()
          } as Message;
        });
        callback(messages);
      }, (error) => {
        console.warn('[MessagingService] Error fetching messages, returning mocks:', error);
        callback(LOCAL_MOCK_MESSAGES[chatId] || []);
      });
    } catch (e) {
      console.warn('[MessagingService] Firestore exception in messages, using mocks:', e);
      callback(LOCAL_MOCK_MESSAGES[chatId] || []);
      return () => {};
    }
  },

  /**
   * Sends a text message to a chat room
   */
  async sendMessage(chatId: string, text: string, currentProfile: any): Promise<void> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const isMock = currentUid === 'guest' || chatId.includes('friend_');

    if (isMock) {
      // Local append
      const newMsg: Message = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        senderId: currentUid,
        senderName: currentProfile?.name || 'You',
        senderAvatar: currentProfile?.avatarId || 'avatar1',
        text: text.trim(),
        timestamp: Date.now()
      };

      if (!LOCAL_MOCK_MESSAGES[chatId]) {
        LOCAL_MOCK_MESSAGES[chatId] = [];
      }
      LOCAL_MOCK_MESSAGES[chatId].push(newMsg);

      // Update mock chat metadata
      const chat = LOCAL_MOCK_CHATS.find(c => c.id === chatId);
      if (chat) {
        chat.lastMessage = {
          text: text.trim(),
          senderId: currentUid,
          timestamp: Date.now()
        };
        chat.lastUpdated = Date.now();
      }

      // Notify message subscribers
      const msgListeners = activeMessageListeners.get(chatId);
      if (msgListeners) {
        msgListeners.forEach(listener => listener([...LOCAL_MOCK_MESSAGES[chatId]]));
      }

      // Notify conversation list subscribers
      activeChatListeners.forEach(listener => {
        listener([...LOCAL_MOCK_CHATS].sort((a, b) => b.lastUpdated - a.lastUpdated));
      });

      return;
    }

    try {
      const messagesColRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesColRef, {
        senderId: currentUid,
        senderName: currentProfile?.name || 'You',
        senderAvatar: currentProfile?.avatarId || 'avatar1',
        text: text.trim(),
        timestamp: serverTimestamp()
      });

      // Update chat details
      const chatDocRef = doc(db, 'chats', chatId);
      await setDoc(chatDocRef, {
        lastMessage: {
          text: text.trim(),
          senderId: currentUid,
          timestamp: serverTimestamp()
        },
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('[MessagingService] Failed to send message to Firestore:', e);
      // Failover to local mock appending to keep the UI interactive and working
      await this.sendMessage(chatId + '_local_failover', text, currentProfile);
    }
  }
};
