import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  Dimensions, 
  FlatList,
  Switch
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useProfile } from '../context/ProfileContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

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
  const { id, name: initialName, avatarId: initialAvatarId } = useLocalSearchParams();
  const { profiles, addProfile, updateProfile, deleteProfile, canAddProfile } = useProfile();
  
  const [name, setName] = useState((initialName as string) || '');
  const [selectedAvatarId, setSelectedAvatarId] = useState((initialAvatarId as string) || 'avatar1');
  const [isKids, setIsKids] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [maturityLevel, setMaturityLevel] = useState<'G' | 'PG' | 'TV-14' | 'MA'>('MA');

  // Load existing data if editing
  useEffect(() => {
    if (id) {
      const p = profiles.find(p => p.id === id);
      if (p) {
        setName(p.name);
        setSelectedAvatarId(p.avatarId);
        setIsKids(p.isKids || false);
        setIsLocked(p.isLocked || false);
        setPin(p.pin || '');
        setMaturityLevel(p.maturityLevel || (p.isKids ? 'G' : 'MA'));
      }
    }
  }, [id, profiles]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [focusedBtn, setFocusedBtn] = useState<string | null>(null);

  const selectedAvatar = AVATARS.find(a => a.id === selectedAvatarId)?.source || AVATARS[0].source;

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!id && !canAddProfile) {
      router.replace('/profiles');
      return;
    }
    try {
      if (id) {
         await updateProfile(id as string, name, selectedAvatarId, isLocked, pin, isKids, maturityLevel);
      } else {
         await addProfile(name, selectedAvatarId, isLocked, pin, isKids, maturityLevel);
      }
      router.replace('/profiles');
    } catch (err) {
      console.error('[EditProfile] Save failed. Ensure you have a network connection.');
    }
  };

  const handleDelete = () => {
    if (id) {
      deleteProfile(id as string);
      router.replace('/profiles');
    }
  };

  if (showAvatarPicker) {
    return (
      <View style={styles.container}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity 
            onFocus={() => setFocusedBtn('back-picker')}
            onPress={() => setShowAvatarPicker(false)}
            style={[styles.backBtn, focusedBtn === 'back-picker' && styles.btnFocused]}
          >
            <Ionicons name="arrow-back" size={32} color="white" />
          </TouchableOpacity>
          <Text style={styles.title}>Choose an Avatar</Text>
        </View>

        <FlatList
          data={AVATARS}
          numColumns={5}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.avatarList}
          renderItem={({ item }) => (
            <TouchableOpacity
              onFocus={() => setFocusedBtn(item.id)}
              onPress={() => {
                setSelectedAvatarId(item.id);
                setShowAvatarPicker(false);
              }}
              style={[
                styles.avatarOption,
                selectedAvatarId === item.id && styles.avatarSelected,
                focusedBtn === item.id && styles.avatarFocused
              ]}
            >
              <Image source={item.source} style={styles.avatarImg} contentFit="cover" />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#141414', '#000']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity 
          onFocus={() => setFocusedBtn('cancel')}
          onPress={() => router.replace('/profiles')}
          style={[styles.headerBtn, focusedBtn === 'cancel' && styles.btnFocused]}
        >
          <Text style={styles.btnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{id ? 'Edit Profile' : 'Create Profile'}</Text>
        <TouchableOpacity 
          onFocus={() => setFocusedBtn('save')}
          onPress={handleSave}
          style={[styles.headerBtn, focusedBtn === 'save' && styles.btnFocused]}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.leftPane}>
          <TouchableOpacity 
            onFocus={() => setFocusedBtn('avatar')}
            onPress={() => setShowAvatarPicker(true)}
            style={[styles.avatarWrapper, focusedBtn === 'avatar' && styles.avatarWrapperFocused]}
          >
            <Image source={selectedAvatar} style={styles.currentAvatar} contentFit="cover" />
            <View style={styles.editIconOverlay}>
              <MaterialIcons name="edit" size={24} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={styles.label}>Change Avatar</Text>
        </View>

        <View style={styles.rightPane}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, focusedBtn === 'name' && styles.inputFocused]}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedBtn('name')}
              placeholder="Enter name"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>

          <View style={styles.settingRow}>
             <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Kids Profile</Text>
                <Text style={styles.settingDesc}>Only show movies and TV shows for kids.</Text>
             </View>
             <Switch 
               value={isKids} 
               onValueChange={setIsKids}
               trackColor={{ false: '#333', true: '#E50914' }}
               thumbColor="#fff"
             />
          </View>

          <View style={styles.settingRow}>
             <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Profile Lock</Text>
                <Text style={styles.settingDesc}>Require a 4-digit PIN to access this profile.</Text>
             </View>
             <Switch 
               value={isLocked} 
               onValueChange={(val) => {
                 setIsLocked(val);
                 if (val && !pin) setPin('1234'); // Default PIN if enabling
               }}
               trackColor={{ false: '#333', true: '#E50914' }}
               thumbColor="#fff"
             />
          </View>

          {isLocked && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Profile PIN</Text>
              <TextInput
                style={[styles.input, focusedBtn === 'pin' && styles.inputFocused]}
                value={pin}
                onChangeText={(val) => setPin(val.replace(/[^0-9]/g, '').slice(0, 4))}
                onFocus={() => setFocusedBtn('pin')}
                placeholder="4-digit PIN"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numeric"
              />
            </View>
          )}

          {!isKids && (
            <View style={styles.settingContainer}>
              <Text style={styles.label}>Maturity Rating</Text>
              <Text style={styles.settingDesc}>Limit this profile to certain age ratings.</Text>
              <View style={styles.ratingPicker}>
                {['G', 'PG', 'TV-14', 'MA'].map((level) => (
                  <TouchableOpacity
                    key={level}
                    onFocus={() => setFocusedBtn(`maturity-${level}`)}
                    onPress={() => setMaturityLevel(level as any)}
                    style={[
                      styles.ratingOption,
                      maturityLevel === level && styles.ratingSelected,
                      focusedBtn === `maturity-${level}` && styles.btnFocused
                    ]}
                  >
                    <Text style={[
                      styles.ratingOptionText, 
                      maturityLevel === level && { color: 'white', fontWeight: 'bold' },
                      focusedBtn === `maturity-${level}` && { color: 'black' }
                    ]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
            <TouchableOpacity 
              onFocus={() => setFocusedBtn('delete')}
              onPress={handleDelete}
              style={[styles.deleteBtn, focusedBtn === 'delete' && styles.btnFocused]}
            >
              <Ionicons name="trash-outline" size={24} color="rgba(255,255,255,0.6)" />
              <Text style={styles.deleteText}>Delete Profile</Text>
            </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 60,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    marginBottom: 40,
  },
  backBtn: {
    padding: 10,
    borderRadius: 50,
  },
  headerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnFocused: {
    backgroundColor: '#fff',
  },
  btnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  saveBtnText: {
    color: '#E50914',
    fontSize: 20,
    fontWeight: 'bold',
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 80,
  },
  leftPane: {
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 200,
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'transparent',
    marginBottom: 20,
  },
  avatarWrapperFocused: {
    borderColor: '#fff',
    transform: [{ scale: 1.05 }],
  },
  currentAvatar: {
    width: '100%',
    height: '100%',
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightPane: {
    flex: 1,
    gap: 40,
  },
  inputContainer: {
    gap: 15,
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 24,
    padding: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  settingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  settingDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    marginTop: 5,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 15,
    alignSelf: 'flex-start',
    borderRadius: 4,
  },
  deleteText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    fontWeight: '600',
  },
  avatarList: {
    paddingBottom: 40,
  },
  avatarOption: {
    width: (width - 200) / 5,
    aspectRatio: 1,
    margin: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'transparent',
  },
  avatarSelected: {
    borderColor: '#E50914',
  },
  avatarFocused: {
    borderColor: '#fff',
    transform: [{ scale: 1.1 }],
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  settingContainer: {
    gap: 10,
    marginTop: 20,
  },
  ratingPicker: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  ratingOption: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ratingSelected: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  ratingOptionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '600',
  }
});
