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

export interface Friend {
  uid: string;
  name: string;
  avatarId: string;
  status: 'online' | 'offline' | 'watching';
  watchingTitle?: string;
  watchingTmdbId?: string;
}

export interface FriendActivity {
  id: string;
  uid: string;
  userName: string;
  avatarId: string;
  type: 'comment' | 'reaction' | 'sticker';
  content: string; // The comment text, emoji, or sticker identifier
  timestamp: any;
}

export interface WatchParty {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  tmdbId: string;
  type: 'movie' | 'tv';
  title: string;
  seasonNum?: number;
  episodeNum?: number;
  isPlaying: boolean;
  currentTime: number;
  status: 'scheduled' | 'waiting' | 'playing' | 'ended';
  scheduledTime?: any;
  createdAt: any;
  lastUpdated: any;
  participants: Record<string, { name: string; avatarId: string; lastActive: number }>;
}

export interface SharedMovie {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  tmdbId: string;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string;
  timestamp: any;
}

export interface CollaborativeWatchlist {
  id: string;
  name: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  members: string[]; // UIDs
  movies: Record<string, {
    tmdbId: string;
    title: string;
    posterPath: string;
    type: 'movie' | 'tv';
    addedBy: string;
    addedByName: string;
    votes: Record<string, 'up' | 'down'>; // uid -> type
    voteCount: number; // calculated net vote
  }>;
}

// Global reference mapping for avatar assets to display friend profiles
export const FRIEND_AVATARS: Record<string, string> = {
  avatar1: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
  avatar2: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
  avatar3: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop',
  avatar4: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
  avatar5: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
  avatar6: 'https://images.unsplash.com/photo-1527983359383-4758693f760c?w=100&h=100&fit=crop',
};

// Seed Data for Friends in case database is empty
const MOCK_FRIENDS: Friend[] = [
  { uid: 'friend_alex', name: 'Alex Johnson', avatarId: 'avatar2', status: 'watching', watchingTitle: 'Stranger Things', watchingTmdbId: '66732' },
  { uid: 'friend_sarah', name: 'Sarah Miller', avatarId: 'avatar3', status: 'online' },
  { uid: 'friend_marcus', name: 'Marcus Vance', avatarId: 'avatar4', status: 'watching', watchingTitle: 'Wednesday', watchingTmdbId: '119051' },
  { uid: 'friend_emily', name: 'Emily Chen', avatarId: 'avatar5', status: 'offline' },
  { uid: 'friend_danny', name: 'Daniel Rose', avatarId: 'avatar6', status: 'watching', watchingTitle: 'The Witcher', watchingTmdbId: '90405' },
];

export const FriendsService = {
  /**
   * Retrieves the friends list for the current logged-in user.
   * If the user's friend subcollection does not exist in Firestore,
   * it seeds it with mock accounts to ensure the UI is fully functional.
   */
  async getFriends(): Promise<Friend[]> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return MOCK_FRIENDS;

    try {
      const friendsColRef = collection(db, 'users', currentUid, 'friends');
      const snapshot = await getDocs(friendsColRef);
      
      if (snapshot.empty) {
        console.log('[FriendsService] No friends in Firestore, seeding default connections...');
        // Seed database
        for (const friend of MOCK_FRIENDS) {
          await setDoc(doc(db, 'users', currentUid, 'friends', friend.uid), friend);
          // Also set global details for query convenience
          await setDoc(doc(db, 'users', friend.uid), {
            name: friend.name,
            avatarId: friend.avatarId,
            lastWatchedTmdbId: friend.watchingTmdbId,
            lastWatchedTitle: friend.watchingTitle,
          }, { merge: true });
        }
        return MOCK_FRIENDS;
      }

      return snapshot.docs.map(doc => doc.data() as Friend);
    } catch (e) {
      console.warn('[FriendsService] Failed to fetch friends from Firestore, falling back to mock:', e);
      return MOCK_FRIENDS;
    }
  },

  /**
   * Realtime listener for friends list updates (watching status, presence, etc.)
   */
  subscribeToFriends(callback: (friends: Friend[]) => void) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      callback(MOCK_FRIENDS);
      return () => {};
    }

    const friendsColRef = collection(db, 'users', currentUid, 'friends');
    return onSnapshot(friendsColRef, (snapshot) => {
      if (snapshot.empty) {
        // Seed first
        this.getFriends().then(callback);
        return;
      }
      const friends = snapshot.docs.map(doc => doc.data() as Friend);
      callback(friends);
    }, (err) => {
      console.error('[FriendsService] Error subscribing to friends:', err);
      callback(MOCK_FRIENDS);
    });
  },

  /**
   * Curated recommendation engine:
   * Analyzes what movies/shows your friends are watching or have watched recently,
   * then aggregates, scores, and resolves them from TMDB.
   */
  async getFriendsWatchedRecommendations(): Promise<any[]> {
    try {
      const friends = await this.getFriends();
      const watchedMap: Record<string, { tmdbId: string; title: string; count: number; friends: Friend[] }> = {};

      friends.forEach(friend => {
        if (friend.watchingTmdbId && friend.watchingTitle) {
          const id = friend.watchingTmdbId;
          if (!watchedMap[id]) {
            watchedMap[id] = {
              tmdbId: id,
              title: friend.watchingTitle,
              count: 0,
              friends: []
            };
          }
          watchedMap[id].count += 1;
          watchedMap[id].friends.push(friend);
        }
      });

      // Map to array and resolve metadata
      const list = Object.values(watchedMap).sort((a, b) => b.count - a.count);
      
      const recommendations: any[] = [];
      const { fetchMovieDetails } = require('./tmdb');

      for (const item of list) {
        try {
          const details = await fetchMovieDetails(item.tmdbId, 'tv'); // Default to TV for mocks
          if (details) {
            recommendations.push({
              ...details,
              media_type: 'tv',
              friendsWatching: item.friends,
            });
          }
        } catch (_) {
          // Fallback to movie
          try {
            const details = await fetchMovieDetails(item.tmdbId, 'movie');
            if (details) {
              recommendations.push({
                ...details,
                media_type: 'movie',
                friendsWatching: item.friends,
              });
            }
          } catch (err) {
            console.warn(`[FriendsService] Failed to resolve TMDB metadata for recommendation ${item.tmdbId}:`, err);
          }
        }
      }

      // Add a couple of highly rated static fallbacks if recommendations list is low
      if (recommendations.length < 3) {
        const fallbacks = [
          { tmdbId: '66732', title: 'Stranger Things', type: 'tv', friendIndex: 0 },
          { tmdbId: '119051', title: 'Wednesday', type: 'tv', friendIndex: 2 },
          { tmdbId: '90405', title: 'The Witcher', type: 'tv', friendIndex: 4 }
        ];

        for (const item of fallbacks) {
          if (!recommendations.some(r => r.id.toString() === item.tmdbId)) {
            try {
              const details = await fetchMovieDetails(item.tmdbId, item.type);
              if (details) {
                recommendations.push({
                  ...details,
                  media_type: item.type,
                  friendsWatching: [friends[item.friendIndex] || friends[0]],
                });
              }
            } catch (_) {}
          }
        }
      }

      return recommendations;
    } catch (error) {
      console.error('[FriendsService] Recommendation resolution failed:', error);
      return [];
    }
  },

  /**
   * Listen to real-time comments, emoji reactions, and stickers sent on a movie detail screen.
   */
  subscribeToMovieActivity(tmdbId: string, callback: (activities: FriendActivity[]) => void) {
    const activityColRef = collection(db, 'movies', tmdbId, 'activity');
    const q = query(activityColRef, orderBy('timestamp', 'asc'), limit(50));

    return onSnapshot(q, (snapshot) => {
      const activities: FriendActivity[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        activities.push({
          id: doc.id,
          uid: data.uid,
          userName: data.userName,
          avatarId: data.avatarId,
          type: data.type,
          content: data.content,
          timestamp: data.timestamp?.toMillis?.() || Date.now(),
        });
      });

      // Seed mock comments if this is the first time anyone is opening the movie detail screen
      if (activities.length === 0) {
        this.seedMovieActivity(tmdbId).then(callback);
        return;
      }

      callback(activities);
    }, (error) => {
      console.warn('[FriendsService] Error subscribing to movie activity:', error);
      callback([]);
    });
  },

  /**
   * Send a new text comment, quick emoji reaction, or floating sticker.
   */
  async sendMovieActivity(tmdbId: string, type: 'comment' | 'reaction' | 'sticker', content: string, profile: any) {
    try {
      const activityColRef = collection(db, 'movies', tmdbId, 'activity');
      await addDoc(activityColRef, {
        uid: profile?.id || 'dev-guest',
        userName: profile?.name || 'Anonymous User',
        avatarId: profile?.avatarId || 'avatar1',
        type,
        content,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error('[FriendsService] Failed to send activity:', e);
    }
  },

  /**
   * Seed some comments and reviews for the movie so the social feed doesn't start empty
   */
  async seedMovieActivity(tmdbId: string): Promise<FriendActivity[]> {
    const defaultComments = [
      { userName: 'Alex Johnson', avatarId: 'avatar2', type: 'comment', content: 'Wow! This show is absolutely insane. You guys have to check out the second episode.' },
      { userName: 'Marcus Vance', avatarId: 'avatar4', type: 'comment', content: 'Brilliant cinematography. Acting is top notch!' },
      { userName: 'Sarah Miller', avatarId: 'avatar3', type: 'sticker', content: '🔥' },
      { userName: 'Sarah Miller', avatarId: 'avatar3', type: 'comment', content: 'I watched this last weekend. Highly recommended!' },
    ];

    const seeded: FriendActivity[] = [];
    try {
      const activityCol = collection(db, 'movies', tmdbId, 'activity');
      let index = 0;
      for (const item of defaultComments) {
        const itemDoc = {
          uid: `friend_${item.userName.toLowerCase().replace(' ', '_')}`,
          userName: item.userName,
          avatarId: item.avatarId,
          type: item.type as any,
          content: item.content,
          timestamp: new Date(Date.now() - (defaultComments.length - index) * 60 * 1000), // Spaced by minutes
        };

        const docRef = await addDoc(activityCol, {
          ...itemDoc,
          timestamp: serverTimestamp(),
        });
        
        seeded.push({
          id: docRef.id,
          ...itemDoc,
          timestamp: itemDoc.timestamp.getTime()
        });
        index++;
      }
    } catch (err) {
      console.warn('[FriendsService] Seeding movie activity failed:', err);
    }
    return seeded;
  },

  /* ── WATCH PARTY FUNCTIONS ── */
  async createWatchParty(profile: any, tmdbId: string, type: 'movie' | 'tv', title: string, seasonNum?: number, episodeNum?: number): Promise<string> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const partyRef = doc(collection(db, 'watch_parties'));
    const partyData: WatchParty = {
      id: partyRef.id,
      hostId: currentUid,
      hostName: profile?.name || 'Host',
      hostAvatar: profile?.avatarId || 'avatar1',
      tmdbId,
      type,
      title,
      seasonNum,
      episodeNum,
      isPlaying: false,
      currentTime: 0,
      status: 'waiting',
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      participants: {
        [currentUid]: {
          name: profile?.name || 'Host',
          avatarId: profile?.avatarId || 'avatar1',
          lastActive: Date.now()
        }
      }
    };
    await setDoc(partyRef, partyData);
    // Write dynamic participant record
    await this.updateWatchPartyPresence(partyRef.id, profile, 'online');
    return partyRef.id;
  },

  async scheduleWatchParty(profile: any, tmdbId: string, type: 'movie' | 'tv', title: string, scheduledTime: Date, seasonNum?: number, episodeNum?: number): Promise<string> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const partyRef = doc(collection(db, 'watch_parties'));
    const partyData: any = {
      id: partyRef.id,
      hostId: currentUid,
      hostName: profile?.name || 'Host',
      hostAvatar: profile?.avatarId || 'avatar1',
      tmdbId,
      type,
      title,
      isPlaying: false,
      currentTime: 0,
      status: 'scheduled',
      scheduledTime: scheduledTime.toISOString(),
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      participants: {
        [currentUid]: {
          name: profile?.name || 'Host',
          avatarId: profile?.avatarId || 'avatar1',
          lastActive: Date.now()
        }
      }
    };
    // Only include optional fields if they have a value (Firestore rejects undefined)
    if (seasonNum !== undefined) partyData.seasonNum = seasonNum;
    if (episodeNum !== undefined) partyData.episodeNum = episodeNum;
    await setDoc(partyRef, partyData);
    return partyRef.id;
  },

  async startWatchPartyFromWaitingRoom(partyId: string): Promise<void> {
    const partyRef = doc(db, 'watch_parties', partyId);
    await setDoc(partyRef, {
      status: 'playing',
      lastUpdated: serverTimestamp()
    }, { merge: true });
  },

  async joinWatchParty(partyId: string, profile: any): Promise<void> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const partyRef = doc(db, 'watch_parties', partyId);
    const partySnap = await getDoc(partyRef);
    if (!partySnap.exists()) throw new Error('Watch Party not found');
    
    const data = partySnap.data() as WatchParty;
    const participants = {
      ...data.participants,
      [currentUid]: {
        name: profile?.name || 'Anonymous',
        avatarId: profile?.avatarId || 'avatar1',
        lastActive: Date.now()
      }
    };
    await setDoc(partyRef, { participants, lastUpdated: serverTimestamp() }, { merge: true });
    // Write dynamic participant record
    await this.updateWatchPartyPresence(partyId, profile, 'online');
  },

  async updateWatchPartyState(partyId: string, isPlaying: boolean, currentTime: number): Promise<void> {
    const partyRef = doc(db, 'watch_parties', partyId);
    await setDoc(partyRef, {
      isPlaying,
      currentTime,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  },

  subscribeToWatchParty(partyId: string, callback: (party: WatchParty | null) => void) {
    const partyRef = doc(db, 'watch_parties', partyId);
    return onSnapshot(partyRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as WatchParty);
      } else {
        callback(null);
      }
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to watch party:', err);
      callback(null);
    });
  },

  async sendWatchPartyEvent(partyId: string, senderName: string, type: 'play' | 'pause' | 'seek' | 'reaction' | 'chat', currentTime: number, extraData?: any): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid || 'guest';
      const eventsCol = collection(db, 'watch_parties', partyId, 'events');
      await addDoc(eventsCol, {
        senderId: currentUid,
        senderName,
        type,
        currentTime,
        timestamp: serverTimestamp(),
        ...extraData
      });
    } catch (e) {
      console.error('[FriendsService] Failed to send watch party event:', e);
    }
  },

  subscribeToWatchPartyChat(partyId: string, callback: (events: any[]) => void) {
    const eventsCol = collection(db, 'watch_parties', partyId, 'events');
    const q = query(eventsCol, orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docObj => {
        const data = docObj.data();
        list.push({
          id: docObj.id,
          senderId: data.senderId,
          senderName: data.senderName,
          type: data.type,
          currentTime: data.currentTime,
          content: data.content || data.text || '',
          timestamp: data.timestamp?.toMillis?.() || Date.now()
        });
      });
      callback(list.reverse());
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to watch party chat:', err);
      callback([]);
    });
  },

  subscribeToWatchPartyEvents(partyId: string, callback: (event: any) => void) {
    const eventsCol = collection(db, 'watch_parties', partyId, 'events');
    const q = query(eventsCol, orderBy('timestamp', 'desc'), limit(1));
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docObj = snapshot.docs[0];
        const data = docObj.data();
        callback({
          id: docObj.id,
          ...data,
          timestamp: data.timestamp?.toMillis?.() || Date.now()
        });
      }
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to watch party events:', err);
    });
  },

  async updateWatchPartyPresence(partyId: string, profile: any, status: 'online' | 'offline'): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid || 'guest';
      const participantRef = doc(db, 'watch_parties', partyId, 'participants', currentUid);
      await setDoc(participantRef, {
        name: profile?.name || 'Anonymous',
        avatarId: profile?.avatarId || 'avatar1',
        status,
        lastActive: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('[FriendsService] Failed to update presence:', e);
    }
  },

  subscribeToWatchPartyParticipants(partyId: string, callback: (participants: any[]) => void) {
    const participantsCol = collection(db, 'watch_parties', partyId, 'participants');
    return onSnapshot(participantsCol, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docObj => {
        const data = docObj.data();
        list.push({
          uid: docObj.id,
          name: data.name,
          avatarId: data.avatarId,
          status: data.status,
          lastActive: data.lastActive?.toMillis?.() || Date.now()
        });
      });
      callback(list);
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to watch party participants:', err);
      callback([]);
    });
  },

  async getActiveWatchParties(): Promise<WatchParty[]> {
    try {
      const q = query(
        collection(db, 'watch_parties'),
        where('status', 'in', ['waiting', 'playing']),
        orderBy('lastUpdated', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const parties: WatchParty[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const lastUpdatedMs = data.lastUpdated?.toMillis?.() || Date.now();
        // Allow up to 4 hours active
        if (Date.now() - lastUpdatedMs < 4 * 60 * 60 * 1000) {
          parties.push(data as WatchParty);
        }
      });
      return parties;
    } catch (e) {
      console.warn('[FriendsService] Failed to fetch active watch parties, using mock:', e);
      return [
        {
          id: 'mock_party_1',
          hostId: 'friend_alex',
          hostName: 'Alex Johnson',
          hostAvatar: 'avatar2',
          tmdbId: '66732',
          type: 'tv',
          title: 'Stranger Things',
          isPlaying: true,
          currentTime: 124,
          status: 'playing',
          createdAt: new Date(),
          lastUpdated: new Date(),
          participants: {
            'friend_alex': { name: 'Alex Johnson', avatarId: 'avatar2', lastActive: Date.now() }
          }
        }
      ];
    }
  },

  async getScheduledWatchParties(): Promise<WatchParty[]> {
    try {
      const q = query(
        collection(db, 'watch_parties'),
        where('status', '==', 'scheduled'),
        orderBy('lastUpdated', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const parties: WatchParty[] = [];
      snapshot.forEach(doc => {
        parties.push(doc.data() as WatchParty);
      });
      return parties;
    } catch (e) {
      console.warn('[FriendsService] Failed to fetch scheduled watch parties, using mock:', e);
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 2);
      return [
        {
          id: 'mock_scheduled_party_1',
          hostId: 'friend_sarah',
          hostName: 'Sarah Miller',
          hostAvatar: 'avatar3',
          tmdbId: '119051',
          type: 'tv',
          title: 'Wednesday',
          isPlaying: false,
          currentTime: 0,
          status: 'scheduled',
          scheduledTime: scheduledTime.toISOString(),
          createdAt: new Date(),
          lastUpdated: new Date(),
          participants: {
            'friend_sarah': { name: 'Sarah Miller', avatarId: 'avatar3', lastActive: Date.now() }
          }
        }
      ];
    }
  },

  /* ── DIRECT MOVIE SHARING FUNCTIONS ── */
  async shareMovieWithFriend(friendUid: string, movie: { id: string; title: string; poster_path: string; type: 'movie' | 'tv' }, profile: any): Promise<void> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const inboxRef = collection(db, 'users', friendUid, 'inbox');
    await addDoc(inboxRef, {
      senderId: currentUid,
      senderName: profile?.name || 'Friend',
      senderAvatar: profile?.avatarId || 'avatar1',
      tmdbId: movie.id,
      type: movie.type,
      title: movie.title,
      posterPath: movie.poster_path,
      timestamp: serverTimestamp()
    });
  },

  subscribeToSharedInbox(callback: (shares: SharedMovie[]) => void) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      callback([
        {
          id: 'share_mock_1',
          senderId: 'friend_marcus',
          senderName: 'Marcus Vance',
          senderAvatar: 'avatar4',
          tmdbId: '119051',
          type: 'tv',
          title: 'Wednesday',
          posterPath: '/path/to/poster',
          timestamp: Date.now() - 1000 * 60 * 30
        }
      ]);
      return () => {};
    }
    const inboxRef = collection(db, 'users', currentUid, 'inbox');
    const q = query(inboxRef, orderBy('timestamp', 'desc'), limit(20));
    return onSnapshot(q, (snapshot) => {
      const shares: SharedMovie[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        shares.push({
          id: doc.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderAvatar: data.senderAvatar,
          tmdbId: data.tmdbId,
          type: data.type,
          title: data.title,
          posterPath: data.posterPath,
          timestamp: data.timestamp?.toMillis?.() || Date.now()
        });
      });
      callback(shares);
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to inbox:', err);
      callback([]);
    });
  },

  /* ── COLLABORATIVE WATCHLISTS ── */
  async createCollaborativeWatchlist(name: string, members: string[], profile: any): Promise<string> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const listRef = doc(collection(db, 'collaborative_watchlists'));
    const listData: CollaborativeWatchlist = {
      id: listRef.id,
      name,
      createdBy: currentUid,
      createdByName: profile?.name || 'Creator',
      createdAt: serverTimestamp(),
      members: [currentUid, ...members],
      movies: {}
    };
    await setDoc(listRef, listData);
    return listRef.id;
  },

  async addMovieToWatchlist(watchlistId: string, movie: { id: string; title: string; poster_path: string; type: 'movie' | 'tv' }, profile: any): Promise<void> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const listRef = doc(db, 'collaborative_watchlists', watchlistId);
    
    const key = `movies.${movie.id}`;
    const updateData = {
      [key]: {
        tmdbId: movie.id,
        title: movie.title,
        posterPath: movie.poster_path,
        type: movie.type,
        addedBy: currentUid,
        addedByName: profile?.name || 'Friend',
        votes: { [currentUid]: 'up' }, // Auto upvote by creator
        voteCount: 1
      }
    };
    await setDoc(listRef, updateData, { merge: true });
  },

  async voteOnMovie(watchlistId: string, movieId: string, voteType: 'up' | 'down' | null): Promise<void> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const listRef = doc(db, 'collaborative_watchlists', watchlistId);
    const listSnap = await getDoc(listRef);
    if (!listSnap.exists()) return;
    
    const data = listSnap.data() as CollaborativeWatchlist;
    const movie = data.movies[movieId];
    if (!movie) return;
    
    const votes = { ...movie.votes };
    if (voteType === null) {
      delete votes[currentUid];
    } else {
      votes[currentUid] = voteType;
    }
    
    let voteCount = 0;
    Object.values(votes).forEach(v => {
      if (v === 'up') voteCount += 1;
      if (v === 'down') voteCount -= 1;
    });
    
    const key = `movies.${movieId}`;
    await setDoc(listRef, {
      [key]: {
        ...movie,
        votes,
        voteCount
      }
    }, { merge: true });
  },

  subscribeToCollaborativeWatchlists(callback: (lists: CollaborativeWatchlist[]) => void) {
    const currentUid = auth.currentUser?.uid || 'guest';
    const q = query(
      collection(db, 'collaborative_watchlists'),
      where('members', 'array-contains', currentUid),
      limit(10)
    );
    
    return onSnapshot(q, (snapshot) => {
      const lists: CollaborativeWatchlist[] = [];
      snapshot.forEach(doc => {
        lists.push(doc.data() as CollaborativeWatchlist);
      });
      
      if (lists.length === 0) {
        callback([
          {
            id: 'mock_watchlist_1',
            name: '🍿 Friday Binge Party',
            createdBy: 'friend_alex',
            createdByName: 'Alex Johnson',
            createdAt: new Date(),
            members: [currentUid, 'friend_alex', 'friend_marcus'],
            movies: {
              '66732': {
                tmdbId: '66732',
                title: 'Stranger Things',
                posterPath: '/rt8J4-R1.jpg',
                type: 'tv',
                addedBy: 'friend_alex',
                addedByName: 'Alex Johnson',
                votes: { 'friend_alex': 'up', 'friend_marcus': 'up' },
                voteCount: 2
              },
              '119051': {
                tmdbId: '119051',
                title: 'Wednesday',
                posterPath: '/rt8J4-R1.jpg',
                type: 'tv',
                addedBy: 'friend_marcus',
                addedByName: 'Marcus Vance',
                votes: { 'friend_marcus': 'up' },
                voteCount: 1
              }
            }
          }
        ]);
        return;
      }
      
      callback(lists);
    }, (err) => {
      console.warn('[FriendsService] Error subscribing to watchlists:', err);
      callback([]);
    });
  },

  /* ── TASTE MATCH CALCULATOR ── */
  async getTasteMatchScore(friendUid: string): Promise<{ score: number; matchingGenres: string[]; recommendedTitles: any[] }> {
    const currentUid = auth.currentUser?.uid || 'guest';
    const seed = (currentUid + friendUid).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const score = 75 + (seed % 21); // Score between 75 and 95
    
    const genres = ['Sci-Fi', 'Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Anime'];
    const genre1 = genres[seed % genres.length];
    const genre2 = genres[(seed + 3) % genres.length];
    const matchingGenres = [genre1, genre2];
    
    const recommendations: any[] = [];
    const { fetchMovieDetails } = require('./tmdb');
    
    const titlesSeed = [
      { tmdbId: '66732', type: 'tv' }, // Stranger Things
      { tmdbId: '119051', type: 'tv' }, // Wednesday
      { tmdbId: '90405', type: 'tv' }, // The Witcher
    ];
    
    const selectedTitle = titlesSeed[seed % titlesSeed.length];
    try {
      const details = await fetchMovieDetails(selectedTitle.tmdbId, selectedTitle.type);
      if (details) {
        recommendations.push({
          ...details,
          media_type: selectedTitle.type
        });
      }
    } catch (_) {}
    
    return {
      score,
      matchingGenres,
      recommendedTitles: recommendations
    };
  }
};
