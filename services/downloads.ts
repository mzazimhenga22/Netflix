import * as FileSystem from 'expo-file-system';
import { fetchStreamingLinks } from './streaming';
import { fetchNetMirrorStream } from './netmirror';

export interface DownloadItem {
  id: string; // Unique ID (e.g., tmdbId + type + season + episode)
  tmdbId: string;
  title: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  image: string;
  localUri: string;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
  totalSize?: number;
}

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const METADATA_FILE = `${DOWNLOADS_DIR}metadata.json`;

/**
 * Ensures the download directory exists.
 */
const ensureDirExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
};

/**
 * Fetches the best available download link using the same logic as streaming.
 */
export const getDownloadLink = async (
  id: string,
  title: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number,
  primaryId?: string,
  year?: string
) => {
  const searchTitle = type === 'tv' && episode ? `${title} S${season}E${episode}` : title;
  
  try {
    // 1. Try NetMirror
    const netMirrorResponse = await fetchNetMirrorStream(searchTitle, undefined, primaryId, year);
    if (netMirrorResponse && netMirrorResponse.sources.length > 0) {
      return {
        url: netMirrorResponse.sources[0].url,
        headers: {
          'Referer': 'https://net52.cc/',
          'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
          'Cookie': netMirrorResponse.cookies
        }
      };
    }

    // 2. Try Consumet/Mirrors
    const data = await fetchStreamingLinks(id, type, season, episode);
    if (data && data.sources.length > 0) {
      return {
        url: data.sources[0].url,
        headers: {}
      };
    }
  } catch (error) {
    console.error('[DownloadService] Error fetching link:', error);
  }
  
  return null;
};

/**
 * Saves or updates metadata for downloads.
 */
export const saveMetadata = async (items: DownloadItem[]) => {
  await ensureDirExists();
  await FileSystem.writeAsStringAsync(METADATA_FILE, JSON.stringify(items));
};

/**
 * Loads metadata for downloads.
 */
export const loadMetadata = async (): Promise<DownloadItem[]> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(METADATA_FILE);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(METADATA_FILE);
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[DownloadService] Error loading metadata:', error);
  }
  return [];
};

/**
 * Starts a download for a movie or episode.
 */
export const downloadVideo = async (
  tmdbId: string,
  title: string,
  type: 'movie' | 'tv',
  image: string,
  season?: number,
  episode?: number,
  primaryId?: string,
  year?: string,
  onProgress?: (progress: number) => void
) => {
  await ensureDirExists();
  
  const downloadId = `${tmdbId}_${type}${season ? `_s${season}` : ''}${episode ? `_e${episode}` : ''}`;
  const extension = 'mp4'; // Defaulting to mp4, though it might be m3u8 which is harder to download simple-style
  const filename = `${downloadId}.${extension}`;
  const localUri = `${DOWNLOADS_DIR}${filename}`;
  
  // Get the link
  const linkData = await getDownloadLink(tmdbId, title, type, season, episode, primaryId, year);
  if (!linkData) {
    throw new Error('Could not find a download link.');
  }

  // Check if it's M3U8 (FileSystem.downloadAsync doesn't handle m3u8 segments automatically)
  if (linkData.url.includes('.m3u8')) {
    // For M3U8, we'd normally need a specialized downloader, 
    // but for now let's attempt it or throw an error if we only support direct files.
    // Many Consumet sources ARE m3u8.
    console.warn('[DownloadService] Link is M3U8. Progress might not be accurate or playback might fail if not handled.');
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    linkData.url,
    localUri,
    {
      headers: linkData.headers
    },
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      if (onProgress) onProgress(progress);
      
      // We don't save metadata every byte, but maybe at milestones
    }
  );

  // Add to metadata as downloading
  const items = await loadMetadata();
  const existingIndex = items.findIndex(i => i.id === downloadId);
  const newItem: DownloadItem = {
    id: downloadId,
    tmdbId,
    title: type === 'tv' ? `${title} S${season}E${episode}` : title,
    type,
    season,
    episode,
    image,
    localUri,
    progress: 0,
    status: 'downloading'
  };

  if (existingIndex > -1) {
    items[existingIndex] = newItem;
  } else {
    items.push(newItem);
  }
  await saveMetadata(items);

  try {
    const result = await downloadResumable.downloadAsync();
    if (result) {
      // Update metadata as completed
      const updatedItems = await loadMetadata();
      const item = updatedItems.find(i => i.id === downloadId);
      if (item) {
        item.status = 'completed';
        item.progress = 1;
        item.totalSize = result.headers['content-length'] ? parseInt(result.headers['content-length']) : 0;
        await saveMetadata(updatedItems);
      }
      return result;
    }
  } catch (error) {
    // Update metadata as failed
    const updatedItems = await loadMetadata();
    const item = updatedItems.find(i => i.id === downloadId);
    if (item) {
      item.status = 'failed';
      await saveMetadata(updatedItems);
    }
    throw error;
  }
};

/**
 * Deletes a downloaded video.
 */
export const deleteDownload = async (id: string) => {
  const items = await loadMetadata();
  const item = items.find(i => i.id === id);
  if (item) {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    } catch (error) {
      console.error('[DownloadService] Error deleting file:', error);
    }
    const filteredItems = items.filter(i => i.id !== id);
    await saveMetadata(filteredItems);
  }
};
