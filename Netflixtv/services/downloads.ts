import * as FileSystem from 'expo-file-system/legacy';
import { resolveStreamFromCloud } from './cloudResolver';
import { NativeModules } from 'react-native';
const DownloadService = NativeModules.DownloadService;

export interface DownloadItem {
  id: string;
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
  downloadedBytes?: number;
}

export interface VidLinkStream {
  url: string;
  headers: Record<string, string>;
}

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const METADATA_FILE = `${DOWNLOADS_DIR}metadata.json`;
const MAX_METADATA_BYTES = 512 * 1024; // 512 KB safety cap

// ─── In-memory cache to avoid repeated disk I/O ─────────────────────
let _cache: DownloadItem[] | null = null;
let _dirty = false;

const ensureDirExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
};

// ─── Metadata persistence (OOM-safe) ────────────────────────────────

/**
 * Saves metadata to disk. Uses in-memory cache to minimise I/O.
 */
export const saveMetadata = async (items: DownloadItem[]) => {
  _cache = items;
  _dirty = true;
  await ensureDirExists();
  try {
    const json = JSON.stringify(items);
    // Guard: refuse to write if too large (likely corruption)
    if (json.length > MAX_METADATA_BYTES) {
      console.warn(`[DownloadService] Metadata too large (${json.length} bytes), pruning failed entries`);
      const pruned = items.filter(i => i.status !== 'failed');
      const prunedJson = JSON.stringify(pruned);
      await FileSystem.writeAsStringAsync(METADATA_FILE, prunedJson);
      _cache = pruned;
      return;
    }
    await FileSystem.writeAsStringAsync(METADATA_FILE, json);
    _dirty = false;
  } catch (err) {
    console.error('[DownloadService] Save error:', err);
  }
};

/**
 * Loads metadata. Returns cached copy when available to prevent OOM
 * from reading a corrupt / huge file repeatedly.
 */
export const loadMetadata = async (): Promise<DownloadItem[]> => {
  if (_cache !== null) return _cache;

  try {
    await ensureDirExists();
    const fileInfo = await FileSystem.getInfoAsync(METADATA_FILE);
    if (!fileInfo.exists) {
      _cache = [];
      return [];
    }

    // Pre-flight size check — refuse to read files over safety cap
    if ('size' in fileInfo && (fileInfo as any).size > MAX_METADATA_BYTES) {
      console.error(`[DownloadService] metadata.json is ${(fileInfo as any).size} bytes — too large, resetting.`);
      await FileSystem.deleteAsync(METADATA_FILE, { idempotent: true });
      _cache = [];
      return [];
    }

    const content = await FileSystem.readAsStringAsync(METADATA_FILE);
    const parsed = JSON.parse(content);
    _cache = Array.isArray(parsed) ? parsed : [];
    return _cache;
  } catch (error) {
    console.error('[DownloadService] Error loading metadata, resetting:', error);
    // If the file is corrupt / causes OOM, nuke it so the app can recover
    try {
      await FileSystem.deleteAsync(METADATA_FILE, { idempotent: true });
    } catch (_) {}
    _cache = [];
    return [];
  }
};

/** Force-refresh cache from disk (used by UI polling). */
export const refreshMetadataCache = async (): Promise<DownloadItem[]> => {
  _cache = null;
  return loadMetadata();
};

/** Invalidate cache so next load reads from disk. */
export const invalidateCache = () => { _cache = null; };

// ─── Download link resolution (Cloud Function) ─────────────────────

export const getDownloadLink = async (
  id: string,
  title: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number,
  primaryId?: string,
  year?: string
): Promise<{ url: string; headers: Record<string, string> } | null> => {
  try {
    const result = await resolveStreamFromCloud(id, type, season, episode);
    if (result?.url) {
      return { url: result.url, headers: result.headers || {} };
    }
  } catch (error) {
    console.error('[DownloadService] Cloud resolver error:', error);
  }
  return null;
};

// ─── Core download logic ────────────────────────────────────────────

export const downloadVideo = async (
  tmdbId: string,
  title: string,
  type: 'movie' | 'tv',
  image: string,
  season?: number,
  episode?: number,
  primaryId?: string,
  year?: string,
  onProgress?: (progress: number) => void,
  resolvedStream?: VidLinkStream
) => {
  await ensureDirExists();

  const downloadId = `${tmdbId}_${type}${season ? `_s${season}` : ''}${episode ? `_e${episode}` : ''}`;
  const extension = 'mp4';
  const filename = `${downloadId}.${extension}`;
  const localUri = `${DOWNLOADS_DIR}${filename}`;

  // Resolve link
  let linkData: { url: string; headers: Record<string, string> } | null = null;
  if (resolvedStream) {
    linkData = { url: resolvedStream.url, headers: resolvedStream.headers };
  } else {
    linkData = await getDownloadLink(tmdbId, title, type, season, episode, primaryId, year);
  }
  if (!linkData) throw new Error('Could not find a download link.');

  if (linkData.url.includes('.m3u8')) {
    return await downloadHlsVideo(downloadId, linkData.url, linkData.headers, localUri, tmdbId, title, type, image, season, episode, onProgress);
  }

  // Start native foreground service
  try {
    DownloadService.startForeground(type === 'tv' ? `${title} S${season}E${episode}` : title);
  } catch (e) {
    console.error('[DownloadService] Native module error:', e);
  }

  // Progress tracking — only persist every 20% to reduce I/O pressure
  let lastSavedPct = -1;
  const downloadResumable = FileSystem.createDownloadResumable(
    linkData.url,
    localUri,
    { headers: linkData.headers },
    (dp) => {
      const totalExpected = dp.totalBytesExpectedToWrite;
      const written = dp.totalBytesWritten;
      const progress = totalExpected > 0 ? written / totalExpected : 0;
      if (onProgress) onProgress(progress);

      // Lightweight in-memory update (no disk I/O)
      if (_cache) {
        const entry = _cache.find(i => i.id === downloadId);
        if (entry) {
          entry.progress = progress;
          entry.downloadedBytes = written;
          if (totalExpected > 0) entry.totalSize = totalExpected;
        }
      }

      // Persist to disk every ~20%
      const pct = Math.floor(progress * 5);
      if (pct > lastSavedPct && _cache) {
        lastSavedPct = pct;
        saveMetadata(_cache).catch(() => {});
      }

      // Update native foreground notification progress
      try {
        DownloadService.updateProgress(
            type === 'tv' ? `${title} S${season}E${episode}` : title,
            progress
        );
      } catch (e) {}
    }
  );

  // Register item in metadata
  const items = await loadMetadata();
  const existingIndex = items.findIndex(i => i.id === downloadId);
  const newItem: DownloadItem = {
    id: downloadId,
    tmdbId,
    title: type === 'tv' ? `${title} S${season}E${episode}` : title,
    type, season, episode, image, localUri,
    progress: 0,
    downloadedBytes: 0,
    status: 'downloading',
  };
  if (existingIndex > -1) items[existingIndex] = newItem;
  else items.push(newItem);
  await saveMetadata(items);

  try {
    const result = await downloadResumable.downloadAsync();
    if (result) {
      let fileSize = 0;
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists && 'size' in info) fileSize = (info as any).size ?? 0;
      } catch (_) {}
      if (!fileSize && result.headers?.['content-length']) {
        fileSize = parseInt(result.headers['content-length'], 10) || 0;
      }
      const updatedItems = await loadMetadata();
      const item = updatedItems.find(i => i.id === downloadId);
      if (item) {
        item.status = 'completed';
        item.progress = 1;
        item.downloadedBytes = fileSize;
        item.totalSize = fileSize || item.totalSize || 0;
        await saveMetadata(updatedItems);
      }
      return result;
    }
  } catch (error) {
    const updatedItems = await loadMetadata();
    const item = updatedItems.find(i => i.id === downloadId);
    if (item) {
      item.status = 'failed';
      await saveMetadata(updatedItems);
    }
    throw error;
  } finally {
    // Stop native foreground service
    try {
      DownloadService.stopForeground();
    } catch (e) {}
  }
};

// ─── Delete & Cleanup ───────────────────────────────────────────────

export const deleteDownload = async (id: string) => {
  const items = await loadMetadata();
  const item = items.find(i => i.id === id);
  if (item) {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      // Also delete segments folder if it exists (HLS)
      const segmentsDir = `${item.localUri}_segments/`;
      const dirInfo = await FileSystem.getInfoAsync(segmentsDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(segmentsDir, { idempotent: true });
      }
    } catch (error) {
      console.error('[DownloadService] Error deleting file:', error);
    }
  }
  const filtered = items.filter(i => i.id !== id);
  await saveMetadata(filtered);
};

export const deleteAllDownloads = async () => {
  const items = await loadMetadata();
  for (const item of items) {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      const segmentsDir = `${item.localUri}_segments/`;
      const dirInfo = await FileSystem.getInfoAsync(segmentsDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(segmentsDir, { idempotent: true });
      }
    } catch (_) {}
  }
  await saveMetadata([]);
};

/**
 * Check if a partially-downloaded file exists and is playable (>30%).
 */
export const canPreview = (item: DownloadItem): boolean => {
  return (
    item.progress >= 0.3 &&
    (item.status === 'downloading' || item.status === 'completed')
  );
};

/**
 * Get the local URI for playback — works for both completed and partial downloads.
 */
export const getPlaybackUri = (item: DownloadItem): string | null => {
  if (item.status === 'completed') return item.localUri;
  if (canPreview(item)) return item.localUri;
  return null;
};

/**
 * Handles multi-segment HLS downloading.
 * Fetches the m3u8, parses all .ts segments, and downloads them in parallel batches.
 * Rewrites the playlist to point to local segment files for offline playback.
 */
async function downloadHlsVideo(
  downloadId: string,
  url: string,
  headers: Record<string, string>,
  localUri: string,
  tmdbId: string,
  title: string,
  type: 'movie' | 'tv',
  image: string,
  season?: number,
  episode?: number,
  onProgress?: (progress: number) => void
) {
  try {
    const segmentsDir = `${localUri}_segments/`;
    await FileSystem.makeDirectoryAsync(segmentsDir, { intermediates: true });

    // 1. Fetch the master or media playlist
    const response = await fetch(url, { headers });
    let m3u8Content = await response.text();

    // Handle Master Playlist (pick best variant - 720p/1080p)
    if (m3u8Content.includes('#EXT-X-STREAM-INF')) {
      const lines = m3u8Content.split('\n');
      let bestUrl = '';
      let maxBandwidth = 0;
      
      for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('#EXT-X-STREAM-INF')) {
              const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
              const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
              const variantUrl = lines[i+1]?.trim();
              if (variantUrl && bandwidth > maxBandwidth) {
                  maxBandwidth = bandwidth;
                  bestUrl = variantUrl;
              }
          }
      }
      
      if (bestUrl) {
          const resolvedBestUrl = bestUrl.startsWith('http') ? bestUrl : new URL(bestUrl, url).toString();
          const res = await fetch(resolvedBestUrl, { headers });
          m3u8Content = await res.text();
          url = resolvedBestUrl; // Update base URL for segments
      }
    }

    // 2. Extract segments and prepare local M3U8
    const lines = m3u8Content.split('\n');
    const segmentUrls: string[] = [];
    const localLines: string[] = [];
    let segmentCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const segmentUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, url).toString();
        const segmentFilename = `seg_${segmentCount}.ts`;
        segmentUrls.push(segmentUrl);
        // Use relative path for the local M3U8 so it's portable
        const segFolderName = `${downloadId}.mp4_segments`;
        localLines.push(`./${segFolderName}/${segmentFilename}`); 
        segmentCount++;
      } else {
        localLines.push(line);
      }
    }

    if (segmentUrls.length === 0) throw new Error('No segments found in playlist.');

    // 3. Register in metadata
    const items = await loadMetadata();
    const newItem: DownloadItem = {
      id: downloadId, tmdbId, title, type, season, episode, image,
      localUri, progress: 0, status: 'downloading',
    };
    const existingIdx = items.findIndex(i => i.id === downloadId);
    if (existingIdx > -1) items[existingIdx] = newItem; else items.push(newItem);
    await saveMetadata(items);

    // 4. Download segments in batches to avoid overwhelming the bridge/memory
    const batchSize = 3;
    let downloadedCount = 0;
    let totalSizeAccumulated = 0;

    for (let i = 0; i < segmentUrls.length; i += batchSize) {
      const batch = segmentUrls.slice(i, i + batchSize);
      await Promise.all(batch.map(async (segUrl, idx) => {
        const segIndex = i + idx;
        const segTarget = `${segmentsDir}seg_${segIndex}.ts`;
        try {
          const res = await FileSystem.downloadAsync(segUrl, segTarget, { headers });
          downloadedCount++;
          if (res.headers['content-length']) totalSizeAccumulated += parseInt(res.headers['content-length']);
          
          const progress = downloadedCount / segmentUrls.length;
          if (onProgress) onProgress(progress);

          // Update native foreground notification progress
          try {
            DownloadService.updateProgress(
                type === 'tv' ? `${title} S${season}E${episode}` : title,
                progress
            );
          } catch (e) {}

          // Update cache & persist occasionally
          if (_cache) {
            const entry = _cache.find(it => it.id === downloadId);
            if (entry) {
              entry.progress = progress;
              entry.totalSize = totalSizeAccumulated;
            }
          }
          // Save every 20 segments to keep metadata fresh
          if (downloadedCount % 20 === 0 && _cache) await saveMetadata(_cache);
        } catch (err) {
          console.error(`[DownloadService] Segment ${segIndex} failed:`, err);
        }
      }));
    }

    // 5. Finalise: Write local M3U8 to the main localUri
    const localM3U8 = localLines.join('\n');
    await FileSystem.writeAsStringAsync(localUri, localM3U8);

    const finalItems = await loadMetadata();
    const finalItem = finalItems.find(it => it.id === downloadId);
    if (finalItem) {
      finalItem.status = 'completed';
      finalItem.progress = 1;
      finalItem.totalSize = totalSizeAccumulated || (segmentUrls.length * 1024 * 512); 
      await saveMetadata(finalItems);
    }
  } catch (error) {
    console.error('[DownloadService] HLS Download failed:', error);
    const updatedItems = await loadMetadata();
    const item = updatedItems.find(i => i.id === downloadId);
    if (item) {
      item.status = 'failed';
      await saveMetadata(updatedItems);
    }
  }
}
