import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const KEYS = [
  ['a', 'b', 'c', 'd', 'e', 'f'],
  ['g', 'h', 'i', 'j', 'k', 'l'],
  ['m', 'n', 'o', 'p', 'q', 'r'],
  ['s', 't', 'u', 'v', 'w', 'x'],
  ['y', 'z', '1', '2', '3', '4'],
  ['5', '6', '7', '8', '9', '0'],
  ['@', '.', '-', '_', '/', '\\'],
];

export default function TvKeyboard({ onKeyPress, onBackspace, onClear }: KeyboardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable 
          style={({ focused }) => [styles.specialKey, focused && styles.focusedKey]}
          onPress={() => onKeyPress(' ')}
        >
          {({ focused }) => (
            <View style={[styles.spaceBarSymbol, focused && { backgroundColor: 'black' }]} />
          )}
        </Pressable>
        <Pressable 
          style={({ focused }) => [styles.specialKey, focused && styles.focusedKey]}
          onPress={onBackspace}
        >
          {({ focused }) => (
            <Ionicons name="backspace-outline" size={24} color={focused ? 'black' : 'white'} />
          )}
        </Pressable>
        <Pressable 
          style={({ focused }) => [styles.specialKey, focused && styles.focusedKey]}
          onPress={onClear}
        >
          {({ focused }) => (
            <Ionicons name="close-circle-outline" size={24} color={focused ? 'black' : 'white'} />
          )}
        </Pressable>
      </View>

      {KEYS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              style={({ focused }) => [styles.key, focused && styles.focusedKey]}
              onPress={() => onKeyPress(key)}
            >
              {({ focused }) => (
                <Text style={[styles.keyText, focused && styles.keyTextFocused]}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 10,
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  key: {
    flex: 1,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  specialKey: {
    flex: 1,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focusedKey: {
    backgroundColor: 'rgba(255,255,255,1)',
    borderColor: '#E50914', // Netflix Red accent
  },
  keyText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 22,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  keyTextFocused: {
    color: '#000',
  },
  spaceBarSymbol: {
    width: 24,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 2,
  }
});
