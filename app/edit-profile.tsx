import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Switch, ScrollView, Dimensions } from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const AVATARS = [
  { id: 'avatar1', source: require('../assets/avatars/avatar1.png') },
  { id: 'avatar2', source: require('../assets/avatars/avatar2.png') },
  { id: 'avatar3', source: require('../assets/avatars/avatar3.png') },
  { id: 'avatar4', source: require('../assets/avatars/avatar4.png') },
  { id: 'avatar5', source: require('../assets/avatars/avatar5.png') },
  { id: 'avatar6', source: require('../assets/avatars/avatar6.png') },
  { id: 'avatar7', source: require('../assets/avatars/avatar7.png') },
  { id: 'avatar8', source: require('../assets/avatars/avatar8.png') },
  { id: 'avatar9', source: require('../assets/avatars/avatar9.png') },
  { id: 'avatar10', source: require('../assets/avatars/avatar10.png') },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { id, name: initialName, avatar: initialAvatarId } = useLocalSearchParams();
  
  const [name, setName] = useState((initialName as string) || 'Saurabh');
  const [selectedAvatarId, setSelectedAvatarId] = useState((initialAvatarId as string) || 'avatar1');
  const [isKids, setIsKids] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const selectedAvatar = AVATARS.find(a => a.id === selectedAvatarId)?.source || AVATARS[0].source;

  const handleSave = () => {
    // In a real app, update state/DB here
    router.back();
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
        
        <ScrollView contentContainerStyle={styles.avatarGrid}>
          {AVATARS.map((avatar) => (
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Edit Profile',
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

        <Pressable style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color={COLORS.textSecondary} />
          <Text style={styles.deleteText}>Delete Profile</Text>
        </Pressable>
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
    justifyContent: 'center',
    padding: 20,
    gap: 20,
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
  }
});
