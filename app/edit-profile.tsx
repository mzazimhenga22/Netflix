import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Switch, ScrollView, Dimensions, Alert } from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useProfile } from '../context/ProfileContext';

const { width } = Dimensions.get('window');

const AVATARS = [
  { id: 'avatar1', source: require('../assets/avatars/avatar1.png'), isKids: false },
  { id: 'avatar2', source: require('../assets/avatars/avatar2.png'), isKids: false },
  { id: 'avatar3', source: require('../assets/avatars/avatar3.png'), isKids: false },
  { id: 'avatar4', source: require('../assets/avatars/avatar4.png'), isKids: false },
  { id: 'avatar5', source: require('../assets/avatars/avatar5.png'), isKids: true },
  { id: 'avatar6', source: require('../assets/avatars/avatar6.png'), isKids: false },
  { id: 'avatar7', source: require('../assets/avatars/avatar7.png'), isKids: false },
  { id: 'avatar8', source: require('../assets/avatars/avatar8.png'), isKids: true },
  { id: 'avatar9', source: require('../assets/avatars/avatar9.png'), isKids: true },
  { id: 'avatar10', source: require('../assets/avatars/avatar10.png'), isKids: true },
];

const STANDARD_AVATARS = AVATARS.filter(a => !a.isKids);
const KIDS_AVATARS = AVATARS.filter(a => a.isKids);

export default function EditProfileScreen() {
  const router = useRouter();
  const { id, name: initialName, avatarId: initialAvatarId } = useLocalSearchParams();
  const { addProfile, updateProfile, deleteProfile, canAddProfile, maxProfilesAllowed, profiles } = useProfile();
  
  const existingProfile = React.useMemo(() => profiles.find(p => p.id === id), [profiles, id]);
  
  const [name, setName] = useState(existingProfile?.name || (initialName as string) || '');
  const [selectedAvatarId, setSelectedAvatarId] = useState(existingProfile?.avatarId || (initialAvatarId as string) || 'avatar1');
  const [isKids, setIsKids] = useState(existingProfile?.isKids || false);
  const [isLocked, setIsLocked] = useState(existingProfile?.isLocked || false);
  const [pin, setPin] = useState(existingProfile?.pin || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Protect against direct navigation when limit is reached
  React.useEffect(() => {
    if (!id && !canAddProfile) {
      Alert.alert(
        'Profile Limit Reached',
        `Your plan only allows ${maxProfilesAllowed} profiles.\nUpgrade to add more.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [id, canAddProfile]);

  const selectedAvatar = AVATARS.find(a => a.id === selectedAvatarId)?.source || AVATARS[0].source;

  const handleSave = () => {
    if (!name.trim()) return;
    
    if (isLocked && pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Please enter a 4-digit PIN to lock this profile.');
      return;
    }

    if (id) {
      updateProfile(id as string, name, selectedAvatarId, isLocked, pin, isKids);
    } else {
      addProfile(name, selectedAvatarId, isLocked, pin, isKids);
    }
    router.back();
  };

  const handleDelete = () => {
    if (id) {
      deleteProfile(id as string);
      router.back();
    }
  };

  if (showAvatarPicker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setShowAvatarPicker(false)} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
          <Text style={styles.headerTitle}>Choose Avatar</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView>
          <Text style={styles.avatarSectionTitle}>Standard</Text>
          <View style={styles.avatarGrid}>
            {STANDARD_AVATARS.map((avatar) => (
              <Pressable 
                key={avatar.id} 
                onPress={() => {
                  setSelectedAvatarId(avatar.id);
                  setShowAvatarPicker(false);
                }}
                style={[
                  styles.avatarOption,
                  selectedAvatarId === avatar.id && styles.selectedAvatarOption
                ]}
              >
                <Image source={avatar.source} style={styles.avatarLarge} />
              </Pressable>
            ))}
          </View>
          
          <Text style={styles.avatarSectionTitle}>Kids Theme</Text>
          <View style={[styles.avatarGrid, { paddingTop: 0 }]}>
            {KIDS_AVATARS.map((avatar) => (
              <Pressable 
                key={avatar.id} 
                onPress={() => {
                  setSelectedAvatarId(avatar.id);
                  setShowAvatarPicker(false);
                }}
                style={[
                  styles.avatarOption,
                  selectedAvatarId === avatar.id && styles.selectedAvatarOption
                ]}
              >
                <Image source={avatar.source} style={styles.avatarLarge} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ 
        title: id ? 'Edit Profile' : 'Create Profile',
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: 'white',
        headerShown: true,
        headerLeft: () => (
          <Pressable onPress={() => router.back()}>
            <Text style={styles.navText}>Cancel</Text>
          </Pressable>
        ),
        headerRight: () => (
          <Pressable onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        ),
      }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <Pressable onPress={() => setShowAvatarPicker(true)} style={styles.avatarWrapper}>
            <Image source={selectedAvatar} style={styles.currentAvatar} />
            <View style={styles.editIconBadge}>
              <Feather name="edit-2" size={16} color="white" />
            </View>
          </Pressable>
          <Text style={styles.changeText}>Change Avatar</Text>
        </View>

        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Profile Name"
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>For Kids</Text>
            <Text style={styles.settingDesc}>Only show titles with maturity ratings for kids.</Text>
          </View>
          <Switch
            value={isKids}
            onValueChange={setIsKids}
            trackColor={{ false: '#333', true: '#E50914' }}
            thumbColor="white"
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Maturity Rating</Text>
            <Text style={styles.settingDesc}>All Maturity Ratings</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Profile Lock</Text>
            <Text style={styles.settingDesc}>Require a 4-digit PIN to access this profile.</Text>
          </View>
          <Switch
            value={isLocked}
            onValueChange={(val) => {
              setIsLocked(val);
              if (!val) setPin(''); 
            }}
            trackColor={{ false: '#333', true: '#E50914' }}
            thumbColor="white"
          />
        </View>

        {isLocked && (
          <View style={styles.pinInputContainer}>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))}
              placeholder="Enter 4-digit PIN"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
          </View>
        )}

        {id && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.deleteText}>Delete Profile</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 60,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  navText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 15,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 15,
  },
  content: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarWrapper: {
    position: 'relative',
  },
  currentAvatar: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  editIconBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  changeText: {
    color: 'white',
    marginTop: 10,
    fontSize: 14,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 20,
  },
  avatarSectionTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: -5,
  },
  avatarOption: {
    width: (width - 80) / 3,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  selectedAvatarOption: {
    borderColor: COLORS.primary,
  },
  avatarLarge: {
    width: '100%',
    height: '100%',
  },
  inputSection: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 30,
  },
  input: {
    color: 'white',
    fontSize: 18,
    paddingVertical: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 50,
    gap: 10,
  },
  deleteText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  pinInputContainer: {
    width: '100%',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  pinInput: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 20,
    fontWeight: 'bold',
  }
});
