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
          <View style={styles.spaceBarSymbol} />
        </Pressable>
        <Pressable 
          style={({ focused }) => [styles.specialKey, focused && styles.focusedKey]}
          onPress={onBackspace}
        >
          <Ionicons name="backspace-outline" size={24} color="white" />
        </Pressable>
        <Pressable 
          style={({ focused }) => [styles.specialKey, focused && styles.focusedKey]}
          onPress={onClear}
        >
          <Ionicons name="close-circle-outline" size={24} color="white" />
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
              <Text style={styles.keyText}>{key}</Text>
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
    gap: 8,
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 15,
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialKey: {
    flex: 1,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedKey: {
    backgroundColor: 'white',
    transform: [{ scale: 1.1 }],
  },
  keyText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  spaceBarSymbol: {
    width: 30,
    height: 4,
    backgroundColor: 'white',
    borderRadius: 2,
    marginTop: 10,
  }
});
